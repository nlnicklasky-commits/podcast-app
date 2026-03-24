import { useState, useEffect } from 'react'

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
  transcribing: 'Transcribing with OpenAI Whisper...',
  processing: 'Generating embeddings & insights...',
  ready: 'All done!',
  error: 'Something went wrong',
  cancelled: 'Cancelling...',
}

function useElapsedTimer(isRunning, startedAt, finishedAt) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (startedAt && finishedAt) {
      const start = new Date(startedAt).getTime()
      const end = new Date(finishedAt).getTime()
      setElapsed(Math.max(0, Math.floor((end - start) / 1000)))
      return
    }

    if (isRunning && startedAt) {
      const start = new Date(startedAt).getTime()
      setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)))
      const interval = setInterval(() => {
        setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)))
      }, 1000)
      return () => clearInterval(interval)
    }

    if (isRunning) {
      const start = Date.now()
      setElapsed(0)
      const interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - start) / 1000))
      }, 1000)
      return () => clearInterval(interval)
    }

    setElapsed(0)
  }, [isRunning, startedAt, finishedAt])

  return elapsed
}

function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Processing progress bar with step tracker and elapsed timer.
 *
 * Props:
 *   status     – one of: pending, downloading, transcribing, processing, ready, error
 *   compact    – if true, renders a smaller version for cards (default false)
 *   progress   – 0-100 overall progress from the DB (written directly by edge function)
 *   startedAt  – optional ISO timestamp for when processing started
 *   finishedAt – optional ISO timestamp for when processing finished
 */
export default function ProcessingProgress({ status = 'pending', compact = false, progress = 0, startedAt, finishedAt }) {
  const currentIdx = STATUS_INDEX[status] ?? -1
  const isError = status === 'error'
  const isActive = !isError && status !== 'pending' && status !== 'ready'
  const isDone = status === 'ready'

  const elapsed = useElapsedTimer(isActive, startedAt, isDone ? finishedAt : null)

  // Use the actual progress value from the DB
  const pct = isDone ? 100 : isError ? 0 : Math.round(progress || 0)

  if (compact) {
    return (
      <div className="mt-2">
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
        <div className="flex items-center justify-between mt-1">
          <span className={`text-xs ${isError ? 'text-red-400' : 'text-gray-400'}`}>
            {STATUS_MESSAGES[status]}
          </span>
          <div className="flex items-center gap-2">
            {(isActive || (isDone && elapsed > 0)) && (
              <span className="text-xs text-gray-500 tabular-nums font-mono">
                {formatElapsed(elapsed)}
              </span>
            )}
            <span className={`text-xs tabular-nums ${isDone ? 'text-green-400' : 'text-purple-400'}`}>
              {pct}%
            </span>
          </div>
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

          return (
            <div key={step.id} className="flex items-center flex-1 last:flex-none">
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
                      isCompleted ? 'bg-green-500' : isCurrent ? 'bg-purple-500 animate-pulse' : ''
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

      {/* Full-width progress bar */}
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${
            isError
              ? 'bg-red-500'
              : isDone
                ? 'bg-green-500'
                : 'bg-gradient-to-r from-purple-600 to-purple-400'
          } ${isActive && status === 'transcribing' ? 'animate-progress-shimmer' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Status message + timer + percentage */}
      <div className="flex items-center justify-between mt-2">
        <span className={`text-sm ${isError ? 'text-red-400' : isDone ? 'text-green-400' : 'text-gray-300'}`}>
          {isActive && (
            <span className="inline-block w-1.5 h-1.5 bg-purple-400 rounded-full mr-2 animate-pulse" />
          )}
          {STATUS_MESSAGES[status]}
        </span>
        <div className="flex items-center gap-3">
          {(isActive || (isDone && elapsed > 0)) && (
            <span className="text-sm text-gray-400 tabular-nums font-mono">
              {formatElapsed(elapsed)}
            </span>
          )}
          <span className={`text-sm tabular-nums ${isDone ? 'text-green-400' : 'text-gray-400'}`}>
            {pct}%
          </span>
        </div>
      </div>
    </div>
  )
}
