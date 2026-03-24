import { useState, useEffect, useRef } from 'react'
import { getProcessingLogs } from '../services/processing'

const STEP_COLORS = {
  downloading: 'text-blue-400',
  transcribing: 'text-purple-400',
  processing: 'text-indigo-400',
  ready: 'text-green-400',
  error: 'text-red-400',
  cancelled: 'text-yellow-400',
}

export default function ProcessingLog({ podcastId, status }) {
  const [logs, setLogs] = useState([])
  const [expanded, setExpanded] = useState(true)
  const bottomRef = useRef(null)
  const isActive = ['downloading', 'transcribing', 'processing'].includes(status)

  useEffect(() => {
    if (!podcastId) return

    // Initial fetch
    getProcessingLogs(podcastId).then(setLogs)

    // Poll while active
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

  // Auto-scroll to bottom on new logs
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
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 text-sm text-gray-400 hover:text-white transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="font-mono text-xs">{'>'}_</span>
          <span>Processing Log ({logs.length} entries)</span>
          {isActive && (
            <span className="inline-block w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
          )}
        </span>
        <span className="text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-white/5 bg-black/20 p-3 max-h-48 overflow-y-auto font-mono text-xs">
          {logs.length === 0 ? (
            <p className="text-gray-500">Waiting for logs...</p>
          ) : (
            <div className="space-y-1">
              {logs.map((log) => (
                <div key={log.id} className="flex gap-2">
                  <span className="text-gray-600 flex-shrink-0">
                    {formatTime(log.created_at)}
                  </span>
                  <span className={`flex-shrink-0 w-24 ${STEP_COLORS[log.step] || 'text-gray-400'}`}>
                    [{log.step}]
                  </span>
                  <span className="text-gray-300">{log.message}</span>
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
