import { useState, useRef, useCallback } from 'react'
import { searchShows, getEpisodes } from '../services/podcastIndex'
import * as Icons from './Icons'

export default function AddPodcastModal({ onClose, onAdd, onAddFromIndex }) {
  const [mode, setMode] = useState('search')
  const [step, setStep] = useState('shows')
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

  function isValidYouTubeUrl(str) {
    try {
      const u = new URL(str)
      return u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')
    } catch {
      return false
    }
  }

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
    <div
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-5"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[92vh] sm:max-h-[85vh] flex flex-col fade-in"
        style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--border)',
          borderRadius: '12px 12px var(--r-lg) var(--r-lg)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center px-[18px] py-3.5 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {step === 'episodes' && mode === 'search' && (
              <button onClick={handleBackToShows} className="mute p-0.5">
                <Icons.Back size={16} />
              </button>
            )}
            <h3 className="m-0 text-[15px] font-medium truncate">
              {step === 'episodes' ? decodeHtml(selectedShow?.title) : 'Add Podcast'}
            </h3>
          </div>
          <button onClick={onClose} className="ml-auto mute shrink-0">
            <Icons.X size={16} />
          </button>
        </div>

        {/* Mode tabs */}
        {step === 'shows' && (
          <div className="px-[18px] pt-3.5 shrink-0">
            <div
              className="flex gap-1 p-1"
              style={{ background: 'var(--surface)', borderRadius: 'var(--r-md)' }}
            >
              <button
                onClick={() => { setMode('search'); setError('') }}
                className="flex-1 text-[13px] py-1.5 transition-colors font-medium"
                style={{
                  background: mode === 'search' ? 'var(--accent)' : 'transparent',
                  color: mode === 'search' ? 'var(--accent-fg)' : 'var(--text-mute)',
                  borderRadius: 'var(--r-sm)',
                }}
              >
                Search Podcasts
              </button>
              <button
                onClick={() => { setMode('url'); setError('') }}
                className="flex-1 text-[13px] py-1.5 transition-colors font-medium"
                style={{
                  background: mode === 'url' ? 'var(--accent)' : 'transparent',
                  color: mode === 'url' ? 'var(--accent-fg)' : 'var(--text-mute)',
                  borderRadius: 'var(--r-sm)',
                }}
              >
                Paste URL
              </button>
            </div>
          </div>
        )}

        {/* Search mode */}
        {mode === 'search' ? (
          <div className="flex flex-col flex-1 min-h-0 px-[18px] py-3.5">
            {step === 'shows' && (
              <>
                <div className="shrink-0 mb-3">
                  <div
                    className="flex items-center gap-2 px-3 py-2"
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-md)',
                    }}
                  >
                    <Icons.Search size={14} className="mute shrink-0" />
                    <input
                      type="text"
                      value={query}
                      onChange={onQueryChange}
                      placeholder="Search for a podcast..."
                      className="flex-1 bg-transparent border-none outline-none text-[13.5px]"
                      style={{ color: 'var(--text)' }}
                      autoFocus
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-[12px] mb-2" style={{ color: 'var(--error)' }}>{error}</p>
                )}

                <div className="flex-1 overflow-y-auto min-h-0 space-y-1">
                  {searching && (
                    <div className="flex items-center justify-center py-8 gap-2">
                      <span
                        className="w-4 h-4 rounded-full border-2 animate-spin"
                        style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
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
                      className="w-full flex gap-3 p-2.5 text-left group transition-colors"
                      style={{ borderRadius: 'var(--r-md)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      {show.artwork && (
                        <img
                          src={show.artwork}
                          alt=""
                          className="w-[52px] h-[52px] object-cover shrink-0 transition-all"
                          style={{ borderRadius: 'var(--r-sm)' }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium line-clamp-1 m-0" style={{ color: 'var(--text)' }}>
                          {decodeHtml(show.title)}
                        </p>
                        <p className="text-[12px] dim mt-0.5 m-0">{show.author}</p>
                        <p className="text-[11px] mute mt-0.5 line-clamp-1 m-0">
                          {show.episodeCount ? `${show.episodeCount} episodes` : ''}
                          {show.episodeCount && show.description ? ' · ' : ''}
                          {truncate(decodeHtml(show.description), 80)}
                        </p>
                      </div>
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
                    by {selectedShow.author} · Select an episode to add
                  </p>
                )}

                {error && (
                  <p className="text-[12px] mb-2" style={{ color: 'var(--error)' }}>{error}</p>
                )}

                <div className="flex-1 overflow-y-auto min-h-0 space-y-0.5">
                  {loadingEpisodes && (
                    <div className="flex items-center justify-center py-8 gap-2">
                      <span
                        className="w-4 h-4 rounded-full border-2 animate-spin"
                        style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
                      />
                      <span className="text-[13px] mute">Loading episodes...</span>
                    </div>
                  )}

                  {!loadingEpisodes && episodes.length === 0 && (
                    <p className="mute text-[13px] text-center py-8">No episodes found</p>
                  )}

                  {!loadingEpisodes && episodes.map((ep) => (
                    <button
                      key={ep.id}
                      onClick={() => handleSelectEpisode(ep)}
                      disabled={loading}
                      className="w-full flex items-start gap-3 p-2.5 text-left disabled:opacity-50 disabled:cursor-not-allowed group transition-colors"
                      style={{ borderRadius: 'var(--r-md)' }}
                      onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = 'var(--surface)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <div
                        className="shrink-0 w-8 h-8 rounded-full grid place-items-center mt-0.5 transition-colors"
                        style={{ background: 'var(--accent-soft)' }}
                      >
                        <Icons.Plus size={14} style={{ color: 'var(--accent)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] font-medium line-clamp-2 leading-snug m-0" style={{ color: 'var(--text)' }}>
                          {decodeHtml(ep.title)}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {ep.duration > 0 && (
                            <span className="mono text-[11px]" style={{ color: 'var(--accent)' }}>
                              {formatDuration(ep.duration)}
                            </span>
                          )}
                          {ep.datePublished > 0 && (
                            <span className="text-[11px] mute">{formatDate(ep.datePublished)}</span>
                          )}
                          {ep.fileSize > 0 && (
                            <span className="text-[11px] mute">{formatFileSize(ep.fileSize)}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {loading && (
                  <div
                    className="flex items-center justify-center py-3 mt-2 shrink-0"
                    style={{ borderTop: '1px solid var(--border)' }}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border-2 animate-spin mr-2"
                      style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
                    />
                    <span className="text-[13px] mute">Adding episode...</span>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          /* URL mode */
          <form onSubmit={handleUrlSubmit} className="p-[18px] space-y-4">
            <div>
              <label className="block text-[11px] mono mute uppercase tracking-[0.1em] mb-1.5">
                Podcast URL
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full px-3 py-2 text-[13.5px] outline-none transition-colors"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  color: 'var(--text)',
                }}
                autoFocus
              />
              <p className="text-[11px] mute mt-1.5">
                Paste a YouTube URL directly. Podcast search above is recommended.
              </p>
              {error && (
                <p className="text-[12px] mt-1.5" style={{ color: 'var(--error)' }}>{error}</p>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm dim transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!url.trim() || loading}
                className="px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
                style={{
                  background: 'var(--accent)',
                  color: 'var(--accent-fg)',
                  borderRadius: 'var(--r-md)',
                }}
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
