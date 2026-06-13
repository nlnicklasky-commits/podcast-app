import { useState, useEffect } from 'react'
import { subscribe, unsubscribe, isSubscribed } from '../services/subscriptions'
import { useToast } from '../lib/ToastContext'
import * as Icons from './Icons'

export default function SubscribeButton({ show, compact = false }) {
  const { addToast } = useToast()
  const [subId, setSubId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    let cancelled = false
    isSubscribed(show.id).then(id => {
      if (!cancelled) {
        setSubId(id)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [show.id])

  async function handleToggle(e) {
    e.stopPropagation()
    setToggling(true)
    try {
      if (subId) {
        await unsubscribe(subId)
        setSubId(null)
      } else {
        const sub = await subscribe(show)
        setSubId(sub.id)
      }
    } catch (err) {
      addToast(err.message || 'Failed to update subscription', 'error')
    } finally {
      setToggling(false)
    }
  }

  if (loading) return null

  const subscribed = !!subId

  if (compact) {
    return (
      <button
        onClick={handleToggle}
        disabled={toggling}
        title={subscribed ? 'Unsubscribe' : 'Subscribe'}
        className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 transition-colors disabled:opacity-50 ${
          subscribed
            ? 'bg-[var(--accent-faint)] text-[var(--accent)]'
            : 'text-[var(--text-mute)] hover:text-[var(--accent)] hover:bg-[var(--accent-faint)]'
        }`}
      >
        {subscribed ? <Icons.Check size={13} /> : <Icons.Plus size={13} />}
      </button>
    )
  }

  return (
    <button
      onClick={handleToggle}
      disabled={toggling}
      className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-[var(--r-sm)] transition-colors disabled:opacity-50 shrink-0 ${
        subscribed
          ? 'bg-[var(--accent-faint)] text-[var(--accent)]'
          : 'bg-[var(--surface)] text-[var(--text-mute)] border border-[var(--border)] hover:text-[var(--accent)] hover:border-[color-mix(in_oklab,var(--accent),transparent_60%)]'
      }`}
    >
      {subscribed ? <Icons.Check size={11} /> : <Icons.Plus size={11} />}
      {subscribed ? 'Subscribed' : 'Subscribe'}
    </button>
  )
}
