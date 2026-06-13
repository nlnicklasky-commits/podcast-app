// Requires: npm install html2pdf.js --legacy-peer-deps

import { useState, useEffect, useMemo, useId } from 'react'
import useFocusTrap from '../hooks/useFocusTrap'
import useScrollLock from '../hooks/useScrollLock'
import { downloadAsTextFile, slugify } from '../lib/export'
import {
  podcastInsightsMarkdown,
  podcastTranscriptMarkdown,
  kbSummaryMarkdown,
  conversationMarkdown,
} from '../lib/exportTemplates'
import ExportPreview from './ExportPreview'
import { Button } from './ui'
import * as Icons from './Icons'

const FORMATS = [
  { id: 'markdown', label: 'Markdown', ext: 'md', mime: 'text/markdown' },
  { id: 'pdf', label: 'PDF', ext: 'pdf', mime: 'application/pdf' },
  { id: 'text', label: 'Plain Text', ext: 'txt', mime: 'text/plain' },
]

const SECTION_DEFS = {
  podcast: [
    { id: 'summary', label: 'Summary' },
    { id: 'keyPoints', label: 'Key Points' },
    { id: 'topics', label: 'Topics' },
    { id: 'entities', label: 'Entities' },
    { id: 'transcript', label: 'Transcript' },
  ],
  kb: [
    { id: 'summary', label: 'Summary' },
    { id: 'keyPoints', label: 'Key Points' },
    { id: 'topics', label: 'Topics' },
    { id: 'entities', label: 'Entities' },
  ],
  conversation: [
    { id: 'citations', label: 'Source Citations' },
  ],
}

/**
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {'podcast'|'kb'|'conversation'} props.scope
 * @param {object} props.data
 *   For podcast: { podcast, insights, transcript }
 *   For kb: { kb, podcastsWithInsights }
 *   For conversation: { conversation, messages, kbName }
 */
export default function ExportModal({ isOpen, onClose, scope, data }) {
  const trapRef = useFocusTrap(isOpen)
  const titleId = useId()
  useScrollLock(isOpen)

  const [format, setFormat] = useState('markdown')
  const [sections, setSections] = useState({})
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)

  // Initialize section toggles when scope changes
  useEffect(() => {
    const defs = SECTION_DEFS[scope] || []
    const initial = {}
    for (const def of defs) {
      initial[def.id] = true
    }
    setSections(initial)
  }, [scope])

  // Escape to close
  useEffect(() => {
    if (!isOpen) return
    function onKeyDown(e) {
      if (e.key === 'Escape' && !generating) {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, generating, onClose])

  // Build the markdown preview
  const markdown = useMemo(() => {
    if (!data) return ''
    try {
      switch (scope) {
        case 'podcast': {
          const { podcast, insights, transcript } = data
          const parts = []
          if (insights) {
            parts.push(podcastInsightsMarkdown(podcast, insights, sections))
          }
          if (sections.transcript && transcript) {
            parts.push(podcastTranscriptMarkdown(podcast, transcript, { timestamps: true }))
          }
          return parts.join('\n\n---\n\n') || '*No content available to export.*'
        }
        case 'kb': {
          const { kb, podcastsWithInsights } = data
          return kbSummaryMarkdown(kb, podcastsWithInsights || [], sections)
        }
        case 'conversation': {
          const { conversation, messages, kbName } = data
          return conversationMarkdown(conversation, messages || [], kbName, sections)
        }
        default:
          return ''
      }
    } catch {
      return '*Error generating preview.*'
    }
  }, [scope, data, sections])

  function toggleSection(id) {
    setSections((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function getFilename() {
    const fmt = FORMATS.find((f) => f.id === format) || FORMATS[0]
    const date = new Date().toISOString().slice(0, 10)
    let name = 'export'
    switch (scope) {
      case 'podcast':
        name = data?.podcast?.title || 'podcast'
        break
      case 'kb':
        name = data?.kb?.name || 'knowledge-base'
        break
      case 'conversation':
        name = data?.conversation?.title || 'conversation'
        break
    }
    return `${scope}_${slugify(name)}_${date}.${fmt.ext}`
  }

  async function handleDownload() {
    if (generating) return
    setError(null)

    const filename = getFilename()

    if (format === 'markdown') {
      downloadAsTextFile(markdown, filename, 'text/markdown')
      onClose()
      return
    }

    if (format === 'text') {
      downloadAsTextFile(markdown, filename, 'text/plain')
      onClose()
      return
    }

    // PDF generation — dynamic import hidden from bundler
    setGenerating(true)
    try {
      // Opaque import: prevents Vite/Rolldown from trying to resolve at build time.
      // html2pdf.js must be installed separately: npm install html2pdf.js --legacy-peer-deps
      let html2pdf
      try {
        const importFn = new Function('specifier', 'return import(specifier)')
        const mod = await importFn('html2pdf.js')
        html2pdf = mod.default
      } catch {
        throw new Error('html2pdf')
      }

      const el = document.getElementById('export-preview-content')
      if (!el) {
        throw new Error('Preview content not found')
      }

      // Clone the element so we can style it for PDF without affecting the UI
      const clone = el.cloneNode(true)
      clone.style.color = '#1a1a2e'
      clone.style.background = '#ffffff'
      clone.style.padding = '0'
      clone.style.fontSize = '13px'
      clone.style.lineHeight = '1.65'
      // Force dark text for all children
      const allEls = clone.querySelectorAll('*')
      for (const child of allEls) {
        child.style.color = '#1a1a2e'
      }
      // Style headings
      for (const h of clone.querySelectorAll('h1,h2,h3')) {
        h.style.color = '#0f0f23'
      }
      // Style blockquotes
      for (const bq of clone.querySelectorAll('blockquote')) {
        bq.style.color = '#555'
        bq.style.borderLeftColor = '#6366f1'
      }

      document.body.appendChild(clone)

      await html2pdf()
        .set({
          margin: [12, 12, 12, 12],
          filename,
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(clone)
        .save()

      document.body.removeChild(clone)
      onClose()
    } catch (err) {
      console.error('PDF generation failed:', err)
      setError(
        err.message?.includes('html2pdf')
          ? 'PDF library not installed. Run: npm install html2pdf.js --legacy-peer-deps'
          : 'Failed to generate PDF. Try markdown instead.'
      )
    } finally {
      setGenerating(false)
    }
  }

  if (!isOpen) return null

  const scopeLabel = scope === 'podcast' ? 'Podcast' : scope === 'kb' ? 'Knowledge Base' : 'Conversation'
  const availableSections = SECTION_DEFS[scope] || []

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-[4px]"
      onClick={() => !generating && onClose()}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:w-[90vw] sm:max-w-[960px] max-h-[92vh] sm:max-h-[85vh] flex flex-col fade-in bg-[var(--bg-2)] border border-[var(--border)] rounded-t-[var(--r-lg)] sm:rounded-[var(--r-lg)] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-[var(--border)] shrink-0">
          <Icons.Download size={16} className="text-[var(--accent)]" />
          <h2 id={titleId} className="flex-1 text-[15px] font-medium m-0">
            Export {scopeLabel}
          </h2>
          <button
            onClick={() => !generating && onClose()}
            className="mute min-w-[40px] min-h-[40px] flex items-center justify-center rounded-[var(--r-md)] hover:bg-[var(--surface)] transition-colors"
            aria-label="Close"
          >
            <Icons.X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col sm:flex-row overflow-hidden min-h-0">
          {/* Left panel: controls */}
          <div className="sm:w-[260px] shrink-0 p-4 sm:p-5 border-b sm:border-b-0 sm:border-r border-[var(--border)] overflow-y-auto">
            {/* Format selector */}
            <div className="mb-5">
              <label className="block text-[11px] mono mute uppercase tracking-[0.1em] mb-2.5">
                Format
              </label>
              <div className="flex rounded-[var(--r-md)] border border-[var(--border)] overflow-hidden">
                {FORMATS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFormat(f.id)}
                    className={`flex-1 py-2 text-[12px] font-medium transition-colors min-h-[38px] ${
                      format === f.id
                        ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                        : 'bg-[var(--surface)] text-[var(--text-dim)] hover:text-[var(--text)]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Section checkboxes */}
            {availableSections.length > 0 && (
              <div className="mb-5">
                <label className="block text-[11px] mono mute uppercase tracking-[0.1em] mb-2.5">
                  Include
                </label>
                <div className="flex flex-col gap-1.5">
                  {availableSections.map((sec) => (
                    <label
                      key={sec.id}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--r-sm)] cursor-pointer min-h-[38px] transition-colors hover:bg-[var(--surface)]"
                    >
                      <input
                        type="checkbox"
                        checked={sections[sec.id] ?? true}
                        onChange={() => toggleSection(sec.id)}
                        className="w-[15px] h-[15px] rounded accent-[var(--accent)] cursor-pointer shrink-0"
                      />
                      <span className="text-[13px] text-[var(--text)]">{sec.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* File info */}
            <div className="text-[11px] mono mute">
              <span className="block mb-1">Filename:</span>
              <span className="block text-[var(--text-dim)] break-all">{getFilename()}</span>
            </div>
          </div>

          {/* Right panel: preview */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="px-4 sm:px-5 pt-3 pb-2 shrink-0">
              <span className="text-[11px] mono mute uppercase tracking-[0.1em]">Preview</span>
            </div>
            <div className="flex-1 mx-4 sm:mx-5 mb-4 sm:mb-5 overflow-hidden rounded-[var(--r-md)] border border-[var(--border)]">
              <ExportPreview markdown={markdown} format={format} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-t border-[var(--border)] shrink-0">
          {error && (
            <p className="flex-1 text-[12px] text-[var(--error)] m-0" role="alert">
              {error}
            </p>
          )}
          {!error && <div className="flex-1" />}
          <Button variant="secondary" size="sm" onClick={() => !generating && onClose()} disabled={generating}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={generating}
            onClick={handleDownload}
          >
            {generating ? 'Generating...' : format === 'pdf' ? 'Download PDF' : 'Download'}
          </Button>
        </div>
      </div>
    </div>
  )
}
