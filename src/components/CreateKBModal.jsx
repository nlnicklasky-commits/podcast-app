import { useState, useEffect } from 'react'
import useFocusTrap from '../hooks/useFocusTrap'
import useScrollLock from '../hooks/useScrollLock'
import * as Icons from './Icons'

export default function CreateKBModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const trapRef = useFocusTrap()
  useScrollLock()

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError(null)
    try {
      await onCreate(name.trim(), description.trim())
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to create knowledge base')
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-5 bg-black/55 backdrop-blur-[4px]"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-kb-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md fade-in bg-[var(--bg-2)] border border-[var(--border)] rounded-[var(--r-lg)]"
      >
        <div
          className="flex items-center px-[18px] py-3.5 border-b border-[var(--border)]"
        >
          <h3 id="create-kb-title" className="m-0 text-[15px] font-medium">New Knowledge Base</h3>
          <button onClick={onClose} className="ml-auto mute" aria-label="Close">
            <Icons.X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-[18px] space-y-4">
          <div>
            <label htmlFor="create-kb-name" className="block text-[11px] mono mute uppercase tracking-[0.1em] mb-1.5">Name</label>
            <input
              id="create-kb-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., AI Startups"
              className="w-full px-3 py-2 text-[13.5px] outline-none transition-colors bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--accent)] rounded-[var(--r-md)] text-[var(--text)]"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="create-kb-description" className="block text-[11px] mono mute uppercase tracking-[0.1em] mb-1.5">
              Description (optional)
            </label>
            <textarea
              id="create-kb-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What topics does this cover?"
              rows={3}
              className="w-full px-3 py-2 text-[13.5px] outline-none resize-none transition-colors bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--accent)] rounded-[var(--r-md)] text-[var(--text)]"
            />
          </div>
          {error && (
            <p className="text-[12px] text-[var(--error)]">{error}</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm dim transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className="px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 bg-[var(--accent)] text-[var(--accent-fg)] rounded-[var(--r-md)]"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
