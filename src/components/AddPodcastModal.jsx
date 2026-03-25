import { useState, useRef, useCallback } from 'react'
import { searchYouTube } from '../services/youtubeSearch'

export default function AddPodcastModal({ onClose, onAdd }) {
  const [mode, setMode] = useState('search') // 'search' | 'url'
  const [query, setQuery] = useState('')
  const [url, setUrl] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
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
      setResults([])
      return
    }
    setSearching(true)
    setError('')
    try {
      const data = await searchYouTube(q)
      setResults(data)
    } catch (err) {
      setError(err.message || 'Search failed')
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  function onQueryChange(e) {
    const val = e.target.value
    setQuery(val)
    setError('')

    // Debounce search — 500ms after typing stops
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => handleSearch(val), 500)
  }

  async function handleSelectResult(result) {
    setLoading(true)
    setError('')
    try {
      const res = await onAdd(result.url)
      if (res?.alreadyProcessed) setError('')
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to add podcast')
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

  // Decode HTML entities in titles (YouTube API returns &amp; etc.)
  function decodeHtml(html) {
    const txt = document.createElement('textarea')
    txt.innerHTML = html
    return txt.value
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a24] border border-white/10 rounded-xl w-full max-w-lg p-6 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Add Podcast</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-lg">✕</button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 bg-white/5 rounded-lg p-1 mb-4">
          <button
            onClick={() => { setMode('search'); setError('') }}
            className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${mode === 'search' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            Search YouTube
          </button>
          <button
            onClick={() => { setMode('url'); setError('') }}
            className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${mode === 'url' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            Paste URL
          </button>
        </div>

        {mode === 'search' ? (
          <div className="flex flex-col flex-1 min-h-0">
            <input
              type="text"
              value={query}
              onChange={onQueryChange}
              placeholder="Search for a podcast... e.g. Huberman, Lex Fridman"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors mb-3"
              autoFocus
            />

            {error && <p className="text-red-400 text-sm mb-2">{error}</p>}

            {/* Results area */}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-2">
              {searching && (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mr-2" />
                  <span className="text-gray-400 text-sm">Searching...</span>
                </div>
              )}

              {!searching && results.length === 0 && query.trim().length >= 2 && (
                <p className="text-gray-500 text-sm text-center py-8">No results found</p>
              )}

              {!searching && results.length === 0 && query.trim().length < 2 && (
                <p className="text-gray-500 text-sm text-center py-8">
                  Type a podcast name, host, or topic to search
                </p>
              )}

              {!searching && results.map((r) => (
                <button
                  key={r.videoId}
                  onClick={() => handleSelectResult(r)}
                  disabled={loading}
                  className="w-full flex gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  {r.thumbnail && (
                    <img
                      src={r.thumbnail}
                      alt=""
                      className="w-32 h-18 rounded-md object-cover flex-shrink-0 group-hover:ring-2 ring-purple-500 transition-all"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium line-clamp-2 leading-snug">
                      {decodeHtml(r.title)}
                    </p>
                    <p className="text-gray-400 text-xs mt-1">{r.channel}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {r.duration && <span className="text-purple-400 text-xs">{formatDuration(r.duration)}</span>}
                      {r.publishedAt && <span className="text-gray-500 text-xs">{r.publishedAt}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {loading && (
              <div className="flex items-center justify-center py-3 border-t border-white/5 mt-2">
                <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mr-2" />
                <span className="text-gray-400 text-sm">Adding podcast...</span>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleUrlSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">YouTube URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1">
                If this podcast was already added elsewhere, it won't need to be re-processed.
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
