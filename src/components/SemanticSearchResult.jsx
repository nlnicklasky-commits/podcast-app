import { Link } from 'react-router-dom'
import { Tag } from './ui'
import * as Icons from './Icons'
import { formatTimestamp } from '../lib/utils'

const SNIPPET_MAX_LENGTH = 280

function truncateSnippet(text) {
  if (!text || text.length <= SNIPPET_MAX_LENGTH) return text
  const truncated = text.slice(0, SNIPPET_MAX_LENGTH)
  const lastSpace = truncated.lastIndexOf(' ')
  return (lastSpace > SNIPPET_MAX_LENGTH * 0.6 ? truncated.slice(0, lastSpace) : truncated) + '...'
}

export default function SemanticSearchResult({ result, isActive, onFindSimilar }) {
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
      {/* Header: podcast info + similarity score */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {result.thumbnail_url ? (
            <img
              src={result.thumbnail_url}
              alt=""
              loading="lazy"
              decoding="async"
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
            {result.podcast_channel && (
              <div className="text-[11px] mono mute">
                {result.podcast_channel}
              </div>
            )}
          </div>
        </div>

        {/* Similarity score badge */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-[11px] mono font-semibold px-1.5 py-0.5 rounded bg-[var(--accent-faint)] text-[var(--accent)]">
            {scorePercent}%
          </span>
          {/* Score bar */}
          <div className="w-12 h-1 rounded-full bg-[var(--border)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all"
              style={{ width: `${scorePercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Timestamp link */}
      <div className="text-[11px] mono text-[var(--accent)] mb-1.5">
        @ {formatTimestamp(result.start_time)}
        {result.end_time ? ` - ${formatTimestamp(result.end_time)}` : ''}
      </div>

      {/* Chunk text */}
      <p className="serif text-[14px] leading-relaxed dim m-0">
        {snippetText}
      </p>

      {/* Footer: KB tags + find similar */}
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
            Find similar
          </button>
        )}
      </div>
    </Link>
  )
}
