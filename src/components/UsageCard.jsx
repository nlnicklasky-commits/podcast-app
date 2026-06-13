import { useState, useEffect } from 'react'
import { getUsageStats } from '../services/usage'

function StatRow({ label, value, icon }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-[var(--text-mute)] shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span className="flex-1 text-[13px] text-[var(--text-dim)]">{label}</span>
      <span className="text-[14px] font-medium tabular-nums">{value}</span>
    </div>
  )
}

export default function UsageCard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    getUsageStats()
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load usage')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)] p-5">
      <div className="text-[12px] mono mute uppercase tracking-[0.08em] mb-3">Usage</div>

      {loading && <p className="text-[13px] mute">Loading...</p>}

      {error && (
        <p className="text-[13px] text-[var(--error)]">{error}</p>
      )}

      {stats && !loading && (
        <div className="divide-y divide-[var(--border-soft)]">
          <StatRow
            label="Podcasts"
            value={stats.podcastCount.toLocaleString()}
            icon={<MicIcon />}
          />
          <StatRow
            label="Knowledge bases"
            value={stats.kbCount.toLocaleString()}
            icon={<LibraryIcon />}
          />
          <StatRow
            label="Chunks embedded"
            value={stats.totalChunks.toLocaleString()}
            icon={<BoxIcon />}
          />
          <StatRow
            label="Conversations"
            value={stats.conversationCount.toLocaleString()}
            icon={<ChatIcon />}
          />
        </div>
      )}
    </div>
  )
}

/* ---- Inline mini-icons (14px, stroke-only) ---- */

function MicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
    </svg>
  )
}

function LibraryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5h4v14H3zM10 5h4v14h-4zM17 7l3 1-4 13-3-1z" />
    </svg>
  )
}

function BoxIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z" />
    </svg>
  )
}
