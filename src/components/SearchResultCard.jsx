import { Link } from 'react-router-dom'
import { Tag } from './ui'
import * as Icons from './Icons'
import { formatTimestamp } from '../lib/utils'

const SNIPPET_MAX_LENGTH = 200

/** Truncate text to ~200 characters on a word boundary, adding ellipsis */
function truncateSnippet(text) {
  if (!text || text.length <= SNIPPET_MAX_LENGTH) return text
  const truncated = text.slice(0, SNIPPET_MAX_LENGTH)
  const lastSpace = truncated.lastIndexOf(' ')
  return (lastSpace > SNIPPET_MAX_LENGTH * 0.6 ? truncated.slice(0, lastSpace) : truncated) + '...'
}

export default function SearchResultCard({ result, isActive, onFindSimilar }) {
  const scorePercent = Math.round(result.similarity * 100)
  const primaryKbId = result.knowledge_base_ids?.[0]
  const linkTo = primaryKbId
    ? `/kb/${primaryKbId}/podcast/${result.podcast_id}?t=${Math.floor(result.start_time || 0)}`
    : `/podcast/${result.podcast_id}?t=${Math.floor(result.start_time || 0)}`

  const snippetText = truncateSnippet(result.text)

  return (
    <Link
      to={linkTo}
      className={`block p-4 bg-[var(--surface)] border rounded-[var(--r-lg)] transition-colors hover:border-[var(--accent-soft)] ${
        isActive
          ? 'border-[var(--accent-soft)] ring-1 ring-[var(--accent-soft)]'
          : 'border-[var(--border)]'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {result.thumbnail_url ? (
            <img
              src={result.thumbnail_url}
              alt=""
              className="w-8 h-8 rounded object-cover shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded bg-[var(--bg)] grid place-items-center shrink-0 mute">
              <Icons.Headphones size={14} />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-[13px] font-medium truncate">
              {result.podcast_title}
            </div>
            <div className="text-[11px] mono mute">
              {result.podcast_channel}
            </div>
          </div>
        </div>
        <span className="text-[11px] mono font-semibold px-1.5 py-0.5 rounded bg-[var(--accent-faint)] text-[var(--accent)] shrink-0">
          {scorePercent}%
        </span>
      </div>

      <div className="text-[11px] mono text-[var(--accent)] mb-1.5">
        @ {formatTimestamp(result.start_time)}
        {result.end_time ? ` – ${formatTimestamp(result.end_time)}` : ''}
      </div>

      <p className="serif text-[14px] leading-relaxed dim m-0">
        {snippetText}
      </p>

      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
        {result.knowledge_base_names?.map((name, i) => (
          <Tag key={result.knowledge_base_ids[i]} variant="accent">
            {name}
          </Tag>
        ))}
        {onFindSimilar && (
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onFindSimilar(result.text)
            }}
            className="text-[11px] mono mute hover:text-[var(--accent)] transition-colors"
          >
            Find similar →
          </button>
        )}
      </div>
    </Link>
  )
}
