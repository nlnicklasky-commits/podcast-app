import { useEffect, useRef } from 'react'

export default function useFocusTrap(active = true) {
  const ref = useRef(null)

  useEffect(() => {
    if (!active || !ref.current) return

    const el = ref.current
    const previouslyFocused = document.activeElement

    const focusables = () =>
      el.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )

    const first = () => focusables()[0]
    const _last = () => {
      const all = focusables()
      return all[all.length - 1]
    }

    if (!el.contains(document.activeElement)) {
      first()?.focus()
    }

    function onKeyDown(e) {
      if (e.key !== 'Tab') return
      const all = focusables()
      if (all.length === 0) {
        e.preventDefault()
        return
      }
      if (e.shiftKey) {
        if (document.activeElement === all[0]) {
          e.preventDefault()
          all[all.length - 1]?.focus()
        }
      } else {
        if (document.activeElement === all[all.length - 1]) {
          e.preventDefault()
          all[0]?.focus()
        }
      }
    }

    el.addEventListener('keydown', onKeyDown)
    return () => {
      el.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus()
      }
    }
  }, [active])

  return ref
}
