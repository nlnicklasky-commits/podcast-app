import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Icons from './Icons'
import { KBGlyph } from './ui'

export default function CommandPalette({ open, onClose, knowledgeBases = [], podcasts = [] }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

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
            placeholder="Search KBs, podcasts, or ask anything..."
            className="flex-1 bg-transparent border-none outline-none text-[15px] text-[var(--text)]"
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose(null)
              if (e.key === 'Enter' && items[0]) handleSelect(items[0])
            }}
          />
          <kbd
            className="text-[10px] mono px-[5px] py-0.5 rounded mute border border-[var(--border)]"
          >
            esc
          </kbd>
        </div>

        <div className="max-h-[380px] overflow-y-auto">
          {items.map((it, i) => (
            <button
              key={`${it.kind}-${it.label}-${i}`}
              onClick={() => handleSelect(it)}
              className={`w-full flex items-center gap-3 px-[18px] py-2.5 text-left transition-colors border-l-2 hover:bg-[var(--surface)] ${
                i === 0
                  ? 'bg-[var(--surface)] border-l-[var(--accent)]'
                  : 'bg-transparent border-l-transparent'
              }`}
            >
              <span className="mute">{it.glyph}</span>
              <span className="flex-1 min-w-0 text-[13.5px] truncate text-[var(--text)]">
                {it.label}
              </span>
              <span className="text-[11px] mono mute">{it.hint}</span>
              <span className="text-[10px] mono mute uppercase tracking-[0.08em]">{it.kind}</span>
            </button>
          ))}
          {items.length === 0 && (
            <div className="p-10 text-center text-[13px] mute">No matches.</div>
          )}
        </div>

        <div
          className="flex gap-4 px-[18px] py-2.5 text-[10px] mono mute border-t border-[var(--border)]"
        >
          <span>↑↓ navigate</span>
          <span>↵ select</span>
        </div>
      </div>
    </div>
  )
}
