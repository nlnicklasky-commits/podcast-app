import { useState, useEffect } from 'react'
import * as Icons from './Icons'

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
  downloading: 'Downloading audio...',
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

export default function ProcessingProgress({ status = 'pending', compact = false, progress = 0, startedAt, finishedAt }) {
  const currentIdx = STATUS_INDEX[status] ?? -1
  const isError = status === 'error'
  const isActive = !isError && status !== 'pending' && status !== 'ready'
  const isDone = status === 'ready'

  const elapsed = useElapsedTimer(isActive, startedAt, isDone ? finishedAt : null)
  const pct = isDone ? 100 : isError ? 0 : Math.round(progress || 0)

  if (compact) {
    return (
      <div className="mt-2">
        <div
          className="h-[3px] overflow-hidden"
          style={{ background: 'var(--surface)', borderRadius: 2 }}
        >
          <div
            className="h-full transition-all duration-700 ease-out"
            style={{
              width: `${pct}%`,
              background: isError ? 'var(--error)' : isDone ? 'oklch(0.72 0.14 150)' : 'var(--accent)',
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[11px]" style={{ color: isError ? 'var(--error)' : 'var(--text-mute)' }}>
            {STATUS_MESSAGES[status]}
          </span>
          <div className="flex items-center gap-2">
            {(isActive || (isDone && elapsed > 0)) && (
              <span className="text-[11px] mono mute tabular-nums">
                {formatElapsed(elapsed)}
              </span>
            )}
            <span
              className="text-[11px] mono tabular-nums"
              style={{ color: isDone ? 'oklch(0.72 0.14 150)' : 'var(--accent)' }}
            >
              {pct}%
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Step tracker */}
      <div className="flex items-center justify-between mb-3">
        {STEPS.map((step, i) => {
          const isCompleted = currentIdx > i || isDone
          const isCurrent = currentIdx === i && !isDone

          return (
            <div key={step.id} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className="w-5 h-5 sm:w-6 sm:h-6 rounded-full grid place-items-center text-[10px] sm:text-[11px] font-medium transition-all duration-500"
                  style={{
                    background: isCompleted
                      ? 'oklch(0.72 0.14 150)'
                      : isCurrent
                        ? 'var(--accent)'
                        : isError && currentIdx === i
                          ? 'var(--error)'
                          : 'var(--surface)',
                    color: isCompleted || isCurrent || (isError && currentIdx === i)
                      ? 'oklch(0.18 0.02 50)'
                      : 'var(--text-mute)',
                    boxShadow: isCurrent ? '0 0 0 3px var(--accent-soft)' : 'none',
                  }}
                >
                  {isCompleted ? (
                    <Icons.Check size={12} />
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className="text-[10px] sm:text-[11px] mt-1 whitespace-nowrap mono"
                  style={{
                    color: isCompleted
                      ? 'oklch(0.72 0.14 150)'
                      : isCurrent
                        ? 'var(--accent)'
                        : 'var(--text-mute)',
                    fontWeight: isCurrent ? 500 : 400,
                  }}
                >
                  {step.label}
                </span>
              </div>

              {i < STEPS.length - 1 && (
                <div
                  className="flex-1 h-[2px] mx-1 sm:mx-2 mt-[-1rem] overflow-hidden"
                  style={{ background: 'var(--surface)', borderRadius: 2 }}
                >
                  <div
                    className="h-full transition-all duration-700 ease-out"
                    style={{
                      width: isCompleted ? '100%' : isCurrent ? '50%' : '0%',
                      background: isCompleted ? 'oklch(0.72 0.14 150)' : 'var(--accent)',
                      opacity: isCurrent ? 0.7 : 1,
                    }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Progress bar */}
      <div
        className="h-[4px] sm:h-[5px] overflow-hidden"
        style={{ background: 'var(--surface)', borderRadius: 3 }}
      >
        <div
          className={`h-full transition-all duration-700 ease-out ${isActive && status === 'transcribing' ? 'animate-progress-shimmer' : ''}`}
          style={{
            width: `${pct}%`,
            background: isError
              ? 'var(--error)'
              : isDone
                ? 'oklch(0.72 0.14 150)'
                : 'var(--accent)',
            borderRadius: 3,
          }}
        />
      </div>

      {/* Status message + timer + percentage */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-[13px] flex items-center gap-2" style={{
          color: isError ? 'var(--error)' : isDone ? 'oklch(0.72 0.14 150)' : 'var(--text-dim)',
        }}>
          {isActive && (
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: 'var(--accent)', animation: 'pulse-dot 1.2s ease-in-out infinite' }}
            />
          )}
          {STATUS_MESSAGES[status]}
        </span>
        <div className="flex items-center gap-3">
          {(isActive || (isDone && elapsed > 0)) && (
            <span className="text-[12px] mono mute tabular-nums">
              {formatElapsed(elapsed)}
            </span>
          )}
          <span
            className="text-[12px] mono tabular-nums"
            style={{ color: isDone ? 'oklch(0.72 0.14 150)' : 'var(--text-dim)' }}
          >
            {pct}%
          </span>
        </div>
      </div>
    </div>
  )
}
