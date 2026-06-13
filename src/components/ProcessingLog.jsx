import { useState, useEffect, useRef } from 'react'
import { getProcessingLogs } from '../services/processing'

const STEP_COLORS = {
  downloading: 'oklch(0.72 0.12 230)',
  transcribing: 'var(--accent)',
  processing: 'oklch(0.72 0.12 280)',
  ready: 'oklch(0.72 0.14 150)',
  error: 'var(--error)',
  cancelled: 'oklch(0.78 0.12 85)',
}

export default function ProcessingLog({ podcastId, status }) {
  const [logs, setLogs] = useState([])
  const [expanded, setExpanded] = useState(true)
  const bottomRef = useRef(null)
  const isActive = ['downloading', 'transcribing', 'processing'].includes(status)

  useEffect(() => {
    if (!podcastId) return

    getProcessingLogs(podcastId).then(setLogs).catch(() => {})

    if (!isActive) return

    // Self-scheduling poll. On repeated failures we back off exponentially
    // (3s -> 6s -> 12s -> 24s, capped at 30s) instead of permanently giving up,
    // so transient network blips recover on their own. Success resets the delay.
    const BASE_DELAY = 3000
    const MAX_DELAY = 30000
    let consecutiveErrors = 0
    let timer = null
    let stopped = false

    const schedule = (delay) => {
      if (stopped) return
      timer = setTimeout(tick, delay)
    }

    const tick = () => {
      getProcessingLogs(podcastId)
        .then((data) => {
          setLogs(data)
          consecutiveErrors = 0
          schedule(BASE_DELAY)
        })
        .catch(() => {
          consecutiveErrors++
          const delay = Math.min(BASE_DELAY * 2 ** (consecutiveErrors - 1), MAX_DELAY)
          schedule(delay)
        })
    }

    schedule(BASE_DELAY)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [podcastId, isActive])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length])

  if (logs.length === 0 && !isActive) return null

  function formatTime(dateStr) {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  }

  return (
    <div
      className="overflow-hidden bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)]"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3.5 text-[13px] transition-colors text-[var(--text-dim)] hover:text-[var(--text)]"
      >
        <span className="flex items-center gap-2">
          <span className="mono text-[11px] text-[var(--accent)]">{'>'}_</span>
          <span>Processing Log ({logs.length} entries)</span>
          {isActive && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-[oklch(0.72_0.14_150)] animate-[pulse-dot_1.2s_ease-in-out_infinite]"
            />
          )}
        </span>
        <span className="text-[11px] mute">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div
          className="p-3.5 max-h-48 overflow-y-auto mono text-[11px] border-t border-[var(--border)] bg-[var(--bg)]"
        >
          {logs.length === 0 ? (
            <p className="mute m-0">Waiting for logs...</p>
          ) : (
            <div className="space-y-1">
              {logs.map((log) => (
                <div key={log.id} className="flex gap-2">
                  <span className="shrink-0 text-[var(--text-mute)]">
                    {formatTime(log.created_at)}
                  </span>
                  <span
                    className="shrink-0 w-24"
                    style={{ color: STEP_COLORS[log.step] || 'var(--text-mute)' }}
                  >
                    [{log.step}]
                  </span>
                  <span className="text-[var(--text-dim)]">{log.message}</span>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
