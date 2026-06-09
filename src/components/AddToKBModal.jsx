import { useState } from 'react'
import { addPodcastToKB } from '../services/podcasts'
import { useToast } from '../lib/ToastContext'
import { useData } from '../lib/DataContext'
import useFocusTrap from '../hooks/useFocusTrap'
import useScrollLock from '../hooks/useScrollLock'
import { KBGlyph } from './ui'
import * as Icons from './Icons'

export default function AddToKBModal({ podcastId, existingKBIds = [], onClose, onAdded }) {
  const { addToast } = useToast()
  const { knowledgeBases, loaded } = useData()
  const [adding, setAdding] = useState(null)
  const [error, setError] = useState('')
  const trapRef = useFocusTrap()
  useScrollLock()

  async function handleAdd(kb) {
    setAdding(kb.id)
    setError('')
    try {
      await addPodcastToKB(kb.id, podcastId)
      addToast('Added to knowledge base', 'success')
      onAdded?.({ id: kb.id, name: kb.name })
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to add')
      setAdding(null)
    }
  }

  const availableKBs = knowledgeBases.filter(
    (kb) => !existingKBIds.includes(kb.id)
  )

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-5 bg-black/55 backdrop-blur-[4px]"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md fade-in bg-[var(--bg-2)] border border-[var(--border)] rounded-[var(--r-lg)]"
      >
        <div
          className="flex items-center px-[18px] py-3.5 border-b border-[var(--border)]"
        >
          <h3 className="m-0 text-[15px] font-medium">Add to Knowledge Base</h3>
          <button onClick={onClose} className="ml-auto mute" aria-label="Close">
            <Icons.X size={16} />
          </button>
        </div>

        <div className="p-[18px]">
          {!loaded ? (
            <div className="py-8 text-center mute text-[13px]">Loading knowledge bases...</div>
          ) : availableKBs.length === 0 ? (
            <div className="py-8 text-center">
              <p className="dim text-[14px] mb-1">
                {knowledgeBases.length === 0
                  ? 'No knowledge bases yet'
                  : 'Already in all knowledge bases'}
              </p>
              <p className="mute text-[13px]">
                {knowledgeBases.length === 0
                  ? 'Create a knowledge base first from the home page.'
                  : 'This podcast is already linked to every knowledge base.'}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {availableKBs.map((kb) => (
                <button
                  key={kb.id}
                  onClick={() => handleAdd(kb)}
                  disabled={adding === kb.id}
                  className="w-full flex items-center gap-3 text-left p-3 transition-colors disabled:opacity-50 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-md)] hover:border-[color-mix(in_oklab,var(--accent),transparent_50%)]"
                >
                  <KBGlyph name={kb.name} size={32} />
                  <div className="flex-1 min-w-0">
                    <span className="text-[14px] font-medium block text-[var(--text)]">
                      {kb.name}
                    </span>
                    {kb.description && (
                      <span className="text-[12px] dim block mt-0.5 truncate">
                        {kb.description}
                      </span>
                    )}
                  </div>
                  {adding === kb.id && (
                    <span
                      className="w-4 h-4 rounded-full border-2 animate-spin shrink-0 border-[var(--accent)] border-t-transparent"
                    />
                  )}
                </button>
              ))}
            </div>
          )}

          {error && (
            <p className="text-[12px] mt-3 text-[var(--error)]">{error}</p>
          )}

          <div className="flex justify-end pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm dim transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
