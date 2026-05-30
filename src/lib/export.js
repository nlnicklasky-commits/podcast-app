import { formatDuration, formatDate } from './utils'

/**
 * Generic download helper — creates a Blob, generates a temporary URL,
 * and triggers a browser download.
 */
export function downloadAsTextFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Download a string as a .md file.
 */
export function downloadMarkdown(content, filename) {
  downloadAsTextFile(content, filename, 'text/markdown')
}

/**
 * Convert a single podcast's insights into clean markdown.
 *
 * @param {{ title?: string, channel?: string, duration_seconds?: number }} podcast
 * @param {{ summary?: string, key_points?: string[], topics?: string[], entities?: Array<{ name: string, type?: string }> }} insights
 * @returns {string} Markdown string
 */
export function insightsToMarkdown(podcast, insights) {
  const lines = []

  lines.push(`# ${podcast.title || 'Untitled Podcast'}`)
  if (podcast.channel) lines.push(`**Channel:** ${podcast.channel}`)
  if (podcast.duration_seconds) lines.push(`**Duration:** ${formatDuration(podcast.duration_seconds)}`)
  lines.push('')

  if (insights.summary) {
    lines.push('## Summary')
    lines.push(insights.summary)
    lines.push('')
  }

  if (insights.key_points?.length > 0) {
    lines.push('## Key Points')
    for (const point of insights.key_points) {
      lines.push(`- ${point}`)
    }
    lines.push('')
  }

  if (insights.topics?.length > 0) {
    lines.push('## Topics')
    for (const topic of insights.topics) {
      lines.push(`- ${topic}`)
    }
    lines.push('')
  }

  if (insights.entities?.length > 0) {
    lines.push('## Entities')
    for (const entity of insights.entities) {
      const name = typeof entity === 'string' ? entity : entity.name
      lines.push(`- ${name}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Convert a KB synthesis into clean markdown.
 *
 * @param {string} kbName
 * @param {{ themes?: Array<{ title: string, description: string, episodes?: string[] }>, cross_references?: Array<{ type: string, title: string, description: string, episodes?: string[] }>, generated_at?: string }} synthesis
 * @returns {string} Markdown string
 */
export function synthesisToMarkdown(kbName, synthesis) {
  const lines = []

  lines.push(`# ${kbName} — Cross-Podcast Synthesis`)
  if (synthesis.generated_at) {
    lines.push(`Generated: ${formatDate(synthesis.generated_at)}`)
  }
  lines.push('')

  const themes = synthesis.themes || []
  if (themes.length > 0) {
    lines.push('## Themes')
    for (const theme of themes) {
      lines.push(`### ${theme.title}`)
      if (theme.description) lines.push(theme.description)
      if (theme.episodes?.length > 0) {
        lines.push(`Episodes: ${theme.episodes.join(', ')}`)
      }
      lines.push('')
    }
  }

  const crossRefs = synthesis.cross_references || []
  const agreements = crossRefs.filter((r) => r.type === 'agreement')
  const disagreements = crossRefs.filter((r) => r.type === 'disagreement')
  const complements = crossRefs.filter((r) => r.type === 'complement')

  if (crossRefs.length > 0) {
    lines.push('## Cross-References')

    if (agreements.length > 0) {
      lines.push('### Agreements')
      for (const ref of agreements) {
        const episodes = ref.episodes?.length > 0 ? ` (${ref.episodes.join(', ')})` : ''
        lines.push(`- **${ref.title}** — ${ref.description}${episodes}`)
      }
      lines.push('')
    }

    if (disagreements.length > 0) {
      lines.push('### Disagreements')
      for (const ref of disagreements) {
        const episodes = ref.episodes?.length > 0 ? ` (${ref.episodes.join(', ')})` : ''
        lines.push(`- **${ref.title}** — ${ref.description}${episodes}`)
      }
      lines.push('')
    }

    if (complements.length > 0) {
      lines.push('### Complements')
      for (const ref of complements) {
        const episodes = ref.episodes?.length > 0 ? ` (${ref.episodes.join(', ')})` : ''
        lines.push(`- **${ref.title}** — ${ref.description}${episodes}`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

/**
 * Build a single combined markdown export for an entire knowledge base:
 * all podcast insights + the KB synthesis.
 *
 * @param {string} kbName
 * @param {Array<{ podcast: object, insights: object }>} podcastInsights
 * @param {object|null} synthesis
 * @returns {string}
 */
export function fullKBToMarkdown(kbName, podcastInsights, synthesis) {
  const lines = []

  lines.push(`# ${kbName} — Full Export`)
  lines.push(`Exported: ${formatDate(new Date().toISOString())}`)
  lines.push('')

  // Synthesis first if available
  if (synthesis) {
    lines.push('---')
    lines.push('')
    lines.push(synthesisToMarkdown(kbName, synthesis))
  }

  // Individual podcast insights
  if (podcastInsights.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push('## Individual Episode Insights')
    lines.push('')

    for (const { podcast, insights } of podcastInsights) {
      lines.push('---')
      lines.push('')
      lines.push(insightsToMarkdown(podcast, insights))
    }
  }

  return lines.join('\n')
}

/**
 * Slugify a string for use in filenames.
 */
export function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}
