import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { semanticSearch } from '../services/search'
import { useAudio } from '../lib/AudioContext'
import useFocusTrap from '../hooks/useFocusTrap'
import * as Icons from './Icons'
import { KBGlyph } from './ui'
import { formatTimestamp } from '../lib/utils'

export default function CommandPalette({ open, onClose, knowledgeBases = [], podcasts = [] }) {
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const { play } = useAudio()
  const trapRef = useFocusTrap(open)
  const isSearchMode = query.startsWith('?') && query.length > 1

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setSearchResults([])
      setSearching(false)
      setActiveIndex(0)
    }
  }, [open])

  const doSemanticSearch = useCallback(async (q) => {
    setSearching(true)
    try {
      const data = await semanticSearch({ query: q, limit: 6, threshold: 0.3 })
      setSearchResults(data.results)
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    if (!isSearchMode) {
      setSearchResults([])
      return
    }
    const searchQuery = query.slice(1).trim()
    if (searchQuery.length < 3) return
    const timer = setTimeout(() => doSemanticSearch(searchQuery), 400)
    return () => clearTimeout(timer)
  }, [query, isSearchMode, doSemanticSearch])

  const items = useMemo(() => {
    const all = [
      ...knowledgeBases.map((kb) => ({
        kind: 'kb',
        label: kb.name,
        hint: `${kb.knowledge_base_podcasts?.[0]?.count ?? 0} eps`,
        path: `/kb/${kb.id}`,
        glyph: <KBGlyph name={kb.name} size={20} />,
      })),
      ...podcasts.slice(0, 10).map((p) => ({
        kind: 'podcast',
        label: p.title || 'Untitled',
        hint: p.channel || '',
        path: `/podcast/${p.id}`,
        glyph: <Icons.Headphones size={14} />,
        podcast: p,
      })),
      {
        kind: 'action',
        label: 'Add podcast...',
        hint: 'search Podcast Index',
        action: 'add-podcast',
        glyph: <Icons.Plus size={14} />,
      },
      {
        kind: 'action',
        label: 'New knowledge base',
        hint: '',
        action: 'new-kb',
        glyph: <Icons.Brain size={14} />,
      },
    ]
    if (!query) return all.slice(0, 8)
    return all
      .filter((it) => it.label.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 8)
  }, [query, knowledgeBases, podcasts])

  function handleSelect(item) {
    if (item.path) {
      navigate(item.path)
    }
    onClose(item.action || null)
  }

  if (!open) return null

  return (
    <div
      onClick={() => onClose(null)}
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] bg-black/50 backdrop-blur-[4px]"
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-[600px] max-w-[92vw] overflow-hidden fade-in bg-[var(--bg-2)] border border-[var(--border)] rounded-[var(--r-lg)] shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
      >
        <div
          className="flex items-center gap-3 px-[18px] py-3.5 border-b border-[var(--border)]"
        >
          <Icons.Search size={16} className="mute" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search KBs, podcasts… or type ? to search transcripts"
            className="flex-1 bg-transparent border-none outline-none text-[15px] text-[var(--text)]"
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose(null)
              if (e.key === 'Enter') {
                if (isSearchMode) {
                  const searchQuery = query.slice(1).trim()
                  if (searchQuery.length >= 3) {
                    navigate(`/search?q=${encodeURIComponent(searchQuery)}`)
                    onClose(null)
                  }
                } else if (items[activeIndex]) {
                  handleSelect(items[activeIndex])
                }
              }
              if (!isSearchMode) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setActiveIndex((prev) => Math.min(prev + 1, items.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActiveIndex((prev) => Math.max(prev - 1, 0))
                }
              }
            }}
          />
          <kbd
            className="text-[10px] mono px-[5px] py-0.5 rounded mute border border-[var(--border)]"
          >
            esc
          </kbd>
        </div>

        <div className="max-h-[380px] overflow-y-auto">
          {isSearchMode ? (
            <>
              {searching && (
                <div className="flex items-center gap-2.5 px-[18px] py-4 text-[13px] mute">
                  <div className="w-3.5 h-3.5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                  Searching transcripts…
                </div>
              )}
              {!searching && searchResults.length > 0 && searchResults.map((r, i) => {
                const kbId = r.knowledge_base_ids?.[0]
                const to = kbId
                  ? `/kb/${kbId}/podcast/${r.podcast_id}?t=${Math.floor(r.start_time || 0)}`
                  : `/podcast/${r.podcast_id}?t=${Math.floor(r.start_time || 0)}`
                return (
                  <button
                    key={r.chunk_id || i}
                    onClick={() => { navigate(to); onClose(null) }}
                    className={`w-full flex items-center gap-3 px-[18px] py-2.5 text-left transition-colors border-l-2 hover:bg-[var(--surface)] ${
                      i === 0
                        ? 'bg-[var(--surface)] border-l-[var(--accent)]'
                        : 'bg-transparent border-l-transparent'
                    }`}
                  >
                    <span className="mute shrink-0">
                      {r.thumbnail_url
                        ? <img src={r.thumbnail_url} alt="" className="w-5 h-5 rounded object-cover" />
                        : <Icons.Headphones size={14} />
                      }
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] truncate">{r.podcast_title}</div>
                      <div className="text-[11px] mute truncate">{r.text?.slice(0, 80)}</div>
                    </div>
                    <span className="text-[11px] mono text-[var(--accent)] shrink-0">
                      {formatTimestamp(r.start_time)}
                    </span>
                    <span className="text-[10px] mono font-semibold px-1 py-0.5 rounded bg-[var(--accent-faint)] text-[var(--accent)] shrink-0">
                      {Math.round(r.similarity * 100)}%
                    </span>
                  </button>
                )
              })}
              {!searching && searchResults.length === 0 && query.slice(1).trim().length >= 3 && (
                <div className="p-10 text-center text-[13px] mute">No transcript matches.</div>
              )}
              {!searching && query.slice(1).trim().length < 3 && (
                <div className="p-10 text-center text-[13px] mute">Type at least 3 characters after ? to search transcripts.</div>
              )}
              {searchResults.length > 0 && (
                <button
                  onClick={() => {
                    navigate(`/search?q=${encodeURIComponent(query.slice(1).trim())}`)
                    onClose(null)
                  }}
                  className="w-full px-[18px] py-2.5 text-[12px] mono text-[var(--accent)] text-center hover:bg-[var(--surface)] transition-colors"
                >
                  View all results →
                </button>
              )}
            </>
          ) : (
            <>
              {items.map((it, i) => (
                <div
                  key={`${it.kind}-${it.label}-${i}`}
                  className={`flex items-center border-l-2 hover:bg-[var(--surface)] transition-colors ${
                    i === activeIndex
                      ? 'bg-[var(--surface)] border-l-[var(--accent)]'
                      : 'bg-transparent border-l-transparent'
                  }`}
                >
                  <button
                    onClick={() => handleSelect(it)}
                    className="flex-1 flex items-center gap-3 px-[18px] py-2.5 text-left min-w-0"
                  >
                    <span className="mute">{it.glyph}</span>
                    <span className="flex-1 min-w-0 text-[13.5px] truncate text-[var(--text)]">
                      {it.label}
                    </span>
                    <span className="text-[11px] mono mute">{it.hint}</span>
                    <span className="text-[10px] mono mute uppercase tracking-[0.08em]">{it.kind}</span>
                  </button>
                  {it.podcast?.enclosure_url && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        play({
                          podcastId: it.podcast.id,
                          title: it.podcast.title,
                          channel: it.podcast.channel,
                          thumbnailUrl: it.podcast.thumbnail_url,
                          enclosureUrl: it.podcast.enclosure_url,
                        })
                        onClose(null)
                      }}
                      className="shrink-0 p-2 mr-2 mute hover:text-[var(--accent)] transition-colors rounded-[var(--r-sm)] hover:bg-[var(--bg)]"
                      title="Play"
                    >
                      <Icons.Play size={12} />
                    </button>
                  )}
                </div>
              ))}
              {items.length === 0 && (
                <div className="p-10 text-center text-[13px] mute">No matches.</div>
              )}
            </>
          )}
        </div>

        <div
          className="flex gap-4 px-[18px] py-2.5 text-[10px] mono mute border-t border-[var(--border)]"
        >
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>? search transcripts</span>
        </div>
      </div>
    </div>
  )
}
