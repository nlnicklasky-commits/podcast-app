import { useState, useEffect, useRef } from 'react'
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
  cancelled: -2,
}

const STATUS_MESSAGES = {
  pending: 'Waiting to start...',
  downloading: 'Downloading audio...',
  transcribing: 'Transcribing with Whisper...',
  processing: 'Generating embeddings & insights...',
  ready: 'All done!',
  error: 'Something went wrong',
  cancelled: 'Processing cancelled',
}

function useElapsedTimer(isRunning, startedAt, finishedAt) {
  const [elapsed, setElapsed] = useState(0)
  // Stable start anchor (ms). Once running, it is locked in so the displayed
  // elapsed never jumps when the optimistic start is replaced by the DB value.
  const anchorRef = useRef(null)

  const startMs = startedAt ? new Date(startedAt).getTime() : null

  useEffect(() => {
    // Finished: show the exact span and stop. (DB start required to be accurate.)
    if (startMs && finishedAt) {
      const end = new Date(finishedAt).getTime()
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot elapsed computation for finished state; refactor tracked
      setElapsed(Math.max(0, Math.floor((end - startMs) / 1000)))
      return
    }

    if (!isRunning) {
      anchorRef.current = null
      setElapsed(0)
      return
    }

    // Running: pick the earliest known start so the counter is monotonic.
    // - First run with no DB time yet: anchor to now (optimistic).
    // - DB time arrives later: adopt it only if it is earlier, so elapsed
    //   never snaps backward and the optimistic count stays smooth.
    const candidate = startMs ?? Date.now()
    if (anchorRef.current == null || candidate < anchorRef.current) {
      anchorRef.current = candidate
    }
    const start = anchorRef.current

    setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)))
    const interval = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)))
    }, 1000)
    return () => clearInterval(interval)
  }, [isRunning, startMs, finishedAt])

  return elapsed
}

function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function ProcessingProgress({ status = 'pending', compact = false, progress = 0, startedAt, finishedAt }) {
  const currentIdx = STATUS_INDEX[status] ?? -1
  const isCancelled = status === 'cancelled'
  const isError = status === 'error' || isCancelled
  const isActive = !isError && status !== 'pending' && status !== 'ready'
  const isDone = status === 'ready'

  const elapsed = useElapsedTimer(isActive, startedAt, isDone ? finishedAt : null)
  const pct = isDone ? 100 : isError ? 0 : Math.round(progress || 0)

  if (compact) {
    return (
      <div className="mt-2">
        <div
          className="h-[3px] overflow-hidden bg-[var(--surface)] rounded-[2px]"
        >
          <div
            className={`h-full transition-all duration-700 ease-out ${
              isError
                ? 'bg-[var(--error)]'
                : isDone
                  ? 'bg-[oklch(0.72_0.14_150)]'
                  : 'bg-[var(--accent)]'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className={`text-[11px] ${isError ? 'text-[var(--error)]' : 'text-[var(--text-mute)]'}`}>
            {STATUS_MESSAGES[status]}
          </span>
          <div className="flex items-center gap-2">
            {(isActive || (isDone && elapsed > 0)) && (
              <span className="text-[11px] mono mute tabular-nums">
                {formatElapsed(elapsed)}
              </span>
            )}
            <span
              className={`text-[11px] mono tabular-nums ${isDone ? 'text-[oklch(0.72_0.14_150)]' : 'text-[var(--accent)]'}`}
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
                  className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full grid place-items-center text-[10px] sm:text-[11px] font-medium transition-all duration-500 ${
                    isCompleted
                      ? 'bg-[oklch(0.72_0.14_150)]'
                      : isCurrent
                        ? 'bg-[var(--accent)]'
                        : isError && currentIdx === i
                          ? 'bg-[var(--error)]'
                          : 'bg-[var(--surface)]'
                  } ${
                    isCompleted || isCurrent || (isError && currentIdx === i)
                      ? 'text-[oklch(0.18_0.02_50)]'
                      : 'text-[var(--text-mute)]'
                  } ${isCurrent ? 'shadow-[0_0_0_3px_var(--accent-soft)]' : ''}`}
                >
                  {isCompleted ? (
                    <Icons.Check size={12} />
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={`text-[10px] sm:text-[11px] mt-1 whitespace-nowrap mono ${
                    isCompleted
                      ? 'text-[oklch(0.72_0.14_150)]'
                      : isCurrent
                        ? 'text-[var(--accent)]'
                        : 'text-[var(--text-mute)]'
                  } ${isCurrent ? 'font-medium' : 'font-normal'}`}
                >
                  {step.label}
                </span>
              </div>

              {i < STEPS.length - 1 && (
                <div
                  className="flex-1 h-[2px] mx-1 sm:mx-2 mt-[-1rem] overflow-hidden bg-[var(--surface)] rounded-[2px]"
                >
                  <div
                    className={`h-full transition-all duration-700 ease-out ${
                      isCompleted
                        ? 'w-full bg-[oklch(0.72_0.14_150)]'
                        : isCurrent
                          ? 'w-1/2 bg-[var(--accent)] opacity-70'
                          : 'w-0 bg-[var(--accent)]'
                    }`}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Progress bar */}
      <div
        className="h-[4px] sm:h-[5px] overflow-hidden bg-[var(--surface)] rounded-[3px]"
      >
        <div
          className={`h-full transition-all duration-700 ease-out rounded-[3px] ${
            isActive && status === 'transcribing' ? 'animate-progress-shimmer' : ''
          } ${
            isError
              ? 'bg-[var(--error)]'
              : isDone
                ? 'bg-[oklch(0.72_0.14_150)]'
                : 'bg-[var(--accent)]'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Status message + timer + percentage */}
      <div className="flex items-center justify-between mt-2">
        <span className={`text-[13px] flex items-center gap-2 ${
          isError
            ? 'text-[var(--error)]'
            : isDone
              ? 'text-[oklch(0.72_0.14_150)]'
              : 'text-[var(--text-dim)]'
        }`}>
          {isActive && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-[pulse-dot_1.2s_ease-in-out_infinite]"
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
            className={`text-[12px] mono tabular-nums ${isDone ? 'text-[oklch(0.72_0.14_150)]' : 'text-[var(--text-dim)]'}`}
          >
            {pct}%
          </span>
        </div>
      </div>
    </div>
  )
}
