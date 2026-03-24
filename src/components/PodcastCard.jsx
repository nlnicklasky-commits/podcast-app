import { useState } from 'react'
import { statusColors, formatDuration, formatDate } from '../lib/utils'
import { processPodcast, getPodcastStatus } from '../services/processing'
import ProcessingProgress from './ProcessingProgress'

export default function PodcastCard({ podcast, onDelete, onStatusChange, onSelect }) {
  const [processing, setProcessing] = useState(false)
  const statusClass = statusColors[podcast.status] || statusColors.pending
  const isProcessing = ['downloading', 'transcribing', 'processing'].includes(podcast.status)

  async function handleProcess(e) {
    e.stopPropagation()
    if (processing || podcast.status === 'ready') return
    setProcessing(true)

    try {
      // Fire and forget — the Edge Function updates status as it goes
      processPodcast(podcast.id).catch(console.error)
      // Start polling for status updates
      if (onStatusChange) {
        const poll = setInterval(async () => {
          try {
            const status = await getPodcastStatus(podcast.id)
            if (status) {
              onStatusChange(podcast.id, status.status, status.error_message, status.progress)
              if (status.status === 'ready' || status.status === 'error') {
                clearInterval(poll)
                setProcessing(false)
              }
            }
          } catch {
            clearInterval(poll)
            setProcessing(false)
          }
        }, 3000)
      }
    } catch (err) {
      console.error(err)
      setProcessing(false)
    }
  }

  return (
    <div
      className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors group cursor-pointer"
      onClick={() => onSelect?.(podcast)}
    >
      <div className="flex gap-4">
        {/* Thumbnail */}
        {podcast.thumbnail_url ? (
          <img
            src={podcast.thumbnail_url}
            alt=""
            className="w-32 h-20 object-cover rounded-lg flex-shrink-0"
          />
        ) : (
          <div className="w-32 h-20 bg-white/5 rounded-lg flex-shrink-0 flex items-center justify-center text-2xl">
            🎙️
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-medium truncate">
            {podcast.title || 'Untitled Podcast'}
          </h3>
          {podcast.channel && (
            <p className="text-sm text-gray-400 mt-0.5">{podcast.channel}</p>
          )}
          <div className="flex items-center gap-3 mt-2">
            {!isProcessing && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass}`}>
                {podcast.status}
              </span>
            )}
            {podcast.duration_seconds && (
              <span className="text-xs text-gray-500">
                {formatDuration(podcast.duration_seconds)}
              </span>
            )}
            {!isProcessing && (
              <span className="text-xs text-gray-500">
                {formatDate(podcast.created_at)}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          {podcast.status === 'pending' && (
            <button
              onClick={handleProcess}
              disabled={processing}
              className="text-xs px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {processing ? 'Starting...' : 'Process'}
            </button>
          )}
          {podcast.status === 'error' && (
            <button
              onClick={handleProcess}
              disabled={processing}
              className="text-xs px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg transition-colors"
              title={podcast.error_message}
            >
              Retry
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(podcast.id)
            }}
            className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all p-1 text-xs"
            title="Remove podcast"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Progress bar — shown during active processing */}
      {(isProcessing || podcast.status === 'ready') && (
        <ProcessingProgress status={podcast.status} compact progress={podcast.progress} />
      )}

      {podcast.error_message && podcast.status === 'error' && (
        <p className="text-xs text-red-400 mt-2 truncate" title={podcast.error_message}>
          Error: {podcast.error_message}
        </p>
      )}
    </div>
  )
}
