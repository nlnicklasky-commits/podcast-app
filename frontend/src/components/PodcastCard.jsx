import { Link } from 'react-router-dom'

function formatDuration(seconds) {
  if (!seconds) return '--:--'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatDate(dateString) {
  if (!dateString) return 'Unknown date'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function getStatusBadge(status) {
  const badges = {
    pending: 'bg-gray-100 text-gray-700',
    downloading: 'bg-yellow-100 text-yellow-700',
    transcribing: 'bg-blue-100 text-blue-700',
    extracting: 'bg-purple-100 text-purple-700',
    ready: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
  }
  return badges[status] || badges.pending
}

function PodcastCard({ podcast }) {
  return (
    <Link
      to={`/podcast/${podcast.id}`}
      className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow overflow-hidden"
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-gray-100 relative">
        {podcast.thumbnail_url ? (
          <img
            src={podcast.thumbnail_url}
            alt={podcast.title || 'Podcast thumbnail'}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </div>
        )}

        {/* Duration badge */}
        {podcast.duration_seconds && (
          <span className="absolute bottom-2 right-2 bg-black/75 text-white text-xs px-2 py-1 rounded">
            {formatDuration(podcast.duration_seconds)}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-medium text-gray-900 line-clamp-2 mb-1">
          {podcast.title || 'Processing...'}
        </h3>
        <p className="text-sm text-gray-500 mb-2">
          {podcast.channel || 'Unknown channel'}
        </p>

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {formatDate(podcast.published_at || podcast.created_at)}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusBadge(podcast.status)}`}>
            {podcast.status}
          </span>
        </div>
      </div>
    </Link>
  )
}

export default PodcastCard
