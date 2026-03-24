/**
 * Format a duration in seconds to a human-readable string
 */
export function formatDuration(seconds) {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

/**
 * Format a timestamp for display
 */
export function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Status badge color mapping
 */
export const statusColors = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  downloading: 'bg-blue-500/20 text-blue-400',
  transcribing: 'bg-purple-500/20 text-purple-400',
  processing: 'bg-indigo-500/20 text-indigo-400',
  ready: 'bg-green-500/20 text-green-400',
  error: 'bg-red-500/20 text-red-400',
  cancelled: 'bg-yellow-500/20 text-yellow-400',
}
