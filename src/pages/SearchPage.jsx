import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { semanticSearch, getSearchHistory, deleteSearchHistoryEntry, clearSearchHistory } from '../services/search'
import { searchShows, getEpisodes } from '../services/podcastIndex'
import { addPodcastFromIndex } from '../services/podcasts'
import { useData } from '../lib/DataContext'
import { useToast } from '../lib/ToastContext'
import SemanticSearchResult from '../components/SemanticSearchResult'
import SubscribeButton from '../components/SubscribeButton'
import PodcastImage from '../components/PodcastImage'
import { Button, EmptyState } from '../components/ui'
import { formatDuration } from '../lib/utils'
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

export default function SearchPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const inputRef = useRef(null)
  // Request-id guards: a slow earlier response must not clobber a newer one
  const semanticReqId = useRef(0)
  const podcastReqId = useRef(0)
  const { knowledgeBases, refresh } = useData()

  useEffect(() => { document.title = 'Search — PodBrain' }, [])
  const { addToast } = useToast()

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

  // Latest query value for effects that should not re-run on every keystroke
  const queryRef = useRef(query)
  useEffect(() => { queryRef.current = query }, [query])

  useEffect(() => {
    const currentQ = searchParams.get('q') || ''
    const currentTab = searchParams.get('tab') || 'transcripts'
    if (currentQ !== debouncedQuery || currentTab !== activeTab) {
      const next = new URLSearchParams(searchParams)
      if (debouncedQuery) {
        next.set('q', debouncedQuery)
      } else {
        next.delete('q')
      }
      if (activeTab !== 'transcripts') {
        next.set('tab', activeTab)
      } else {
        next.delete('tab')
      }
      setSearchParams(next, { replace: true })
    }
  }, [debouncedQuery, activeTab, searchParams, setSearchParams])

  useEffect(() => {
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

    const reqId = ++semanticReqId.current
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

      // Ignore results from a superseded request
      if (reqId !== semanticReqId.current) return

      setResults((prev) => append ? [...prev, ...data.results] : data.results)
      setQueryTimeMs(data.query_time_ms)
      setHasMore(data.results.length === PAGE_SIZE)
      setHasSearched(true)
      setShowHistory(false)

      if (!append) {
        getSearchHistory(20).then(setHistory).catch(console.error)
      }
    } catch (err) {
      if (reqId !== semanticReqId.current) return
      setError(err.message)
      if (!append) setResults([])
    } finally {
      if (reqId === semanticReqId.current) setLoading(false)
    }
  }, [scopeType, scopeId, threshold])

  // --- Podcast Index search logic ---
  const doPodcastSearch = useCallback(async (q) => {
    if (!q || q.trim().length < 2) return

    const reqId = ++podcastReqId.current
    setLoading(true)
    setError(null)
    setSelectedShow(null)
    setEpisodes([])

    try {
      const data = await searchShows(q)
      // Ignore results from a superseded request
      if (reqId !== podcastReqId.current) return
      setShows(data)
      setShowsSearched(true)
    } catch (err) {
      if (reqId !== podcastReqId.current) return
      setError(err.message)
      setShows([])
    } finally {
      if (reqId === podcastReqId.current) setLoading(false)
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

  // Track pending scope change for re-search
  const [scopeChangeFlag, setScopeChangeFlag] = useState(0)

  function handleScopeChange(type, id = null) {
    setScopeType(type)
    setScopeId(id)
    setOffset(0)
    if (hasSearched && query.trim().length >= 3) {
      setScopeChangeFlag((prev) => prev + 1)
    }
  }

  // Re-trigger search after scope state has settled.
  // Reads the latest query from a ref so it fires only on scope change,
  // not on every keystroke.
  useEffect(() => {
    const q = queryRef.current
    if (scopeChangeFlag > 0 && q.trim().length >= 3) {
      doSemanticSearch(q, 0, false)
    }
  }, [scopeChangeFlag, doSemanticSearch])

  async function handleSelectShow(show) {
    setSelectedShow(show)
    setLoadingEpisodes(true)
    setError(null)
    try {
      const { episodes: eps } = await getEpisodes(show.id, show.feedUrl)
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

  async function handleAddEpisode(episode, showMeta) {
    const enriched = {
      ...episode,
      feedTitle: showMeta?.title || '',
      feedImage: showMeta?.artwork || '',
      feedUrl: showMeta?.feedUrl || '',
      feedId: showMeta?.id,
    }
    try {
      const { alreadyProcessed } = await addPodcastFromIndex(null, enriched)
      refresh()
      addToast(alreadyProcessed ? 'Episode already in library' : 'Episode added to library', 'success')
    } catch (err) {
      addToast(err.message || 'Failed to add episode', 'error')
    }
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
      <div className="px-4 sm:px-6 md:px-8 py-6 pb-20 max-w-[820px] mx-auto">
        {/* Header */}
        <h1 className="serif text-2xl sm:text-[28px] font-medium tracking-tight mb-5">Search</h1>

        {/* Tab toggle */}
        <div
          role="tablist"
          aria-label="Search mode"
          className="flex gap-1 mb-4 p-0.5 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)] w-full sm:w-fit"
        >
          <TabButton
            id="tab-transcripts"
            panelId="panel-transcripts"
            active={activeTab === 'transcripts'}
            onClick={() => handleTabChange('transcripts')}
            icon={<Icons.FileText size={14} />}
            label="Search Transcripts"
          />
          <TabButton
            id="tab-podcasts"
            panelId="panel-podcasts"
            active={activeTab === 'podcasts'}
            onClick={() => handleTabChange('podcasts')}
            icon={<Icons.Headphones size={14} />}
            label="Find Podcasts"
          />
        </div>

        {/* Search bar */}
        <div className="relative mb-4">
          <label htmlFor="search-query" className="sr-only">{placeholderText}</label>
          <div className="flex items-center gap-2.5 px-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)] focus-within:border-[var(--accent-soft)] transition-colors">
            <Icons.Search size={16} className="mute shrink-0" />
            <input
              id="search-query"
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
                  setError(null)
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
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4">
              {/* Scope */}
              <div role="group" aria-labelledby="search-scope-label">
                <span id="search-scope-label" className="text-[10px] mono mute uppercase tracking-[0.1em] block mb-1.5">Scope</span>
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
                <label htmlFor="search-threshold" className="text-[10px] mono mute uppercase tracking-[0.1em] block mb-1.5">
                  Min relevance: {Math.round(threshold * 100)}%
                </label>
                <input
                  id="search-threshold"
                  type="range"
                  min="0.1"
                  max="0.9"
                  step="0.05"
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))}
                  aria-label="Minimum relevance threshold"
                  aria-valuetext={`${Math.round(threshold * 100)}%`}
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
          <div role="tabpanel" id="panel-transcripts" aria-labelledby="tab-transcripts">
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
              <EmptyState
                icon={<Icons.Search size={32} />}
                title={`No matches found for "${query}"`}
                subtitle="Try broader terms or lower the relevance threshold."
              />
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
                        <div
                          key={h.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleHistoryClick(h.query)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleHistoryClick(h.query) } }}
                          className="group inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] cursor-pointer bg-[var(--surface)] border border-[var(--border)] rounded-full hover:border-[var(--accent-soft)] transition-colors"
                        >
                          <span className="dim">{h.query.length > 40 ? h.query.slice(0, 40) + '…' : h.query}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleHistoryDelete(h.id) }}
                            className="mute opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Icons.X size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <EmptyState
                    icon={<Icons.Search size={32} />}
                    title="Search across all your podcast transcripts"
                    subtitle="Type a question or topic above. Results are ranked by semantic relevance."
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* ========== FIND PODCASTS TAB ========== */}
        {activeTab === 'podcasts' && (
          <div role="tabpanel" id="panel-podcasts" aria-labelledby="tab-podcasts">
            {/* Show detail view (episodes) */}
            {selectedShow ? (
              <>
                {/* Show header with back button */}
                <div className="flex items-center gap-3 mb-4">
                  <button
                    onClick={handleBackToShows}
                    className="mute min-w-[44px] min-h-[44px] flex items-center justify-center hover:text-[var(--text)] transition-colors"
                  >
                    <Icons.Back size={16} />
                  </button>
                  <PodcastImage src={selectedShow.artwork} size={40} className="rounded" />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[15px] font-medium truncate m-0">
                      {decodeHtml(selectedShow.title)}
                    </h2>
                    <p className="text-[12px] mute m-0">{selectedShow.author}</p>
                  </div>
                </div>

                {/* Episodes list */}
                {loadingEpisodes && (
                  <RowSkeletonList label="Loading episodes" />
                )}

                {!loadingEpisodes && episodes.length === 0 && (
                  <EmptyState
                    icon={<Icons.Headphones size={32} />}
                    title="No episodes found"
                  />
                )}

                {!loadingEpisodes && episodes.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <div className="text-[12px] mono mute mb-2">{episodes.length} episodes</div>
                    {episodes.map((ep) => (
                      <EpisodeRow
                        key={ep.id}
                        episode={ep}
                        showMetadata={selectedShow}
                        onAdd={handleAddEpisode}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Loading skeletons */}
                {loading && (
                  <RowSkeletonList label="Searching podcasts" />
                )}

                {/* Show results */}
                {!loading && shows.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <div className="text-[12px] mono mute mb-2">
                      {shows.length} podcast{shows.length !== 1 ? 's' : ''} found
                    </div>
                    {shows.map((show) => (
                      <div
                        key={show.id}
                        className="flex gap-3 p-3 rounded-[var(--r-lg)] min-h-[44px] hover:bg-[var(--surface)] transition-colors border border-transparent hover:border-[var(--border)]"
                      >
                        <PodcastImage src={show.artwork} size={48} onClick={() => handleSelectShow(show)} />
                        <button
                          onClick={() => handleSelectShow(show)}
                          className="flex-1 min-w-0 text-left bg-transparent border-none p-0"
                        >
                          <p className="text-[14px] font-medium line-clamp-1 m-0">
                            {decodeHtml(show.title)}
                          </p>
                          <p className="text-[12px] dim mt-0.5 m-0">{show.author}</p>
                          <p className="text-[11px] mute mt-0.5 line-clamp-1 m-0">
                            {show.episodeCount ? `${show.episodeCount} episodes` : ''}
                            {show.episodeCount && show.description ? ' · ' : ''}
                            {decodeHtml(show.description)?.slice(0, 100)}
                          </p>
                        </button>
                        <div className="flex items-center gap-2 shrink-0">
                          <SubscribeButton show={show} compact />
                          <button
                            onClick={() => handleSelectShow(show)}
                            className="mute hover:text-[var(--text)] transition-colors"
                            title="Browse episodes"
                          >
                            <Icons.Arrow size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* No results */}
                {!loading && showsSearched && shows.length === 0 && !error && (
                  <EmptyState
                    icon={<Icons.Headphones size={32} />}
                    title={`No podcasts found for "${query}"`}
                    subtitle="Try a different name, host, or topic."
                  />
                )}

                {/* Empty state */}
                {!loading && !showsSearched && (
                  <EmptyState
                    icon={<Icons.Globe size={32} />}
                    title="Discover new podcasts"
                    subtitle="Search by podcast name, host, or topic to find shows on Podcast Index."
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function TabButton({ id, panelId, active, onClick, icon, label }) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      aria-controls={panelId}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-[var(--r-md)] transition-colors flex-1 sm:flex-initial min-h-[44px] sm:min-h-0 ${
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
      className={`px-3 py-2 sm:px-2.5 sm:py-1 text-[12px] rounded-full transition-colors border ${
        active
          ? 'bg-[var(--accent-faint)] text-[var(--accent)] border-[var(--accent-soft)]'
          : 'bg-transparent text-[var(--text-dim)] border-[var(--border)] hover:border-[var(--accent-soft)]'
      }`}
    >
      {label}
    </button>
  )
}

function RowSkeletonList({ label = 'Loading', count = 4 }) {
  return (
    <div className="flex flex-col gap-1" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex gap-3 p-3 rounded-[var(--r-lg)] border border-transparent animate-pulse"
          aria-hidden="true"
        >
          <div className="w-12 h-12 rounded bg-[var(--surface)] shrink-0" />
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
            <div className="h-3 w-3/4 bg-[var(--surface)] rounded" />
            <div className="h-2.5 w-2/5 bg-[var(--surface)] rounded" />
            <div className="h-2.5 w-1/2 bg-[var(--surface)] rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EpisodeRow({ episode, showMetadata, onAdd }) {
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const hasTranscript = episode.transcripts?.length > 0 || episode.transcriptUrl

  const dateStr = episode.datePublished
    ? new Date(episode.datePublished * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : ''

  async function handleAdd(e) {
    e.stopPropagation()
    if (adding || added) return
    setAdding(true)
    try {
      await onAdd(episode, showMetadata)
      setAdded(true)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex gap-3 p-3 rounded-[var(--r-lg)] min-h-[44px] hover:bg-[var(--surface)] transition-colors border border-transparent hover:border-[var(--border)]">
      <div className="flex-1 min-w-0">
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
          {hasTranscript && (
            <span className="text-[10px] mono text-[var(--accent)] bg-[var(--accent-faint)] px-1.5 py-0.5 rounded">
              Transcript
            </span>
          )}
        </div>
        {episode.description && (
          <p className="text-[12px] mute mt-1 line-clamp-2 m-0">
            {decodeHtml(episode.description)?.slice(0, 200)}
          </p>
        )}
      </div>
      <button
        onClick={handleAdd}
        disabled={adding || added}
        className={`shrink-0 self-center flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-[var(--r-sm)] transition-colors disabled:opacity-50 ${
          added
            ? 'bg-[var(--accent-faint)] text-[var(--accent)]'
            : 'bg-[var(--surface)] text-[var(--text-dim)] border border-[var(--border)] hover:text-[var(--accent)] hover:border-[color-mix(in_oklab,var(--accent),transparent_60%)]'
        }`}
      >
        {added ? <Icons.Check size={11} /> : adding ? (
          <div className="w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        ) : <Icons.Plus size={11} />}
        {added ? 'Added' : 'Add'}
      </button>
    </div>
  )
}
