import { useState, useEffect } from 'react'
import { getInsights } from '../services/processing'
import { insightsToMarkdown, downloadMarkdown, slugify } from '../lib/export'
import { useToast } from '../lib/ToastContext'
import { Tag } from './ui'
import * as Icons from './Icons'

export default function InsightsPanel({ podcastId, podcastTitle, podcast }) {
  const { addToast } = useToast()
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getInsights(podcastId)
      .then(setInsights)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [podcastId])

  function handleExport() {
    if (!insights) return
    const podData = podcast || { title: podcastTitle }
    const md = insightsToMarkdown(podData, insights)
    const filename = `${slugify(podData.title || 'podcast')}-insights.md`
    downloadMarkdown(md, filename)
    addToast('Insights exported', 'success')
  }

  if (loading) {
    return <div className="mute py-8 text-center text-sm">Loading insights...</div>
  }

  if (!insights) {
    return (
      <div className="text-center py-8 mute">
        No insights generated yet. Process this podcast first.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Export button */}
      <div className="flex justify-end">
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] dim bg-transparent border border-[var(--border)] rounded-[var(--r-md)] hover:bg-[var(--surface)]"
          title="Export insights as markdown"
        >
          <Icons.Download size={11} />
          Export
        </button>
      </div>

      {/* Summary */}
      {insights.summary && (
        <div
          className="p-[18px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)]"
        >
          <div className="flex items-center gap-2 mb-2.5">
            <Icons.Sparkle size={13} className="text-[var(--accent)]" />
            <span className="text-[11px] mono mute uppercase tracking-[0.1em]">Summary</span>
          </div>
          <p className="serif text-[16px] leading-relaxed tracking-tight m-0 text-[var(--text)]">
            {insights.summary}
          </p>
        </div>
      )}

      {/* Key Points */}
      {insights.key_points?.length > 0 && (
        <div
          className="p-[18px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)]"
        >
          <div className="text-[11px] mono mute uppercase tracking-[0.1em] mb-3">Key points</div>
          <div className="flex flex-col gap-2.5">
            {insights.key_points.map((k, i) => (
              <div key={i} className="flex gap-3">
                <span className="mono text-[11px] pt-[3px] text-[var(--accent)]">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <p className="m-0 text-[14px] leading-relaxed text-[var(--text)]">{k}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Topics */}
      {insights.topics?.length > 0 && (
        <div
          className="p-[18px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)]"
        >
          <div className="text-[11px] mono mute uppercase tracking-[0.1em] mb-3">Topics</div>
          <div className="flex flex-wrap gap-1.5">
            {insights.topics.map((t) => <Tag key={t} variant="accent">{t}</Tag>)}
          </div>
        </div>
      )}

      {/* Entities */}
      {insights.entities?.length > 0 && (
        <div
          className="p-[18px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)]"
        >
          <div className="text-[11px] mono mute uppercase tracking-[0.1em] mb-3">
            People, Companies & Concepts
          </div>
          <div className="flex flex-wrap gap-1.5">
            {insights.entities.map((entity, i) => {
              const typeColors = {
                person: 'oklch(0.72 0.12 230)',
                company: 'oklch(0.72 0.12 150)',
                product: 'oklch(0.72 0.13 50)',
                concept: 'oklch(0.75 0.13 75)',
              }
              const c = typeColors[entity.type] || 'var(--text-mute)'
              return (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] mono bg-[var(--bg-2)] border border-[var(--border)] rounded-full text-[var(--text-dim)]"
                  title={entity.type}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: c }}
                  />
                  {entity.name}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
