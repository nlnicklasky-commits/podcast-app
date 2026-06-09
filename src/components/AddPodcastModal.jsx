import { useState, useRef, useCallback, useEffect } from 'react'
import { searchShows, getEpisodes, getAllEpisodes } from '../services/podcastIndex'
import { bulkAddEpisodesFromIndex } from '../services/podcasts'
import { formatDuration } from '../lib/utils'
import { useData } from '../lib/DataContext'
import useFocusTrap from '../hooks/useFocusTrap'
import SubscribeButton from './SubscribeButton'
import * as Icons from './Icons'

export default function AddPodcastModal({ onClose, onAddFromIndex, knowledgeBaseId = null, initialShow = null }) {
  const { refresh } = useData()
  const [step, setStep] = useState(initialShow ? 'episodes' : 'shows')
  const [query, setQuery] = useState('')
  const [shows, setShows] = useState([])
  const [selectedShow, setSelectedShow] = useState(initialShow)
  const [episodes, setEpisodes] = useState([])
  const [searching, setSearching] = useState(false)
  const [loadingEpisodes, setLoadingEpisodes] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const searchTimeout = useRef(null)
  const trapRef = useFocusTrap()

  // Cleanup search timeout on unmount (P1-4 fix)
  useEffect(() => () => clearTimeout(searchTimeout.current), [])

  // Load episodes immediately when initialShow is provided (P0-1 fix)
  useEffect(() => {
    if (initialShow) {
      handleSelectShow(initialShow)
    }
  }, [])

  const [bulkAdding, setBulkAdding] = useState(false)
  const [bulkProgress, setBulkProgress] = useState(null)
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false)

  const handleSearch = useCallback(async (q) => {
    if (!q.trim() || q.trim().length < 2) {
      setShows([])
      return
    }
    setSearching(true)
    setError('')
    try {
      const data = await searchShows(q)
      setShows(data)
    } catch (err) {
      setError(err.message || 'Search failed')
      setShows([])
    } finally {
      setSearching(false)
    }
  }, [])

  function onQueryChange(e) {
    const val = e.target.value
    setQuery(val)
    setError('')
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => handleSearch(val), 500)
  }

  async function handleSelectShow(show) {
    setSelectedShow(show)
    setStep('episodes')
    setLoadingEpisodes(true)
    setError('')
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
    setStep('shows')
    setSelectedShow(null)
    setEpisodes([])
    setError('')
    setBulkMenuOpen(false)
  }

  async function handleSelectEpisode(episode) {
    setLoading(true)
    setError('')
    try {
      const enrichedEpisode = {
        ...episode,
        showTitle: selectedShow?.title || '',
        showArtwork: selectedShow?.artwork || '',
        feedUrl: selectedShow?.feedUrl || '',
      }
      const result = await onAddFromIndex(enrichedEpisode)
      if (result?.alreadyProcessed) setError('')
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to add episode')
      setLoading(false)
    }
  }

  async function handleBulkAdd(count, { transcriptOnly = false } = {}) {
    setBulkAdding(true)
    setBulkMenuOpen(false)
    setError('')

    try {
      let sorted = [...episodes].sort((a, b) => (b.datePublished || 0) - (a.datePublished || 0))
      if (transcriptOnly) {
        sorted = sorted.filter(ep => ep.transcripts?.length > 0 || ep.transcriptUrl)
      }
      const toAdd = count ? sorted.slice(0, count) : sorted
      if (toAdd.length === 0) {
        setError('No episodes with transcripts found')
        setBulkAdding(false)
        return
      }
      setBulkProgress({ current: 0, total: toAdd.length })

      const showMetadata = {
        title: selectedShow?.title || '',
        artwork: selectedShow?.artwork || '',
        feedUrl: selectedShow?.feedUrl || '',
        feedId: selectedShow?.id,
      }

      const result = await bulkAddEpisodesFromIndex(
        knowledgeBaseId,
        toAdd,
        showMetadata,
        (current, total) => setBulkProgress({ current, total })
      )

      setBulkProgress({ current: result.added + result.skipped, total: toAdd.length, done: true, ...result })
      refresh()

      setTimeout(() => onClose(), 1500)
    } catch (err) {
      setError(err.message || 'Failed to add episodes')
      setBulkAdding(false)
      setBulkProgress(null)
    }
  }

  async function handleAllTranscripts() {
    setBulkAdding(true)
    setBulkMenuOpen(false)
    setError('')
    setBulkProgress({ current: 0, total: 0, phase: 'fetching' })

    try {
      const allEps = await getAllEpisodes(
        selectedShow?.id,
        selectedShow?.feedUrl,
        (count) => setBulkProgress({ current: 0, total: 0, phase: 'fetching', fetched: count })
      )

      const withTranscript = allEps.filter(ep => ep.transcripts?.length > 0 || ep.transcriptUrl)
      if (withTranscript.length === 0) {
        setError(`Found ${allEps.length} episodes but none have transcripts`)
        setBulkAdding(false)
        setBulkProgress(null)
        return
      }

      setBulkProgress({ current: 0, total: withTranscript.length, phase: 'adding' })

      const showMetadata = {
        title: selectedShow?.title || '',
        artwork: selectedShow?.artwork || '',
        feedUrl: selectedShow?.feedUrl || '',
        feedId: selectedShow?.id,
      }

      const result = await bulkAddEpisodesFromIndex(
        knowledgeBaseId,
        withTranscript,
        showMetadata,
        (current, total) => setBulkProgress({ current, total, phase: 'adding' })
      )

      setBulkProgress({ current: result.added + result.skipped, total: withTranscript.length, done: true, ...result })
      refresh()
      setTimeout(() => onClose(), 1500)
    } catch (err) {
      setError(err.message || 'Failed to add episodes')
      setBulkAdding(false)
      setBulkProgress(null)
    }
  }

  function formatDate(unix) {
    if (!unix) return ''
    const d = new Date(unix * 1000)
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  function formatFileSize(bytes) {
    if (!bytes) return ''
    const mb = bytes / (1024 * 1024)
    return mb >= 1 ? `${mb.toFixed(0)}MB` : `${(bytes / 1024).toFixed(0)}KB`
  }

  function decodeHtml(html) {
    if (!html) return ''
    const txt = document.createElement('textarea')
    txt.innerHTML = html
    return txt.value
  }

  function truncate(str, len) {
    if (!str) return ''
    return str.length > len ? str.slice(0, len) + '...' : str
  }

  const transcriptCount = episodes.filter(ep => ep.transcripts?.length > 0 || ep.transcriptUrl).length

  const bulkOptions = [
    { label: 'Recent 10', count: 10 },
    { label: 'Recent 20', count: 20 },
    { label: 'Recent 50', count: 50 },
  ].filter(opt => opt.count < episodes.length)

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-5 bg-black/55 backdrop-blur-[4px]"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[92vh] sm:max-h-[85vh] flex flex-col fade-in bg-[var(--bg-2)] border border-[var(--border)] rounded-[12px_12px_var(--r-lg)_var(--r-lg)]"
      >
        {/* Header */}
        <div
          className="flex items-center px-[18px] py-3.5 shrink-0 border-b border-[var(--border)]"
        >
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {step === 'episodes' && (
              <button onClick={handleBackToShows} className="mute p-0.5" disabled={bulkAdding}>
                <Icons.Back size={16} />
              </button>
            )}
            <h3 className="m-0 text-[15px] font-medium truncate">
              {step === 'episodes' ? decodeHtml(selectedShow?.title) : 'Add Podcast'}
            </h3>
          </div>
          <button onClick={onClose} className="ml-auto mute shrink-0" aria-label="Close">
            <Icons.X size={16} />
          </button>
        </div>


        {/* Search mode */}
        <div className="flex flex-col flex-1 min-h-0 px-[18px] py-3.5">
            {step === 'shows' && (
              <>
                <div className="shrink-0 mb-3">
                  <div
                    className="flex items-center gap-2 px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-md)]"
                  >
                    <Icons.Search size={14} className="mute shrink-0" />
                    <input
                      type="text"
                      value={query}
                      onChange={onQueryChange}
                      placeholder="Search for a podcast..."
                      className="flex-1 bg-transparent border-none outline-none text-[13.5px] text-[var(--text)]"
                      autoFocus
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-[12px] mb-2 text-[var(--error)]">{error}</p>
                )}

                <div className="flex-1 overflow-y-auto min-h-0 space-y-1">
                  {searching && (
                    <div className="flex items-center justify-center py-8 gap-2">
                      <span
                        className="w-4 h-4 rounded-full border-2 animate-spin border-[var(--accent)] border-t-transparent"
                      />
                      <span className="text-[13px] mute">Searching...</span>
                    </div>
                  )}

                  {!searching && shows.length === 0 && query.trim().length >= 2 && (
                    <p className="mute text-[13px] text-center py-8">No podcasts found</p>
                  )}

                  {!searching && shows.length === 0 && query.trim().length < 2 && (
                    <p className="mute text-[13px] text-center py-8">
                      Type a podcast name, host, or topic to search
                    </p>
                  )}

                  {!searching && shows.map((show) => (
                    <button
                      key={show.id}
                      onClick={() => handleSelectShow(show)}
                      className="w-full flex gap-3 p-2.5 text-left group transition-colors rounded-[var(--r-md)] hover:bg-[var(--surface)]"
                    >
                      {show.artwork && (
                        <img
                          src={show.artwork}
                          alt=""
                          className="w-[52px] h-[52px] object-cover shrink-0 transition-all rounded-[var(--r-sm)]"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium line-clamp-1 m-0 text-[var(--text)]">
                          {decodeHtml(show.title)}
                        </p>
                        <p className="text-[12px] dim mt-0.5 m-0">{show.author}</p>
                        <p className="text-[11px] mute mt-0.5 line-clamp-1 m-0">
                          {show.episodeCount ? `${show.episodeCount} episodes` : ''}
                          {show.episodeCount && show.description ? ' · ' : ''}
                          {truncate(decodeHtml(show.description), 80)}
                        </p>
                      </div>
                      <SubscribeButton show={show} compact />
                      <Icons.Arrow size={14} className="mute shrink-0 mt-2" />
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === 'episodes' && (
              <>
                {selectedShow && (
                  <p className="text-[12px] dim mb-3 m-0 shrink-0">
                    by {selectedShow.author} · Add episodes to your library
                  </p>
                )}

                {error && (
                  <p className="text-[12px] mb-2 text-[var(--error)]">{error}</p>
                )}

                <div className="flex-1 overflow-y-auto min-h-0 space-y-0.5">
                  {loadingEpisodes && (
                    <div className="flex items-center justify-center py-8 gap-2">
                      <span
                        className="w-4 h-4 rounded-full border-2 animate-spin border-[var(--accent)] border-t-transparent"
                      />
                      <span className="text-[13px] mute">Loading episodes...</span>
                    </div>
                  )}

                  {!loadingEpisodes && episodes.length === 0 && (
                    <p className="mute text-[13px] text-center py-8">No episodes found</p>
                  )}

                  {!loadingEpisodes && episodes.map((ep) => (
                    <div
                      key={ep.id}
                      className="p-2.5 transition-colors rounded-[var(--r-md)] hover:bg-[var(--surface)]"
                    >
                      <p className="text-[13.5px] font-medium line-clamp-2 leading-snug m-0 text-[var(--text)]">
                        {decodeHtml(ep.title)}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {ep.duration > 0 && (
                          <span className="mono text-[11px] text-[var(--accent)]">
                            {formatDuration(ep.duration)}
                          </span>
                        )}
                        {ep.datePublished > 0 && (
                          <span className="text-[11px] mute">{formatDate(ep.datePublished)}</span>
                        )}
                        {ep.fileSize > 0 && (
                          <span className="text-[11px] mute">{formatFileSize(ep.fileSize)}</span>
                        )}
                        {(ep.transcripts?.length > 0 || ep.transcriptUrl) ? (
                          <span className="text-[11px] text-[var(--accent)]">Transcript</span>
                        ) : (
                          <span className="text-[11px] text-[color-mix(in_oklab,var(--text-dim),orange_40%)]">Audio</span>
                        )}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleSelectEpisode(ep)}
                          disabled={loading || bulkAdding}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-50 bg-[var(--accent)] text-[var(--accent-fg)] rounded-[var(--r-sm)]"
                        >
                          <Icons.Plus size={12} />
                          Add
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {loading && !bulkAdding && (
                  <div
                    className="flex items-center justify-center py-3 mt-2 shrink-0 border-t border-[var(--border)]"
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border-2 animate-spin mr-2 border-[var(--accent)] border-t-transparent"
                    />
                    <span className="text-[13px] mute">Adding episode...</span>
                  </div>
                )}

                {/* Bulk add footer */}
                {!loadingEpisodes && episodes.length > 1 && !loading && (
                  <div className="shrink-0 pt-3 mt-2 border-t border-[var(--border)]">
                    {bulkAdding && bulkProgress ? (
                      <div className="space-y-2">
                        {bulkProgress.phase !== 'fetching' && (
                          <div className="h-1.5 rounded-full overflow-hidden bg-[var(--surface)]">
                            <div
                              className="h-full rounded-full transition-all duration-300 bg-[var(--accent)]"
                              style={{ width: `${bulkProgress.total ? Math.round((bulkProgress.current / bulkProgress.total) * 100) : 0}%` }}
                            />
                          </div>
                        )}
                        <p className="text-[12px] mute text-center m-0">
                          {bulkProgress.done
                            ? `Added ${bulkProgress.added} episode${bulkProgress.added !== 1 ? 's' : ''}${bulkProgress.autoProcessing ? ` · ${bulkProgress.autoProcessing} auto-processing` : ''}${bulkProgress.skipped ? ` · ${bulkProgress.skipped} already in library` : ''}`
                            : bulkProgress.phase === 'fetching'
                              ? `Fetching all episodes${bulkProgress.fetched ? ` (${bulkProgress.fetched} found)` : ''}…`
                              : `Adding ${bulkProgress.current} / ${bulkProgress.total} episodes…`
                          }
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleBulkAdd(null)}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-medium transition-colors bg-[var(--accent)] text-[var(--accent-fg)] rounded-[var(--r-sm)] min-h-[36px]"
                        >
                          <Icons.Plus size={13} />
                          Add All ({episodes.length})
                        </button>
                        <button
                          onClick={handleAllTranscripts}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-medium transition-colors bg-[var(--surface)] border border-[var(--accent)] text-[var(--accent)] rounded-[var(--r-sm)] min-h-[36px]"
                        >
                          <Icons.FileText size={12} />
                          All Transcript
                        </button>
                        {bulkOptions.length > 0 && (
                          <div className="relative">
                            <button
                              onClick={() => setBulkMenuOpen(!bulkMenuOpen)}
                              className="flex items-center justify-center px-3 py-2 text-[12px] font-medium transition-colors bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-sm)] min-h-[36px]"
                            >
                              Recent
                              <Icons.Arrow size={10} className="ml-1.5 rotate-90" />
                            </button>
                            {bulkMenuOpen && (
                              <div className="absolute bottom-full right-0 mb-1 py-1 min-w-[120px] bg-[var(--bg-2)] border border-[var(--border)] rounded-[var(--r-md)] shadow-lg z-10">
                                {bulkOptions.map(opt => (
                                  <button
                                    key={opt.count}
                                    onClick={() => handleBulkAdd(opt.count)}
                                    className="w-full px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--surface)]"
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
      </div>
    </div>
  )
}
