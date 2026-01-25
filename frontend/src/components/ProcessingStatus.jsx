function ProcessingStatus({ job }) {
  if (!job) return null

  const getStepLabel = (step) => {
    const labels = {
      queued: 'Queued',
      downloading: 'Downloading audio...',
      transcribing: 'Transcribing with Whisper...',
      chunking: 'Chunking transcript...',
      embedding: 'Generating embeddings...',
      done: 'Complete!',
    }
    return labels[step] || step
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-50'
      case 'failed':
        return 'text-red-600 bg-red-50'
      case 'running':
        return 'text-blue-600 bg-blue-50'
      default:
        return 'text-gray-600 bg-gray-50'
    }
  }

  return (
    <div className={`p-4 rounded-md ${getStatusColor(job.status)}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium">
          {job.status === 'completed' ? 'Done!' : getStepLabel(job.current_step)}
        </span>
        <span className="text-sm">{job.progress}%</span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${
            job.status === 'completed'
              ? 'bg-green-500'
              : job.status === 'failed'
              ? 'bg-red-500'
              : 'bg-blue-500'
          }`}
          style={{ width: `${job.progress}%` }}
        />
      </div>

      {job.error_message && (
        <p className="mt-2 text-sm">{job.error_message}</p>
      )}
    </div>
  )
}

export default ProcessingStatus
