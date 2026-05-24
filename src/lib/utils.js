export function formatDuration(seconds) {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function formatTimestamp(seconds) {
  if (!seconds && seconds !== 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function timeAgo(dateString) {
  const now = Date.now()
  const then = new Date(dateString).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return formatDate(dateString)
}

export const statusConfig = {
  ready:        { color: 'var(--success)', label: 'ready', anim: false },
  pending:      { color: 'var(--text-mute)', label: 'pending', anim: false },
  downloading:  { color: 'var(--warn)', label: 'downloading', anim: true },
  transcribing: { color: 'var(--warn)', label: 'transcribing', anim: true },
  processing:   { color: 'var(--accent)', label: 'processing', anim: true },
  error:        { color: 'var(--error)', label: 'error', anim: false },
  cancelled:    { color: 'var(--text-mute)', label: 'cancelled', anim: false },
}

export const statusColors = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  downloading: 'bg-blue-500/20 text-blue-400',
  transcribing: 'bg-purple-500/20 text-purple-400',
  processing: 'bg-indigo-500/20 text-indigo-400',
  ready: 'bg-green-500/20 text-green-400',
  error: 'bg-red-500/20 text-red-400',
  cancelled: 'bg-yellow-500/20 text-yellow-400',
}
