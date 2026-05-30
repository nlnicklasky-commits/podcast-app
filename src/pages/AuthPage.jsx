import { useState } from 'react'
import { supabase } from '../lib/supabase'
import * as Icons from '../components/Icons'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  async function handleMagicLink(e) {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    setError(null)
    setMessage(null)

    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin,
      },
    })

    setLoading(false)

    if (authError) {
      setError(authError.message)
    } else {
      setMessage('Check your email for a magic link to sign in.')
    }
  }

  async function handleOAuth(provider) {
    setLoading(true)
    setError(null)
    setMessage(null)

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
      },
    })

    // OAuth redirects away, so we only reach here on error
    if (authError) {
      setLoading(false)
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
          {/* Magic link form */}
          <form onSubmit={handleMagicLink}>
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
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full mt-3 px-4 py-2.5 text-[14px] font-semibold bg-[var(--accent)] text-[var(--accent-fg)] rounded-[var(--r-md)] transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending...' : 'Send magic link'}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-[11px] mono mute uppercase tracking-[0.08em]">or</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          {/* OAuth buttons */}
          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => handleOAuth('google')}
              disabled={loading}
              className="flex items-center justify-center gap-2.5 w-full px-4 py-2.5 text-[14px] font-medium bg-[var(--bg)] border border-[var(--border)] rounded-[var(--r-md)] text-[var(--text)] transition-colors hover:bg-[var(--surface-2)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.44 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continue with Google
            </button>

            <button
              onClick={() => handleOAuth('github')}
              disabled={loading}
              className="flex items-center justify-center gap-2.5 w-full px-4 py-2.5 text-[14px] font-medium bg-[var(--bg)] border border-[var(--border)] rounded-[var(--r-md)] text-[var(--text)] transition-colors hover:bg-[var(--surface-2)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              Continue with GitHub
            </button>
          </div>

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
