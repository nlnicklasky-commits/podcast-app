import { Link } from 'react-router-dom'

function formatTimestamp(seconds) {
  if (seconds == null) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function SearchResults({ results, loading, error }) {
  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <svg className="animate-spin h-8 w-8 text-indigo-600" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-red-600 bg-red-50 p-4 rounded-md">
        {error}
      </div>
    )
  }

  if (results.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      {results.map((result) => (
        <Link
          key={result.chunk_id}
          to={`/podcast/${result.podcast_id}`}
          className="block bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-medium text-gray-900">
              {result.podcast_title || 'Unknown podcast'}
            </h3>
            <span className="text-xs text-gray-400 ml-2">
              Score: {(result.score * 100).toFixed(0)}%
            </span>
          </div>

          <p className="text-gray-600 text-sm mb-2 line-clamp-3">
            {result.text}
          </p>

          {result.start_time != null && (
            <span className="inline-block text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
              {formatTimestamp(result.start_time)} - {formatTimestamp(result.end_time)}
            </span>
          )}
        </Link>
      ))}
    </div>
  )
}

export default SearchResults
