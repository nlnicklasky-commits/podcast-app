import { useState, useEffect } from 'react'
import { generateSynthesis, getSynthesis } from '../services/synthesis'
import { synthesisToMarkdown, downloadMarkdown, slugify } from '../lib/export'
import { Tag } from './ui'
import * as Icons from './Icons'
import { timeAgo } from '../lib/utils'

export default function SynthesisPanel({ knowledgeBaseId, kbName, readyCount }) {
  const [synthesis, setSynthesis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getSynthesis(knowledgeBaseId)
      .then(setSynthesis)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [knowledgeBaseId])

  async function handleGenerate() {
    if (generating) return
    setGenerating(true)
    setError(null)
    try {
      const result = await generateSynthesis(knowledgeBaseId)
      setSynthesis(result.synthesis)
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return <div className="mute py-8 text-center text-sm">Loading synthesis...</div>
  }

  const canGenerate = readyCount >= 2

  // No synthesis yet — show prompt
  if (!synthesis) {
    return (
      <div className="text-center py-12 border border-dashed border-[var(--border)] rounded-[var(--r-lg)]">
        <Icons.Sparkle size={28} className="mx-auto mb-3 text-[var(--accent)]" />
        <p className="serif text-[18px] tracking-tight mb-1">Cross-Podcast Synthesis</p>
        <p className="text-sm mute mb-5 max-w-[360px] mx-auto">
          {canGenerate
            ? 'Analyze themes, agreements, and disagreements across all episodes in this knowledge base.'
            : `Add and process at least 2 podcasts to generate a synthesis. Currently ${readyCount} ready.`}
        </p>
        {canGenerate && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 text-sm font-semibold bg-[var(--accent)] text-[var(--accent-fg)] rounded-[var(--r-md)] disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate Synthesis'}
          </button>
        )}
        {error && (
          <p className="mt-3 text-[12px] text-[var(--error)]">{error}</p>
        )}
      </div>
    )
  }

  function handleExport() {
    if (!synthesis) return
    const md = synthesisToMarkdown(kbName || 'Knowledge Base', synthesis)
    const filename = `${slugify(kbName || 'kb')}-synthesis.md`
    downloadMarkdown(md, filename)
  }

  const themes = synthesis.themes || []
  const crossRefs = synthesis.cross_references || []

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Header with regenerate + export */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icons.Sparkle size={13} className="text-[var(--accent)]" />
          <span className="text-[11px] mono mute uppercase tracking-[0.1em]">
            Cross-Podcast Synthesis
          </span>
          {synthesis.generated_at && (
            <span className="text-[11px] mono mute">
              {timeAgo(synthesis.generated_at)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] dim bg-transparent border border-[var(--border)] rounded-[var(--r-md)] hover:bg-[var(--surface)]"
            title="Export synthesis as markdown"
          >
            <Icons.Download size={11} />
            Export
          </button>
          {canGenerate && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] dim bg-transparent border border-[var(--border)] rounded-[var(--r-md)] hover:bg-[var(--surface)] disabled:opacity-50"
            >
              <Icons.Sparkle size={11} />
              {generating ? 'Regenerating...' : 'Regenerate'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-[12px] text-[var(--error)]">{error}</p>
      )}

      {generating && (
        <div className="flex items-center gap-2.5 p-[18px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)]">
          <span className="inline-flex gap-[3px]">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-[5px] h-[5px] rounded-full bg-[var(--accent)]"
                style={{
                  animation: `pulse-dot 1.2s ease-in-out ${i * 0.18}s infinite`,
                }}
              />
            ))}
          </span>
          <span className="text-[12px] mono mute">Synthesizing across episodes...</span>
        </div>
      )}

      {/* Themes */}
      {themes.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="text-[11px] mono mute uppercase tracking-[0.1em]">
            Themes across episodes
          </div>
          {themes.map((theme, i) => (
            <div
              key={i}
              className="p-[18px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)]"
            >
              <div className="flex items-start gap-3 mb-2">
                <span className="mono text-[11px] pt-[3px] text-[var(--accent)] shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="serif text-[16px] font-medium tracking-tight m-0 mb-1.5">
                    {theme.title}
                  </h3>
                  <p className="text-[14px] leading-relaxed dim m-0 mb-3">
                    {theme.description}
                  </p>
                  {theme.episodes?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {theme.episodes.map((ep, j) => (
                        <Tag key={j} variant="accent">{ep}</Tag>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cross-references */}
      {crossRefs.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="text-[11px] mono mute uppercase tracking-[0.1em]">
            Agreements, Disagreements & Complements
          </div>
          {crossRefs.map((ref, i) => {
            const typeConfig = {
              agreement: {
                color: 'var(--success)',
                label: 'Agreement',
                bg: 'color-mix(in oklab, var(--success), transparent 90%)',
                border: 'color-mix(in oklab, var(--success), transparent 70%)',
              },
              disagreement: {
                color: 'var(--error)',
                label: 'Disagreement',
                bg: 'color-mix(in oklab, var(--error), transparent 90%)',
                border: 'color-mix(in oklab, var(--error), transparent 70%)',
              },
              complement: {
                color: 'var(--accent)',
                label: 'Complement',
                bg: 'var(--accent-faint)',
                border: 'var(--accent-soft)',
              },
            }
            const config = typeConfig[ref.type] || typeConfig.complement

            return (
              <div
                key={i}
                className="p-[18px] border rounded-[var(--r-lg)]"
                style={{
                  background: config.bg,
                  borderColor: config.border,
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] mono uppercase border"
                    style={{ color: config.color, borderColor: config.border }}
                  >
                    <span
                      className="w-[5px] h-[5px] rounded-full"
                      style={{ background: config.color }}
                    />
                    {config.label}
                  </span>
                </div>
                <h3 className="serif text-[15px] font-medium tracking-tight m-0 mb-1.5">
                  {ref.title}
                </h3>
                <p className="text-[13px] leading-relaxed dim m-0 mb-3">
                  {ref.description}
                </p>
                {ref.episodes?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {ref.episodes.map((ep, j) => (
                      <span
                        key={j}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] mono bg-[var(--bg-2)] border border-[var(--border)] text-[var(--text-dim)]"
                      >
                        <Icons.Headphones size={10} />
                        {ep}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
