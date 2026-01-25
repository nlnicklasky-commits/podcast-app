import { useNavigate } from 'react-router-dom'
import AddPodcastForm from '../components/AddPodcastForm'
import SearchBar from '../components/SearchBar'
import SearchResults from '../components/SearchResults'
import { useSearch } from '../hooks/useSearch'

function Home() {
  const navigate = useNavigate()
  const { results, loading, error, search, total } = useSearch()

  const handlePodcastAdded = () => {
    navigate('/library')
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Hero section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Podcast Knowledge Base
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Your personal second brain for podcast content. Add episodes, search
          transcripts, and discover insights across all your podcasts.
        </p>
      </div>

      {/* Add podcast form */}
      <div className="mb-12">
        <AddPodcastForm onSuccess={handlePodcastAdded} />
      </div>

      {/* Search section */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Search Your Library</h2>
        <SearchBar
          onSearch={(query) => search(query)}
          loading={loading}
          placeholder="Search across all podcast transcripts..."
        />
      </div>

      {/* Search results */}
      {(results.length > 0 || loading || error) && (
        <div>
          {total > 0 && (
            <p className="text-sm text-gray-500 mb-4">
              Found {total} matching segments
            </p>
          )}
          <SearchResults results={results} loading={loading} error={error} />
        </div>
      )}

      {/* Quick stats or empty state */}
      {results.length === 0 && !loading && !error && (
        <div className="text-center py-12 text-gray-500">
          <svg
            className="mx-auto h-16 w-16 text-gray-300 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
          <p className="text-lg">Start by adding a podcast above</p>
          <p className="text-sm mt-2">
            Paste a YouTube URL to begin building your knowledge base
          </p>
        </div>
      )}
    </div>
  )
}

export default Home
