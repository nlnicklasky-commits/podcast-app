import { formatDuration, formatDate, formatTimestamp } from './utils'

const FOOTER = () =>
  `\n---\n*Exported from PodBrain on ${formatDate(new Date().toISOString())}*\n`

/**
 * Generate markdown for a single podcast's insights.
 *
 * @param {{ title?: string, channel?: string, duration_seconds?: number, url?: string }} podcast
 * @param {{ summary?: string, key_points?: string[], topics?: string[], entities?: Array<{ name: string, type?: string }> }} insights
 * @param {{ summary?: boolean, keyPoints?: boolean, topics?: boolean, entities?: boolean }} [options]
 * @returns {string}
 */
export function podcastInsightsMarkdown(podcast, insights, options = {}) {
  const opts = { summary: true, keyPoints: true, topics: true, entities: true, ...options }
  const lines = []

  lines.push(`# ${podcast.title || 'Untitled Podcast'}`)
  lines.push('')
  const meta = []
  if (podcast.channel) meta.push(`**Show:** ${podcast.channel}`)
  if (podcast.duration_seconds) meta.push(`**Duration:** ${formatDuration(podcast.duration_seconds)}`)
  if (podcast.url) meta.push(`**Source:** ${podcast.url}`)
  if (meta.length > 0) {
    lines.push(meta.join('  |  '))
    lines.push('')
  }

  if (opts.summary && insights?.summary) {
    lines.push('## Summary')
    lines.push('')
    lines.push(insights.summary)
    lines.push('')
  }

  if (opts.keyPoints && insights?.key_points?.length > 0) {
    lines.push('## Key Points')
    lines.push('')
    for (const point of insights.key_points) {
      lines.push(`- ${point}`)
    }
    lines.push('')
  }

  if (opts.topics && insights?.topics?.length > 0) {
    lines.push('## Topics')
    lines.push('')
    for (const topic of insights.topics) {
      lines.push(`- ${topic}`)
    }
    lines.push('')
  }

  if (opts.entities && insights?.entities?.length > 0) {
    lines.push('## People, Companies & Concepts')
    lines.push('')
    for (const entity of insights.entities) {
      const name = typeof entity === 'string' ? entity : entity.name
      const type = typeof entity === 'string' ? '' : entity.type
      lines.push(`- ${name}${type ? ` *(${type})*` : ''}`)
    }
    lines.push('')
  }

  lines.push(FOOTER())
  return lines.join('\n')
}

/**
 * Generate markdown for a podcast transcript with optional timestamps.
 *
 * @param {{ title?: string, channel?: string, duration_seconds?: number }} podcast
 * @param {{ full_text?: string, segments?: Array<{ start: number, end?: number, text?: string, sentences?: Array<{ text: string }> }>, word_count?: number }} transcript
 * @param {{ timestamps?: boolean }} [options]
 * @returns {string}
 */
export function podcastTranscriptMarkdown(podcast, transcript, options = {}) {
  const opts = { timestamps: true, ...options }
  const lines = []

  lines.push(`# Transcript: ${podcast.title || 'Untitled Podcast'}`)
  lines.push('')
  const meta = []
  if (podcast.channel) meta.push(`**Show:** ${podcast.channel}`)
  if (podcast.duration_seconds) meta.push(`**Duration:** ${formatDuration(podcast.duration_seconds)}`)
  if (transcript?.word_count) meta.push(`**Words:** ${transcript.word_count.toLocaleString()}`)
  if (meta.length > 0) {
    lines.push(meta.join('  |  '))
    lines.push('')
  }

  lines.push('---')
  lines.push('')

  if (transcript?.segments?.length > 0) {
    for (const seg of transcript.segments) {
      const text = seg.sentences?.map((s) => s.text).join(' ') || seg.text || ''
      if (!text) continue
      if (opts.timestamps) {
        lines.push(`**[${formatTimestamp(seg.start)}]** ${text}`)
      } else {
        lines.push(text)
      }
      lines.push('')
    }
  } else if (transcript?.full_text) {
    lines.push(transcript.full_text)
    lines.push('')
  } else {
    lines.push('*No transcript available.*')
    lines.push('')
  }

  lines.push(FOOTER())
  return lines.join('\n')
}

/**
 * Generate a full knowledge base summary with a table of contents.
 *
 * @param {{ name: string, description?: string }} kb
 * @param {Array<{ podcast: { id: string, title?: string, channel?: string, duration_seconds?: number, url?: string }, insights: { summary?: string, key_points?: string[], topics?: string[], entities?: Array<{ name: string, type?: string }> } | null }>} podcastsWithInsights
 * @param {{ summary?: boolean, keyPoints?: boolean, topics?: boolean, entities?: boolean }} [options]
 * @returns {string}
 */
export function kbSummaryMarkdown(kb, podcastsWithInsights, options = {}) {
  const opts = { summary: true, keyPoints: true, topics: true, entities: true, ...options }
  const lines = []

  lines.push(`# ${kb.name}`)
  lines.push('')
  if (kb.description) {
    lines.push(kb.description)
    lines.push('')
  }
  lines.push(`**${podcastsWithInsights.length} episodes**`)
  lines.push('')

  // Table of contents
  if (podcastsWithInsights.length > 1) {
    lines.push('## Table of Contents')
    lines.push('')
    podcastsWithInsights.forEach((item, i) => {
      const title = item.podcast.title || 'Untitled'
      const anchor = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      lines.push(`${i + 1}. [${title}](#${anchor})`)
    })
    lines.push('')
  }

  lines.push('---')
  lines.push('')

  // Each podcast
  for (const { podcast, insights } of podcastsWithInsights) {
    lines.push(`## ${podcast.title || 'Untitled'}`)
    lines.push('')
    const meta = []
    if (podcast.channel) meta.push(`**Show:** ${podcast.channel}`)
    if (podcast.duration_seconds) meta.push(`**Duration:** ${formatDuration(podcast.duration_seconds)}`)
    if (meta.length > 0) {
      lines.push(meta.join('  |  '))
      lines.push('')
    }

    if (!insights) {
      lines.push('*No insights available yet.*')
      lines.push('')
      continue
    }

    if (opts.summary && insights.summary) {
      lines.push('### Summary')
      lines.push('')
      lines.push(insights.summary)
      lines.push('')
    }

    if (opts.keyPoints && insights.key_points?.length > 0) {
      lines.push('### Key Points')
      lines.push('')
      for (const point of insights.key_points) {
        lines.push(`- ${point}`)
      }
      lines.push('')
    }

    if (opts.topics && insights.topics?.length > 0) {
      lines.push('### Topics')
      lines.push('')
      lines.push(insights.topics.join(', '))
      lines.push('')
    }

    if (opts.entities && insights.entities?.length > 0) {
      lines.push('### People, Companies & Concepts')
      lines.push('')
      for (const entity of insights.entities) {
        const name = typeof entity === 'string' ? entity : entity.name
        lines.push(`- ${name}`)
      }
      lines.push('')
    }

    lines.push('---')
    lines.push('')
  }

  lines.push(FOOTER())
  return lines.join('\n')
}

/**
 * Generate markdown for a chat conversation with source citations.
 *
 * @param {{ id: string, title?: string }} conversation
 * @param {Array<{ role: string, content: string, sources?: Array<{ podcast_title?: string, start_time?: number, text?: string }>, created_at?: string }>} messages
 * @param {string} kbName
 * @param {{ citations?: boolean }} [options]
 * @returns {string}
 */
export function conversationMarkdown(conversation, messages, kbName, options = {}) {
  const opts = { citations: true, ...options }
  const lines = []

  lines.push(`# Chat: ${conversation.title || 'Conversation'}`)
  lines.push('')
  lines.push(`**Knowledge Base:** ${kbName}`)
  lines.push(`**Messages:** ${messages.length}`)
  lines.push('')
  lines.push('---')
  lines.push('')

  for (const msg of messages) {
    const role = msg.role === 'user' ? 'You' : 'PodBrain'
    const timestamp = msg.created_at ? ` *(${formatDate(msg.created_at)})*` : ''

    lines.push(`### ${role}${timestamp}`)
    lines.push('')
    lines.push(msg.content)
    lines.push('')

    if (opts.citations && msg.sources?.length > 0) {
      lines.push('> **Sources:**')
      for (const src of msg.sources) {
        const time = src.start_time != null ? ` @ ${formatTimestamp(src.start_time)}` : ''
        lines.push(`> - ${src.podcast_title || 'Unknown podcast'}${time}`)
      }
      lines.push('')
    }
  }

  lines.push(FOOTER())
  return lines.join('\n')
}
