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

    getProcessingLogs(podcastId).then(setLogs)

    if (isActive || status === 'ready' || status === 'error') {
      const poll = setInterval(async () => {
        const data = await getProcessingLogs(podcastId)
        setLogs(data)
        if (status === 'ready' || status === 'error') {
          clearInterval(poll)
        }
      }, 3000)
      return () => clearInterval(poll)
    }
  }, [podcastId, status, isActive])

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
      className="overflow-hidden"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3.5 text-[13px] transition-colors"
        style={{ color: 'var(--text-dim)' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)' }}
      >
        <span className="flex items-center gap-2">
          <span className="mono text-[11px]" style={{ color: 'var(--accent)' }}>{'>'}_</span>
          <span>Processing Log ({logs.length} entries)</span>
          {isActive && (
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: 'oklch(0.72 0.14 150)', animation: 'pulse-dot 1.2s ease-in-out infinite' }}
            />
          )}
        </span>
        <span className="text-[11px] mute">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div
          className="p-3.5 max-h-48 overflow-y-auto mono text-[11px]"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)' }}
        >
          {logs.length === 0 ? (
            <p className="mute m-0">Waiting for logs...</p>
          ) : (
            <div className="space-y-1">
              {logs.map((log) => (
                <div key={log.id} className="flex gap-2">
                  <span className="shrink-0" style={{ color: 'var(--text-mute)' }}>
                    {formatTime(log.created_at)}
                  </span>
                  <span
                    className="shrink-0 w-24"
                    style={{ color: STEP_COLORS[log.step] || 'var(--text-mute)' }}
                  >
                    [{log.step}]
                  </span>
                  <span style={{ color: 'var(--text-dim)' }}>{log.message}</span>
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
