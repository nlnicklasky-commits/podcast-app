/**
 * Lightweight markdown-to-HTML converter and preview component.
 * Handles: h1-h3, bold, italic, ordered/unordered lists, blockquotes,
 * horizontal rules, links, and fenced code blocks.
 */

function markdownToHtml(md) {
  if (!md) return ''

  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const lines = escaped.split('\n')
  const out = []
  let inCode = false
  let inList = null // 'ul' | 'ol' | null
  let listBuffer = []

  function flushList() {
    if (inList && listBuffer.length > 0) {
      const tag = inList
      out.push(`<${tag}>${listBuffer.join('')}</${tag}>`)
      listBuffer = []
      inList = null
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Fenced code blocks
    if (line.trim().startsWith('```')) {
      flushList()
      if (inCode) {
        out.push('</code></pre>')
        inCode = false
      } else {
        out.push('<pre class="export-code"><code>')
        inCode = true
      }
      continue
    }
    if (inCode) {
      out.push(line)
      continue
    }

    // Horizontal rule
    if (/^-{3,}$/.test(line.trim()) || /^\*{3,}$/.test(line.trim())) {
      flushList()
      out.push('<hr />')
      continue
    }

    // Headings
    const h3 = line.match(/^### (.+)/)
    if (h3) { flushList(); out.push(`<h3>${inline(h3[1])}</h3>`); continue }
    const h2 = line.match(/^## (.+)/)
    if (h2) { flushList(); out.push(`<h2>${inline(h2[1])}</h2>`); continue }
    const h1 = line.match(/^# (.+)/)
    if (h1) { flushList(); out.push(`<h1>${inline(h1[1])}</h1>`); continue }

    // Blockquote
    if (line.startsWith('&gt; ') || line === '&gt;') {
      flushList()
      const text = line.replace(/^&gt;\s?/, '')
      out.push(`<blockquote>${inline(text)}</blockquote>`)
      continue
    }

    // Unordered list
    const ul = line.match(/^[-*] (.+)/)
    if (ul) {
      if (inList !== 'ul') { flushList(); inList = 'ul' }
      listBuffer.push(`<li>${inline(ul[1])}</li>`)
      continue
    }

    // Ordered list
    const ol = line.match(/^\d+\.\s+(.+)/)
    if (ol) {
      if (inList !== 'ol') { flushList(); inList = 'ol' }
      listBuffer.push(`<li>${inline(ol[1])}</li>`)
      continue
    }

    // Not a list line -- flush any open list
    flushList()

    // Blank line
    if (line.trim() === '') {
      continue
    }

    // Paragraph
    out.push(`<p>${inline(line)}</p>`)
  }

  flushList()
  if (inCode) out.push('</code></pre>')

  return out.join('\n')
}

/** Inline formatting: bold, italic, links */
function inline(text) {
  return text
    // bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // italic (single asterisk or underscore)
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // links [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
}

export default function ExportPreview({ markdown, format = 'markdown' }) {
  if (!markdown) {
    return (
      <div className="flex items-center justify-center h-full text-[13px] dim">
        Nothing to preview
      </div>
    )
  }

  // Plain text mode -- show raw markdown in monospace
  if (format === 'text') {
    return (
      <div className="h-full overflow-auto p-4 sm:p-5 bg-[var(--bg)] rounded-[var(--r-md)]">
        <pre className="whitespace-pre-wrap text-[12px] leading-relaxed font-mono text-[var(--text-dim)] m-0">
          {markdown}
        </pre>
      </div>
    )
  }

  // Markdown / PDF -- render to styled HTML
  const html = markdownToHtml(markdown)

  return (
    <div className="h-full overflow-auto p-4 sm:p-5 bg-[var(--bg)] rounded-[var(--r-md)]">
      <div
        id="export-preview-content"
        className="export-preview-prose"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <style>{`
        .export-preview-prose {
          color: var(--text);
          font-size: 14px;
          line-height: 1.7;
        }
        .export-preview-prose h1 {
          font-size: 22px;
          font-weight: 600;
          margin: 0 0 8px;
          font-family: var(--ff-serif, Georgia, serif);
          letter-spacing: -0.01em;
        }
        .export-preview-prose h2 {
          font-size: 17px;
          font-weight: 600;
          margin: 20px 0 6px;
          font-family: var(--ff-serif, Georgia, serif);
        }
        .export-preview-prose h3 {
          font-size: 15px;
          font-weight: 600;
          margin: 16px 0 4px;
        }
        .export-preview-prose p {
          margin: 0 0 10px;
        }
        .export-preview-prose strong {
          font-weight: 600;
        }
        .export-preview-prose em {
          font-style: italic;
        }
        .export-preview-prose ul, .export-preview-prose ol {
          margin: 0 0 10px;
          padding-left: 20px;
        }
        .export-preview-prose li {
          margin-bottom: 3px;
        }
        .export-preview-prose blockquote {
          margin: 0 0 10px;
          padding: 4px 12px;
          border-left: 3px solid var(--accent, #6366f1);
          color: var(--text-dim);
          font-style: italic;
        }
        .export-preview-prose hr {
          border: none;
          border-top: 1px solid var(--border);
          margin: 16px 0;
        }
        .export-preview-prose a {
          color: var(--accent);
          text-decoration: underline;
        }
        .export-preview-prose .export-code {
          background: var(--surface, #1e1e2e);
          border: 1px solid var(--border);
          border-radius: var(--r-sm, 4px);
          padding: 12px;
          overflow-x: auto;
          font-size: 12px;
          margin: 0 0 10px;
        }
      `}</style>
    </div>
  )
}
