function formatTimestamp(seconds) {
  if (seconds == null) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

function TranscriptViewer({ transcript, chunks }) {
  // If we have segments, show them with timestamps
  if (transcript?.segments && transcript.segments.length > 0) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Transcript</h3>
          <p className="text-sm text-gray-500">
            {transcript.word_count?.toLocaleString()} words
          </p>
        </div>

        <div className="p-4 max-h-[600px] overflow-y-auto space-y-4">
          {transcript.segments.map((segment, index) => (
            <div key={index} className="flex gap-3">
              <span className="text-xs text-gray-400 font-mono whitespace-nowrap pt-0.5">
                {formatTimestamp(segment.start)}
              </span>
              <p className="text-gray-700 text-sm leading-relaxed">
                {segment.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Fall back to chunks view
  if (chunks && chunks.length > 0) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Transcript Chunks</h3>
          <p className="text-sm text-gray-500">{chunks.length} chunks</p>
        </div>

        <div className="p-4 max-h-[600px] overflow-y-auto space-y-4">
          {chunks.map((chunk, index) => (
            <div key={chunk.id || index} className="border-b pb-4 last:border-b-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                  {formatTimestamp(chunk.start_time)} - {formatTimestamp(chunk.end_time)}
                </span>
                {chunk.token_count && (
                  <span className="text-xs text-gray-400">
                    {chunk.token_count} tokens
                  </span>
                )}
              </div>
              <p className="text-gray-700 text-sm leading-relaxed">
                {chunk.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // No transcript available
  return (
    <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
      No transcript available yet
    </div>
  )
}

export default TranscriptViewer
