const STEPS = [
  { id: 'downloading', label: 'Download' },
  { id: 'transcribing', label: 'Transcribe' },
  { id: 'processing', label: 'Process' },
  { id: 'ready', label: 'Ready' },
]

const STATUS_INDEX = {
  pending: -1,
  downloading: 0,
  transcribing: 1,
  processing: 2,
  ready: 3,
  error: -2,
}

const STATUS_MESSAGES = {
  pending: 'Waiting to start...',
  downloading: 'Downloading audio from YouTube...',
  transcribing: 'Transcribing with Deepgram...',
  processing: 'Generating embeddings & insights...',
  ready: 'All done!',
  error: 'Something went wrong',
}

/**
 * Processing progress bar with step tracker.
 *
 * Props:
 *   status    – one of: pending, downloading, transcribing, processing, ready, error
 *   compact   – if true, renders a smaller version for cards (default false)
 */
export default function ProcessingProgress({ status = 'pending', compact = false }) {
  const currentIdx = STATUS_INDEX[status] ?? -1
  const isError = status === 'error'
  const isActive = !isError && status !== 'pending' && status !== 'ready'
  const isDone = status === 'ready'

  // Bar fill percentage
  const pct = isDone ? 100 : isError ? 0 : Math.max(0, ((currentIdx + 0.5) / STEPS.length) * 100)

  if (compact) {
    return (
      <div className="mt-2">
        {/* Bar */}
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              isError
                ? 'bg-red-500'
                : isDone
                  ? 'bg-green-500'
                  : 'bg-purple-500'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {/* Status label */}
        <div className="flex items-center justify-between mt-1">
          <span className={`text-xs ${isError ? 'text-red-400' : 'text-gray-400'}`}>
            {STATUS_MESSAGES[status]}
          </span>
          {isActive && (
            <span className="text-xs text-purple-400 tabular-nums">
              {Math.round(pct)}%
            </span>
          )}
          {isDone && (
            <span className="text-xs text-green-400">100%</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-3">
      {/* Step tracker */}
      <div className="flex items-center justify-between mb-3">
        {STEPS.map((step, i) => {
          const isCompleted = currentIdx > i || isDone
          const isCurrent = currentIdx === i && !isDone
          const isUpcoming = currentIdx < i && !isDone

          return (
            <div key={step.id} className="flex items-center flex-1 last:flex-none">
              {/* Step dot + label */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-500 ${
                    isCompleted
                      ? 'bg-green-500 text-white'
                      : isCurrent
                        ? 'bg-purple-500 text-white ring-2 ring-purple-500/30'
                        : isError && currentIdx === i
                          ? 'bg-red-500 text-white'
                          : 'bg-white/10 text-gray-500'
                  }`}
                >
                  {isCompleted ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={`text-xs mt-1 whitespace-nowrap ${
                    isCompleted
                      ? 'text-green-400'
                      : isCurrent
                        ? 'text-purple-400 font-medium'
                        : 'text-gray-500'
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div className="flex-1 h-0.5 mx-2 mt-[-1rem] bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${
                      isCompleted ? 'bg-green-500 w-full' : isCurrent ? 'bg-purple-500 w-1/2 animate-pulse' : 'w-0'
                    }`}
                    style={{
                      width: isCompleted ? '100%' : isCurrent ? '50%' : '0%',
                    }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Full-width status bar */}
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${
            isError
              ? 'bg-red-500'
              : isDone
                ? 'bg-green-500'
                : 'bg-gradient-to-r from-purple-600 to-purple-400'
          } ${isActive ? 'animate-progress-shimmer' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Status message */}
      <div className="flex items-center justify-between mt-2">
        <span className={`text-sm ${isError ? 'text-red-400' : isDone ? 'text-green-400' : 'text-gray-300'}`}>
          {isActive && (
            <span className="inline-block w-1.5 h-1.5 bg-purple-400 rounded-full mr-2 animate-pulse" />
          )}
          {STATUS_MESSAGES[status]}
        </span>
        <span className={`text-sm tabular-nums ${isDone ? 'text-green-400' : 'text-gray-400'}`}>
          {Math.round(pct)}%
        </span>
      </div>
    </div>
  )
}
