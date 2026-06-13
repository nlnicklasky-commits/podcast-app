import { useState } from 'react'
import { supabase } from '../lib/supabase'
import * as Icons from '../components/Icons'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  async function handleLogin(e) {
    e.preventDefault()
    if (!email.trim() || !password) return

    setLoading(true)
    setError(null)
    setMessage(null)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    setLoading(false)

    if (authError) {
      setError(authError.message)
    }
  }


  return (
    <div className="flex items-center justify-center min-h-screen bg-[var(--bg)] px-4">
      <div className="w-full max-w-[380px] fade-in">
        {/* Logo + wordmark */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl grid place-items-center bg-[var(--accent)] text-[var(--accent-fg)] shadow-[0_0_32px_color-mix(in_oklab,var(--accent),transparent_50%)]">
            <Icons.Wave size={24} strokeWidth={2} />
          </div>
          <div className="text-center">
            <h1 className="serif text-[28px] font-medium tracking-tight m-0">PodBrain</h1>
            <p className="text-[13px] mute mt-1">Your podcast second brain</p>
          </div>
        </div>

        {/* Auth card */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)] p-6">
          <form onSubmit={handleLogin}>
            <label className="block text-[12px] mono mute uppercase tracking-[0.08em] mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={loading}
              className="w-full px-3.5 py-2.5 text-[14px] bg-[var(--bg)] border border-[var(--border)] rounded-[var(--r-md)] placeholder:text-[var(--text-mute)] focus:outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-50"
            />
            <label className="block text-[12px] mono mute uppercase tracking-[0.08em] mb-2 mt-4">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              disabled={loading}
              className="w-full px-3.5 py-2.5 text-[14px] bg-[var(--bg)] border border-[var(--border)] rounded-[var(--r-md)] placeholder:text-[var(--text-mute)] focus:outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="w-full mt-4 px-4 py-2.5 text-[14px] font-semibold bg-[var(--accent)] text-[var(--accent-fg)] rounded-[var(--r-md)] transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          {/* Status messages */}
          {message && (
            <div className="mt-4 px-3.5 py-2.5 text-[13px] bg-[color-mix(in_oklab,var(--success),transparent_85%)] text-[var(--success)] border border-[color-mix(in_oklab,var(--success),transparent_70%)] rounded-[var(--r-md)]">
              {message}
            </div>
          )}

          {error && (
            <div className="mt-4 px-3.5 py-2.5 text-[13px] bg-[color-mix(in_oklab,var(--error),transparent_85%)] text-[var(--error)] border border-[color-mix(in_oklab,var(--error),transparent_70%)] rounded-[var(--r-md)]">
              {error}
            </div>
          )}
        </div>

        {/* Footer links */}
        <div className="flex items-center justify-center gap-3 mt-5 text-[11px] mute">
          <a href="/privacy" className="hover:text-[var(--text-dim)] transition-colors">Privacy</a>
          <span>&middot;</span>
          <a href="/terms" className="hover:text-[var(--text-dim)] transition-colors">Terms</a>
        </div>
      </div>
    </div>
  )
}
