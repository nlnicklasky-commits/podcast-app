import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'

const ToastContext = createContext(null)

const MAX_TOASTS = 3
const AUTO_DISMISS_MS = 3000

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timersRef = useRef({})

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id])
      delete timersRef.current[id]
    }
  }, [])

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random()
    const toast = { id, message, type, createdAt: Date.now() }

    setToasts((prev) => {
      const next = [...prev, toast]
      // Dismiss oldest if exceeding max
      if (next.length > MAX_TOASTS) {
        const removed = next.shift()
        if (timersRef.current[removed.id]) {
          clearTimeout(timersRef.current[removed.id])
          delete timersRef.current[removed.id]
        }
      }
      return next
    })

    // Auto-dismiss after 3 seconds
    timersRef.current[id] = setTimeout(() => {
      removeToast(id)
    }, AUTO_DISMISS_MS)

    return id
  }, [removeToast])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout)
    }
  }, [])

  const borderColorClass = {
    success: 'border-l-2 border-l-[var(--accent)]',
    error: 'border-l-2 border-l-[var(--error)]',
    info: 'border-l-2 border-l-[var(--text-mute)]',
  }

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}

      {/* Toast overlay */}
      {toasts.length > 0 && (
        <div className="fixed bottom-20 right-6 z-50 flex flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`fade-in bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-md)] px-3.5 py-2.5 text-[13px] shadow-lg max-w-[320px] flex items-start gap-2 ${borderColorClass[toast.type] || borderColorClass.info}`}
            >
              <span className="flex-1 text-[var(--text)]">{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 mt-0.5 text-[var(--text-mute)] hover:text-[var(--text)] transition-colors"
                aria-label="Dismiss"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2 2l8 8M10 2l-8 8" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return ctx
}
