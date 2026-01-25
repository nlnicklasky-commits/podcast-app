import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { usePodcast } from '../hooks/usePodcasts'
import { useSearch } from '../hooks/useSearch'
import { podcastApi } from '../services/api'
import TranscriptViewer from '../components/TranscriptViewer'
import SearchBar from '../components/SearchBar'
import SearchResults from '../components/SearchResults'

function formatDuration(seconds) {
  if (!seconds) return '--:--'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  if (h > 0) {
    return `${h}h ${m}m`
  }
  return `${m}m ${s}s`
}

function formatDate(dateString) {
  if (!dateString) return 'Unknown date'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function PodcastDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { podcast, loading, error, refresh } = usePodcast(id)
  const { results, loading: searchLoading, error: searchError, search, total } = useSearch()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this podcast?')) {
      return
    }

    try {
      setDeleting(true)
      await podcastApi.delete(id)
      navigate('/library')
    } catch (err) {
      alert('Failed to delete: ' + err.message)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-center py-12">
          <svg className="animate-spin h-10 w-10 text-indigo-600" viewBox="0 0 24 24">
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
      </div>
    )
  }

  if (error || !podcast) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-red-50 text-red-600 p-4 rounded-md">
          {error || 'Podcast not found'}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-6 mb-8">
        {/* Thumbnail */}
        <div className="w-full md:w-64 flex-shrink-0">
          <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
            {podcast.thumbnail_url ? (
              <img
                src={podcast.thumbnail_url}
                alt={podcast.title}
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
          </div>
        </div>

        {/* Info */}
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {podcast.title || 'Processing...'}
          </h1>
          <p className="text-gray-600 mb-4">{podcast.channel || 'Unknown channel'}</p>

          <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-4">
            {podcast.duration_seconds && (
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {formatDuration(podcast.duration_seconds)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              {formatDate(podcast.published_at)}
            </span>
          </div>

          <div className="flex gap-2">
            <a
              href={podcast.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              Watch on YouTube
            </a>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </div>

      {/* Search within podcast */}
      {podcast.status === 'ready' && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Search in this podcast</h2>
          <SearchBar
            onSearch={(query) => search(query, 10, podcast.id)}
            loading={searchLoading}
            placeholder="Search transcript..."
          />
          {(results.length > 0 || searchLoading || searchError) && (
            <div className="mt-4">
              {total > 0 && (
                <p className="text-sm text-gray-500 mb-2">
                  Found {total} matching segments
                </p>
              )}
              <SearchResults results={results} loading={searchLoading} error={searchError} />
            </div>
          )}
        </div>
      )}

      {/* Status indicator for processing */}
      {podcast.status !== 'ready' && podcast.status !== 'error' && (
        <div className="bg-blue-50 text-blue-700 p-4 rounded-md mb-8">
          <div className="flex items-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
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
            <span>Processing: {podcast.status}</span>
          </div>
          <button
            onClick={refresh}
            className="mt-2 text-sm underline hover:no-underline"
          >
            Refresh status
          </button>
        </div>
      )}

      {/* Error state */}
      {podcast.status === 'error' && (
        <div className="bg-red-50 text-red-700 p-4 rounded-md mb-8">
          <strong>Error:</strong> {podcast.error_message || 'An error occurred during processing'}
        </div>
      )}

      {/* Transcript */}
      {podcast.status === 'ready' && (
        <TranscriptViewer
          transcript={podcast.transcript}
          chunks={podcast.chunks}
        />
      )}
    </div>
  )
}

export default PodcastDetail
