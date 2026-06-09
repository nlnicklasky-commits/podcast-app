import { useNavigate } from 'react-router-dom'
import { useAudio } from '../lib/AudioContext'
import * as Icons from './Icons'

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function MiniPlayer() {
  const navigate = useNavigate()
  const { track, isPlaying, currentTime, duration, speed, togglePlay, seek, cycleSpeed, stop } =
    useAudio()

  if (!track) return null

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  function handleSeek(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = Math.max(0, Math.min(1, x / rect.width))
    seek(pct * duration)
  }

  function handleSkip(delta) {
    seek(Math.max(0, Math.min(duration, currentTime + delta)))
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg)] border-t border-[var(--border)] shadow-[0_-2px_12px_rgba(0,0,0,0.12)]">
      {/* Progress bar — clickable */}
      <div
        className="h-1 bg-[var(--border-soft)] cursor-pointer group"
        onClick={handleSeek}
      >
        <div
          className="h-full bg-[var(--accent)] transition-[width] duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 max-w-[1280px] mx-auto">
        {/* Thumbnail — click to navigate */}
        <button
          onClick={() => navigate(`/podcast/${track.podcastId}`)}
          className="shrink-0"
          title="Go to episode"
        >
          {track.thumbnailUrl ? (
            <img
              src={track.thumbnailUrl}
              alt=""
              className="w-10 h-10 rounded-[var(--r-sm)] object-cover"
              onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
            />
          ) : (
            <div className="w-10 h-10 rounded-[var(--r-sm)] bg-[var(--surface)] grid place-items-center mute">
              <Icons.Headphones size={16} />
            </div>
          )}
        </button>

        {/* Title / channel — click to navigate */}
        <button
          onClick={() => navigate(`/podcast/${track.podcastId}`)}
          className="flex-1 min-w-0 text-left"
        >
          <div className="text-[13px] font-medium truncate">{track.title || 'Untitled'}</div>
          <div className="text-[11px] mute truncate">{track.channel || ''}</div>
        </button>

        {/* Time display */}
        <span className="hidden sm:inline text-[11px] mono mute shrink-0">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleSkip(-15)}
            className="p-1.5 mute hover:text-[var(--text)] transition-colors"
            title="Back 15s"
          >
            <Icons.SkipBack size={14} />
          </button>

          <button
            onClick={togglePlay}
            className="p-2 rounded-full bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-90 transition-opacity"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Icons.Pause size={14} /> : <Icons.Play size={14} />}
          </button>

          <button
            onClick={() => handleSkip(30)}
            className="p-1.5 mute hover:text-[var(--text)] transition-colors"
            title="Forward 30s"
          >
            <Icons.SkipForward size={14} />
          </button>
        </div>

        {/* Speed */}
        <button
          onClick={cycleSpeed}
          className="shrink-0 px-2 py-1 text-[11px] mono font-semibold transition-colors bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-sm)] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--accent)]"
          title="Playback speed"
        >
          {speed}x
        </button>

        {/* Close */}
        <button
          onClick={stop}
          className="p-1 mute hover:text-[var(--text)] transition-colors"
          title="Close player"
        >
          <Icons.X size={14} />
        </button>
      </div>
    </div>
  )
}
