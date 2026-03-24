import { useState } from 'react'

export default function AddPodcastModal({ onClose, onAdd }) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function isValidYouTubeUrl(str) {
    try {
      const u = new URL(str)
      return (
        u.hostname.includes('youtube.com') ||
        u.hostname.includes('youtu.be')
      )
    } catch {
      return false
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!isValidYouTubeUrl(url)) {
      setError('Please enter a valid YouTube URL')
      return
    }

    setLoading(true)
    try {
      await onAdd(url.trim())
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to add podcast')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a24] border border-white/10 rounded-xl w-full max-w-md p-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          Add Podcast
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              YouTube URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
              autoFocus
            />
            {error && (
              <p className="text-red-400 text-sm mt-1">{error}</p>
            )}
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
      </div>
    </div>
  )
}
