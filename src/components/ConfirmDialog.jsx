import { useEffect, useId, useRef } from 'react'
import useFocusTrap from '../hooks/useFocusTrap'
import useScrollLock from '../hooks/useScrollLock'

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}) {
  const trapRef = useFocusTrap(open)
  const confirmRef = useRef(null)
  const titleId = useId()
  const messageId = useId()
  useScrollLock(open)

  useEffect(() => {
    if (!open) return
    confirmRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e) {
      if (e.key === 'Escape' && !loading) {
        e.preventDefault()
        onCancel?.()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, loading, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-5 bg-black/55 backdrop-blur-[4px]"
      onClick={() => !loading && onCancel?.()}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm fade-in bg-[var(--bg-2)] border border-[var(--border)] rounded-[var(--r-lg)]"
      >
        <div className="p-[18px] space-y-2.5">
          <h3 id={titleId} className="m-0 text-[15px] font-medium">{title}</h3>
          {message && (
            <p id={messageId} className="text-[13px] dim leading-relaxed">{message}</p>
          )}
        </div>
        <div className="flex justify-end gap-3 px-[18px] pb-[18px]">
          <button
            type="button"
            onClick={() => onCancel?.()}
            disabled={loading}
            className="px-4 py-2 text-sm dim transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onConfirm?.()}
            disabled={loading}
            className={
              destructive
                ? 'px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 bg-[var(--error)] text-white rounded-[var(--r-md)]'
                : 'px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 bg-[var(--accent)] text-[var(--accent-fg)] rounded-[var(--r-md)]'
            }
          >
            {loading ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
