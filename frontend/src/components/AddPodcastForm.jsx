import { useState } from 'react'
import { useAddPodcast, useJobStatus } from '../hooks/usePodcasts'
import ProcessingStatus from './ProcessingStatus'

function AddPodcastForm({ onSuccess }) {
  const [url, setUrl] = useState('')
  const [jobId, setJobId] = useState(null)
  const { addPodcast, loading, error, clearError } = useAddPodcast()
  const { job } = useJobStatus(jobId)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!url.trim()) return

    try {
      const result = await addPodcast(url)
      setJobId(result.job_id)
      setUrl('')
    } catch (err) {
      // Error is handled by the hook
    }
  }

  // Check if job completed successfully
  if (job?.status === 'completed') {
    setTimeout(() => {
      setJobId(null)
      onSuccess?.()
    }, 1000)
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Add Podcast</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-1">
            YouTube URL
          </label>
          <input
            type="url"
            id="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              clearError()
            }}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            disabled={loading || !!jobId}
          />
        </div>

        {error && (
          <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">
            {error}
          </div>
        )}

        {jobId && job && (
          <ProcessingStatus job={job} />
        )}

        <button
          type="submit"
          disabled={loading || !!jobId || !url.trim()}
          className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Adding...' : 'Add Podcast'}
        </button>
      </form>
    </div>
  )
}

export default AddPodcastForm
