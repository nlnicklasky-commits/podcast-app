import { useState, useRef, useCallback } from 'react'
import { searchShows, getEpisodes } from '../services/podcastIndex'

export default function AddPodcastModal({ onClose, onAdd, onAddFromIndex }) {
  const [mode, setMode] = useState('search') // 'search' | 'url'
  const [step, setStep] = useState('shows')   // 'shows' | 'episodes'
  const [query, setQuery] = useState('')
  const [url, setUrl] = useState('')
  const [shows, setShows] = useState([])
  const [selectedShow, setSelectedShow] = useState(null)
  const [episodes, setEpisodes] = useState([])
  const [searching, setSearching] = useState(false)
  const [loadingEpisodes, setLoadingEpisodes] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const searchTimeout = useRef(null)

  // --- YouTube URL helpers ---
  function isValidYouTubeUrl(str) {
    try {
      const u = new URL(str)
      return u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')
    } catch {
      return false
    }
  }

  // --- Podcast Index search ---
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
      const eps = await getEpisodes(show.id)
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

  async function handleUrlSubmit(e) {
    e.preventDefault()
    setError('')
    if (!isValidYouTubeUrl(url)) {
      setError('Please enter a valid YouTube URL')
      return
    }
    setLoading(true)
    try {
      const result = await onAdd(url.trim())
      if (result?.alreadyProcessed) setError('')
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to add podcast')
      setLoading(false)
    }
  }

  // --- Formatters ---
  function formatDuration(seconds) {
    if (!seconds) return ''
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
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

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-[#1a1a24] border border-white/10 rounded-t-xl sm:rounded-xl w-full max-w-xl p-4 sm:p-6 max-h-[92vh] sm:max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {step === 'episodes' && mode === 'search' && (
              <button
                onClick={handleBackToShows}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h2 className="text-xl font-semibold text-white">
              {step === 'episodes' ? decodeHtml(selectedShow?.title) : 'Add Podcast'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-lg">✕</button>
        </div>

        {/* Mode tabs — only show on main screen */}
        {step === 'shows' && (
          <div className="flex gap-1 bg-white/5 rounded-lg p-1 mb-4">
            <button
              onClick={() => { setMode('search'); setError('') }}
              className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${mode === 'search' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Search Podcasts
            </button>
            <button
              onClick={() => { setMode('url'); setError('') }}
              className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${mode === 'url' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Paste URL
            </button>
          </div>
        )}

        {/* ========== SEARCH MODE ========== */}
        {mode === 'search' ? (
          <div className="flex flex-col flex-1 min-h-0">

            {/* STEP 1: Search shows */}
            {step === 'shows' && (
              <>
                <input
                  type="text"
                  value={query}
                  onChange={onQueryChange}
                  placeholder="Search for a podcast... e.g. Huberman, Lex Fridman"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors mb-3"
                  autoFocus
                />

                {error && <p className="text-red-400 text-sm mb-2">{error}</p>}

                <div className="flex-1 overflow-y-auto min-h-0 space-y-2">
                  {searching && (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mr-2" />
                      <span className="text-gray-400 text-sm">Searching...</span>
                    </div>
                  )}

                  {!searching && shows.length === 0 && query.trim().length >= 2 && (
                    <p className="text-gray-500 text-sm text-center py-8">No podcasts found</p>
                  )}

                  {!searching && shows.length === 0 && query.trim().length < 2 && (
                    <p className="text-gray-500 text-sm text-center py-8">
                      Type a podcast name, host, or topic to search
                    </p>
                  )}

                  {!searching && shows.map((show) => (
                    <button
                      key={show.id}
                      onClick={() => handleSelectShow(show)}
                      className="w-full flex gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors text-left group"
                    >
                      {show.artwork && (
                        <img
                          src={show.artwork}
                          alt=""
                          className="w-14 h-14 rounded-lg object-cover flex-shrink-0 group-hover:ring-2 ring-purple-500 transition-all"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium line-clamp-1">
                          {decodeHtml(show.title)}
                        </p>
                        <p className="text-gray-400 text-xs mt-0.5">{show.author}</p>
                        <p className="text-gray-500 text-xs mt-0.5 line-clamp-1">
                          {show.episodeCount ? `${show.episodeCount} episodes` : ''}
                          {show.episodeCount && show.description ? ' · ' : ''}
                          {truncate(decodeHtml(show.description), 80)}
                        </p>
                      </div>
                      <svg className="w-5 h-5 text-gray-600 group-hover:text-purple-400 flex-shrink-0 mt-2 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* STEP 2: Browse episodes */}
            {step === 'episodes' && (
              <>
                {selectedShow && (
                  <p className="text-gray-400 text-xs mb-3">
                    by {selectedShow.author} · Select an episode to add
                  </p>
                )}

                {error && <p className="text-red-400 text-sm mb-2">{error}</p>}

                <div className="flex-1 overflow-y-auto min-h-0 space-y-1">
                  {loadingEpisodes && (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mr-2" />
                      <span className="text-gray-400 text-sm">Loading episodes...</span>
                    </div>
                  )}

                  {!loadingEpisodes && episodes.length === 0 && (
                    <p className="text-gray-500 text-sm text-center py-8">No episodes found</p>
                  )}

                  {!loadingEpisodes && episodes.map((ep) => (
                    <button
                      key={ep.id}
                      onClick={() => handleSelectEpisode(ep)}
                      disabled={loading}
                      className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-600/20 flex items-center justify-center mt-0.5 group-hover:bg-purple-600/40 transition-colors">
                        <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium line-clamp-2 leading-snug">
                          {decodeHtml(ep.title)}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {ep.duration > 0 && (
                            <span className="text-purple-400 text-xs">{formatDuration(ep.duration)}</span>
                          )}
                          {ep.datePublished > 0 && (
                            <span className="text-gray-500 text-xs">{formatDate(ep.datePublished)}</span>
                          )}
                          {ep.fileSize > 0 && (
                            <span className="text-gray-600 text-xs">{formatFileSize(ep.fileSize)}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {loading && (
                  <div className="flex items-center justify-center py-3 border-t border-white/5 mt-2">
                    <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mr-2" />
                    <span className="text-gray-400 text-sm">Adding episode...</span>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (

          /* ========== URL MODE ========== */
          <form onSubmit={handleUrlSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Podcast URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1">
                Paste a YouTube URL directly. Podcast search above is recommended.
              </p>
              {error && <p className="text-red-400 text-sm mt-1">{error}</p>}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!url.trim() || loading}
                className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {loading ? 'Adding...' : 'Add Podcast'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
