import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { listKnowledgeBases } from '../services/knowledgeBases'
import { semanticSearch, getSearchHistory, deleteSearchHistoryEntry, clearSearchHistory } from '../services/search'
import SearchResultCard from '../components/SearchResultCard'
import * as Icons from '../components/Icons'

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export default function SearchPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const inputRef = useRef(null)

  const initialQuery = searchParams.get('q') || ''
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [queryTimeMs, setQueryTimeMs] = useState(null)
  const [hasSearched, setHasSearched] = useState(false)

  // Filters
  const [scopeType, setScopeType] = useState('all')
  const [scopeId, setScopeId] = useState(null)
  const [threshold, setThreshold] = useState(0.3)
  const [showFilters, setShowFilters] = useState(false)
  const [knowledgeBases, setKnowledgeBases] = useState([])

  // Pagination
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const PAGE_SIZE = 20

  // History
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(true)

  // Keyboard nav
  const [activeIndex, setActiveIndex] = useState(-1)

  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    listKnowledgeBases().then(setKnowledgeBases).catch(console.error)
    getSearchHistory(20).then(setHistory).catch(console.error)
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const doSearch = useCallback(async (q, searchOffset = 0, append = false) => {
    if (!q || q.trim().length < 3) return

    setLoading(true)
    setError(null)
    setActiveIndex(-1)

    try {
      const scope = scopeType === 'all' ? undefined : { type: scopeType, id: scopeId }
      const data = await semanticSearch({
        query: q,
        scope,
        limit: PAGE_SIZE,
        offset: searchOffset,
        threshold,
      })

      setResults((prev) => append ? [...prev, ...data.results] : data.results)
      setQueryTimeMs(data.query_time_ms)
      setHasMore(data.results.length === PAGE_SIZE)
      setHasSearched(true)
      setShowHistory(false)

      if (!append) {
        getSearchHistory(20).then(setHistory).catch(console.error)
      }
    } catch (err) {
      setError(err.message)
      if (!append) setResults([])
    } finally {
      setLoading(false)
    }
  }, [scopeType, scopeId, threshold])

  useEffect(() => {
    if (debouncedQuery.trim().length >= 3) {
      setOffset(0)
      doSearch(debouncedQuery, 0, false)
    } else if (debouncedQuery.trim().length === 0) {
      setResults([])
      setHasSearched(false)
      setShowHistory(true)
      setQueryTimeMs(null)
    }
  }, [debouncedQuery, doSearch])

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && activeIndex < results.length) {
        const r = results[activeIndex]
        const kbId = r.knowledge_base_ids?.[0]
        const to = kbId
          ? `/kb/${kbId}/podcast/${r.podcast_id}?t=${Math.floor(r.start_time || 0)}`
          : `/podcast/${r.podcast_id}?t=${Math.floor(r.start_time || 0)}`
        navigate(to)
      } else if (query.trim().length >= 3) {
        setOffset(0)
        doSearch(query, 0, false)
      }
    } else if (e.key === 'Escape') {
      setQuery('')
      inputRef.current?.blur()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => Math.max(prev - 1, -1))
    }
  }

  function handleLoadMore() {
    const newOffset = offset + PAGE_SIZE
    setOffset(newOffset)
    doSearch(query, newOffset, true)
  }

  function handleHistoryClick(historyQuery) {
    setQuery(historyQuery)
    setOffset(0)
    doSearch(historyQuery, 0, false)
  }

  async function handleHistoryDelete(id) {
    try {
      await deleteSearchHistoryEntry(id)
      setHistory((prev) => prev.filter((h) => h.id !== id))
    } catch (err) {
      console.error(err)
    }
  }

  async function handleClearHistory() {
    try {
      await clearSearchHistory()
      setHistory([])
    } catch (err) {
      console.error(err)
    }
  }

  function handleFindSimilar(text) {
    const snippet = text.slice(0, 200)
    setQuery(snippet)
    setOffset(0)
    doSearch(snippet, 0, false)
    inputRef.current?.focus()
  }

  function handleScopeChange(type, id = null) {
    setScopeType(type)
    setScopeId(id)
    setOffset(0)
    if (hasSearched && query.trim().length >= 3) {
      setTimeout(() => doSearch(query, 0, false), 0)
    }
  }

  const selectedKBName = useMemo(() => {
    if (scopeType !== 'knowledge_base' || !scopeId) return null
    return knowledgeBases.find((kb) => kb.id === scopeId)?.name || 'Unknown KB'
  }, [scopeType, scopeId, knowledgeBases])

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 sm:px-8 py-6 pb-20 max-w-[820px] mx-auto">
        {/* Header */}
        <h1 className="serif text-[28px] font-medium tracking-tight mb-5">Search</h1>

        {/* Search bar */}
        <div className="relative mb-4">
          <div className="flex items-center gap-2.5 px-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)] focus-within:border-[var(--accent-soft)] transition-colors">
            <Icons.Search size={16} className="mute shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search across all your podcast transcripts..."
              className="flex-1 bg-transparent border-none outline-none text-[15px] placeholder:text-[var(--text-mute)]"
            />
            {loading && (
              <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin shrink-0" />
            )}
            {query && !loading && (
              <button
                onClick={() => { setQuery(''); setResults([]); setHasSearched(false); setShowHistory(true) }}
                className="mute shrink-0"
              >
                <Icons.X size={14} />
              </button>
            )}
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`shrink-0 transition-colors ${showFilters ? 'text-[var(--accent)]' : 'mute'}`}
              title="Filters"
            >
              <Icons.Filter size={16} />
            </button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="mb-4 p-3 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)]">
            <div className="flex flex-wrap gap-4">
              {/* Scope */}
              <div>
                <label className="text-[10px] mono mute uppercase tracking-[0.1em] block mb-1.5">Scope</label>
                <div className="flex gap-1">
                  <ScopePill
                    label="All Podcasts"
                    active={scopeType === 'all'}
                    onClick={() => handleScopeChange('all')}
                  />
                  {knowledgeBases.map((kb) => (
                    <ScopePill
                      key={kb.id}
                      label={kb.name}
                      active={scopeType === 'knowledge_base' && scopeId === kb.id}
                      onClick={() => handleScopeChange('knowledge_base', kb.id)}
                    />
                  ))}
                </div>
              </div>

              {/* Threshold */}
              <div>
                <label className="text-[10px] mono mute uppercase tracking-[0.1em] block mb-1.5">
                  Min relevance: {Math.round(threshold * 100)}%
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="0.9"
                  step="0.05"
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))}
                  className="w-32 accent-[var(--accent)]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Active scope indicator */}
        {scopeType !== 'all' && (
          <div className="flex items-center gap-2 mb-3 text-[12px]">
            <span className="mute">Searching in:</span>
            <span className="text-[var(--accent)] font-medium">{selectedKBName}</span>
            <button
              onClick={() => handleScopeChange('all')}
              className="mute hover:text-[var(--text)] transition-colors"
            >
              <Icons.X size={12} />
            </button>
          </div>
        )}

        {/* Results meta */}
        {hasSearched && !loading && (
          <div className="flex items-center justify-between mb-3 text-[12px] mono mute">
            <span>
              {results.length} result{results.length !== 1 ? 's' : ''}
              {query ? ` for "${query.length > 40 ? query.slice(0, 40) + '…' : query}"` : ''}
            </span>
            {queryTimeMs != null && <span>{(queryTimeMs / 1000).toFixed(1)}s</span>}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-[color-mix(in_oklab,var(--error),transparent_85%)] border border-[color-mix(in_oklab,var(--error),transparent_70%)] rounded-[var(--r-lg)] text-[13px] text-[var(--error)]">
            {error}
            <button
              onClick={() => doSearch(query, 0, false)}
              className="ml-2 underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && !results.length && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)] animate-pulse"
              >
                <div className="flex gap-2 mb-3">
                  <div className="w-8 h-8 rounded bg-[var(--bg)]" />
                  <div className="flex-1">
                    <div className="h-3 w-40 bg-[var(--bg)] rounded mb-1" />
                    <div className="h-2.5 w-24 bg-[var(--bg)] rounded" />
                  </div>
                </div>
                <div className="h-2.5 w-16 bg-[var(--bg)] rounded mb-2" />
                <div className="h-3 w-full bg-[var(--bg)] rounded mb-1" />
                <div className="h-3 w-3/4 bg-[var(--bg)] rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="flex flex-col gap-3">
            {results.map((result, i) => (
              <SearchResultCard
                key={`${result.chunk_id}-${i}`}
                result={result}
                isActive={i === activeIndex}
                onFindSimilar={handleFindSimilar}
              />
            ))}
          </div>
        )}

        {/* Load more */}
        {hasMore && !loading && (
          <button
            onClick={handleLoadMore}
            className="w-full mt-4 py-2.5 text-[13px] font-medium text-[var(--accent)] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)] hover:border-[var(--accent-soft)] transition-colors"
          >
            Load more results
          </button>
        )}

        {/* No results */}
        {hasSearched && !loading && results.length === 0 && !error && (
          <div className="text-center py-16">
            <Icons.Search size={32} className="mx-auto mb-3 mute" />
            <p className="text-[14px] dim mb-1">No matches found for "{query}"</p>
            <p className="text-[12px] mute">Try broader terms or lower the relevance threshold.</p>
          </div>
        )}

        {/* Empty state / history */}
        {showHistory && !hasSearched && (
          <div className="mt-8">
            {history.length > 0 ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] mono mute uppercase tracking-[0.1em]">
                    Recent Searches
                  </span>
                  <button
                    onClick={handleClearHistory}
                    className="text-[11px] mono mute hover:text-[var(--text)] transition-colors"
                  >
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {history.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => handleHistoryClick(h.query)}
                      className="group inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-full hover:border-[var(--accent-soft)] transition-colors"
                    >
                      <span className="dim">{h.query.length > 40 ? h.query.slice(0, 40) + '…' : h.query}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleHistoryDelete(h.id) }}
                        className="mute opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Icons.X size={10} />
                      </button>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-16">
                <Icons.Search size={32} className="mx-auto mb-3 mute" />
                <p className="text-[14px] dim mb-1">Search across all your podcast transcripts</p>
                <p className="text-[12px] mute">Type a question or topic above. Results are ranked by semantic relevance.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ScopePill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-[12px] rounded-full transition-colors border ${
        active
          ? 'bg-[var(--accent-faint)] text-[var(--accent)] border-[var(--accent-soft)]'
          : 'bg-transparent text-[var(--text-dim)] border-[var(--border)] hover:border-[var(--accent-soft)]'
      }`}
    >
      {label}
    </button>
  )
}
