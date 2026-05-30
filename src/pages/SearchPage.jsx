import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { listKnowledgeBases } from '../services/knowledgeBases'
import { semanticSearch, getSearchHistory, deleteSearchHistoryEntry, clearSearchHistory } from '../services/search'
import { searchShows, getEpisodes } from '../services/podcastIndex'
import SemanticSearchResult from '../components/SemanticSearchResult'
import * as Icons from '../components/Icons'

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function decodeHtml(html) {
  if (!html) return ''
  const txt = document.createElement('textarea')
  txt.innerHTML = html
  return txt.value
}

function formatDuration(seconds) {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function SearchPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const inputRef = useRef(null)

  const initialQuery = searchParams.get('q') || ''
  const initialTab = searchParams.get('tab') || 'transcripts'

  // Tab state
  const [activeTab, setActiveTab] = useState(initialTab)

  // Shared state
  const [query, setQuery] = useState(initialQuery)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Semantic search state
  const [results, setResults] = useState([])
  const [queryTimeMs, setQueryTimeMs] = useState(null)
  const [hasSearched, setHasSearched] = useState(false)

  // Filters (semantic search)
  const [scopeType, setScopeType] = useState('all')
  const [scopeId, setScopeId] = useState(null)
  const [threshold, setThreshold] = useState(0.3)
  const [showFilters, setShowFilters] = useState(false)
  const [knowledgeBases, setKnowledgeBases] = useState([])

  // Pagination (semantic search)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const PAGE_SIZE = 20

  // History
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(true)

  // Keyboard nav (semantic search)
  const [activeIndex, setActiveIndex] = useState(-1)

  // Podcast Index (Find Podcasts) state
  const [shows, setShows] = useState([])
  const [showsSearched, setShowsSearched] = useState(false)
  const [selectedShow, setSelectedShow] = useState(null)
  const [episodes, setEpisodes] = useState([])
  const [loadingEpisodes, setLoadingEpisodes] = useState(false)

  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    listKnowledgeBases().then(setKnowledgeBases).catch(console.error)
    getSearchHistory(20).then(setHistory).catch(console.error)
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Reset state when switching tabs
  function handleTabChange(tab) {
    setActiveTab(tab)
    setError(null)
    setActiveIndex(-1)
    // Reset podcast discovery state when switching away
    if (tab === 'transcripts') {
      setShows([])
      setShowsSearched(false)
      setSelectedShow(null)
      setEpisodes([])
    }
    // Re-focus the input
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  // --- Semantic search logic ---
  const doSemanticSearch = useCallback(async (q, searchOffset = 0, append = false) => {
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

  // --- Podcast Index search logic ---
  const doPodcastSearch = useCallback(async (q) => {
    if (!q || q.trim().length < 2) return

    setLoading(true)
    setError(null)
    setSelectedShow(null)
    setEpisodes([])

    try {
      const data = await searchShows(q)
      setShows(data)
      setShowsSearched(true)
    } catch (err) {
      setError(err.message)
      setShows([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced search triggers
  useEffect(() => {
    if (activeTab === 'transcripts') {
      if (debouncedQuery.trim().length >= 3) {
        setOffset(0)
        doSemanticSearch(debouncedQuery, 0, false)
      } else if (debouncedQuery.trim().length === 0) {
        setResults([])
        setHasSearched(false)
        setShowHistory(true)
        setQueryTimeMs(null)
      }
    } else if (activeTab === 'podcasts') {
      if (debouncedQuery.trim().length >= 2) {
        doPodcastSearch(debouncedQuery)
      } else if (debouncedQuery.trim().length === 0) {
        setShows([])
        setShowsSearched(false)
      }
    }
  }, [debouncedQuery, activeTab, doSemanticSearch, doPodcastSearch])

  function handleKeyDown(e) {
    if (activeTab === 'transcripts') {
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
          doSemanticSearch(query, 0, false)
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((prev) => Math.min(prev + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((prev) => Math.max(prev - 1, -1))
      }
    }

    if (e.key === 'Escape') {
      setQuery('')
      inputRef.current?.blur()
    }
  }

  function handleLoadMore() {
    const newOffset = offset + PAGE_SIZE
    setOffset(newOffset)
    doSemanticSearch(query, newOffset, true)
  }

  function handleHistoryClick(historyQuery) {
    setQuery(historyQuery)
    setOffset(0)
    doSemanticSearch(historyQuery, 0, false)
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
    setActiveTab('transcripts')
    doSemanticSearch(snippet, 0, false)
    inputRef.current?.focus()
  }

  function handleScopeChange(type, id = null) {
    setScopeType(type)
    setScopeId(id)
    setOffset(0)
    if (hasSearched && query.trim().length >= 3) {
      setTimeout(() => doSemanticSearch(query, 0, false), 0)
    }
  }

  async function handleSelectShow(show) {
    setSelectedShow(show)
    setLoadingEpisodes(true)
    setError(null)
    try {
      const eps = await getEpisodes(show.id, show.feedUrl)
      setEpisodes(eps)
    } catch (err) {
      setError(err.message || 'Failed to load episodes')
      setEpisodes([])
    } finally {
      setLoadingEpisodes(false)
    }
  }

  function handleBackToShows() {
    setSelectedShow(null)
    setEpisodes([])
    setError(null)
  }

  const selectedKBName = useMemo(() => {
    if (scopeType !== 'knowledge_base' || !scopeId) return null
    return knowledgeBases.find((kb) => kb.id === scopeId)?.name || 'Unknown KB'
  }, [scopeType, scopeId, knowledgeBases])

  const placeholderText = activeTab === 'transcripts'
    ? 'Search across all your podcast transcripts...'
    : 'Search for a podcast by name or topic...'

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 sm:px-8 py-6 pb-20 max-w-[820px] mx-auto">
        {/* Header */}
        <h1 className="serif text-[28px] font-medium tracking-tight mb-5">Search</h1>

        {/* Tab toggle */}
        <div className="flex gap-1 mb-4 p-0.5 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)] w-fit">
          <TabButton
            active={activeTab === 'transcripts'}
            onClick={() => handleTabChange('transcripts')}
            icon={<Icons.FileText size={14} />}
            label="Search Transcripts"
          />
          <TabButton
            active={activeTab === 'podcasts'}
            onClick={() => handleTabChange('podcasts')}
            icon={<Icons.Headphones size={14} />}
            label="Find Podcasts"
          />
        </div>

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
              placeholder={placeholderText}
              className="flex-1 bg-transparent border-none outline-none text-[15px] placeholder:text-[var(--text-mute)]"
            />
            {loading && (
              <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin shrink-0" />
            )}
            {query && !loading && (
              <button
                onClick={() => {
                  setQuery('')
                  setResults([])
                  setHasSearched(false)
                  setShowHistory(true)
                  setShows([])
                  setShowsSearched(false)
                  setSelectedShow(null)
                  setEpisodes([])
                }}
                className="mute shrink-0"
              >
                <Icons.X size={14} />
              </button>
            )}
            {activeTab === 'transcripts' && (
              <button
                onClick={() => setShowFilters((v) => !v)}
                className={`shrink-0 transition-colors ${showFilters ? 'text-[var(--accent)]' : 'mute'}`}
                title="Filters"
              >
                <Icons.Filter size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Filters (semantic search only) */}
        {activeTab === 'transcripts' && showFilters && (
          <div className="mb-4 p-3 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)]">
            <div className="flex flex-wrap gap-4">
              {/* Scope */}
              <div>
                <label className="text-[10px] mono mute uppercase tracking-[0.1em] block mb-1.5">Scope</label>
                <div className="flex gap-1 flex-wrap">
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

        {/* Active scope indicator (semantic search only) */}
        {activeTab === 'transcripts' && scopeType !== 'all' && (
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

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-[color-mix(in_oklab,var(--error),transparent_85%)] border border-[color-mix(in_oklab,var(--error),transparent_70%)] rounded-[var(--r-lg)] text-[13px] text-[var(--error)]">
            {error}
            {activeTab === 'transcripts' && (
              <button
                onClick={() => doSemanticSearch(query, 0, false)}
                className="ml-2 underline"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* ========== SEARCH TRANSCRIPTS TAB ========== */}
        {activeTab === 'transcripts' && (
          <>
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
                  <SemanticSearchResult
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
          </>
        )}

        {/* ========== FIND PODCASTS TAB ========== */}
        {activeTab === 'podcasts' && (
          <>
            {/* Show detail view (episodes) */}
            {selectedShow ? (
              <>
                {/* Show header with back button */}
                <div className="flex items-center gap-3 mb-4">
                  <button
                    onClick={handleBackToShows}
                    className="mute p-1 hover:text-[var(--text)] transition-colors"
                  >
                    <Icons.Back size={16} />
                  </button>
                  {selectedShow.artwork && (
                    <img
                      src={selectedShow.artwork}
                      alt=""
                      className="w-10 h-10 rounded object-cover shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[15px] font-medium truncate m-0">
                      {decodeHtml(selectedShow.title)}
                    </h2>
                    <p className="text-[12px] mute m-0">{selectedShow.author}</p>
                  </div>
                </div>

                {/* Episodes list */}
                {loadingEpisodes && (
                  <div className="flex items-center justify-center py-12 gap-2">
                    <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                    <span className="text-[13px] mute">Loading episodes...</span>
                  </div>
                )}

                {!loadingEpisodes && episodes.length === 0 && (
                  <div className="text-center py-12">
                    <Icons.Headphones size={32} className="mx-auto mb-3 mute" />
                    <p className="text-[14px] dim">No episodes found</p>
                  </div>
                )}

                {!loadingEpisodes && episodes.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <div className="text-[12px] mono mute mb-2">{episodes.length} episodes</div>
                    {episodes.map((ep) => (
                      <EpisodeRow key={ep.id} episode={ep} navigate={navigate} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Loading spinner */}
                {loading && (
                  <div className="flex items-center justify-center py-12 gap-2">
                    <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                    <span className="text-[13px] mute">Searching podcasts...</span>
                  </div>
                )}

                {/* Show results */}
                {!loading && shows.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <div className="text-[12px] mono mute mb-2">
                      {shows.length} podcast{shows.length !== 1 ? 's' : ''} found
                    </div>
                    {shows.map((show) => (
                      <button
                        key={show.id}
                        onClick={() => handleSelectShow(show)}
                        className="w-full flex gap-3 p-3 text-left transition-colors rounded-[var(--r-lg)] hover:bg-[var(--surface)] border border-transparent hover:border-[var(--border)]"
                      >
                        {show.artwork ? (
                          <img
                            src={show.artwork}
                            alt=""
                            className="w-12 h-12 object-cover shrink-0 rounded-[var(--r-sm)]"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-[var(--r-sm)] bg-[var(--surface)] grid place-items-center shrink-0 mute border border-[var(--border)]">
                            <Icons.Headphones size={18} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium line-clamp-1 m-0">
                            {decodeHtml(show.title)}
                          </p>
                          <p className="text-[12px] dim mt-0.5 m-0">{show.author}</p>
                          <p className="text-[11px] mute mt-0.5 line-clamp-1 m-0">
                            {show.episodeCount ? `${show.episodeCount} episodes` : ''}
                            {show.episodeCount && show.description ? ' · ' : ''}
                            {decodeHtml(show.description)?.slice(0, 100)}
                          </p>
                        </div>
                        <Icons.Arrow size={14} className="mute shrink-0 mt-3" />
                      </button>
                    ))}
                  </div>
                )}

                {/* No results */}
                {!loading && showsSearched && shows.length === 0 && !error && (
                  <div className="text-center py-16">
                    <Icons.Headphones size={32} className="mx-auto mb-3 mute" />
                    <p className="text-[14px] dim mb-1">No podcasts found for "{query}"</p>
                    <p className="text-[12px] mute">Try a different name, host, or topic.</p>
                  </div>
                )}

                {/* Empty state */}
                {!loading && !showsSearched && (
                  <div className="text-center py-16">
                    <Icons.Globe size={32} className="mx-auto mb-3 mute" />
                    <p className="text-[14px] dim mb-1">Discover new podcasts</p>
                    <p className="text-[12px] mute">Search by podcast name, host, or topic to find shows on Podcast Index.</p>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-[var(--r-md)] transition-colors ${
        active
          ? 'bg-[var(--bg)] text-[var(--text)] shadow-sm'
          : 'bg-transparent text-[var(--text-mute)] hover:text-[var(--text-dim)]'
      }`}
    >
      {icon}
      {label}
    </button>
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

function EpisodeRow({ episode, navigate }) {
  const dateStr = episode.datePublished
    ? new Date(episode.datePublished * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : ''

  return (
    <div className="p-3 rounded-[var(--r-lg)] hover:bg-[var(--surface)] transition-colors border border-transparent hover:border-[var(--border)]">
      <p className="text-[14px] font-medium line-clamp-2 leading-snug m-0">
        {decodeHtml(episode.title)}
      </p>
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        {episode.duration > 0 && (
          <span className="mono text-[11px] text-[var(--accent)]">
            {formatDuration(episode.duration)}
          </span>
        )}
        {dateStr && <span className="text-[11px] mute">{dateStr}</span>}
      </div>
      {episode.description && (
        <p className="text-[12px] mute mt-1 line-clamp-2 m-0">
          {decodeHtml(episode.description)?.slice(0, 200)}
        </p>
      )}
    </div>
  )
}
