import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import * as Icons from '../components/Icons'

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [error, setError] = useState(null)
  const [deleteResult, setDeleteResult] = useState(null)

  async function handleSignOut() {
    setSigningOut(true)
    setError(null)

    const { error: signOutError } = await supabase.auth.signOut()

    if (signOutError) {
      setError(signOutError.message)
      setSigningOut(false)
    }
    // Auth state change listener in AuthContext will handle redirect
  }

  async function handleDeleteAccount() {
    if (!deleteConfirm) {
      setDeleteConfirm(true)
      return
    }

    setDeleting(true)
    setError(null)

    const { data, error: rpcError } = await supabase.rpc('delete_all_user_data')

    if (rpcError) {
      setError(`Failed to delete data: ${rpcError.message}`)
      setDeleting(false)
      setDeleteConfirm(false)
      return
    }

    if (data && !data.success) {
      setError(data.error || 'Failed to delete data')
      setDeleting(false)
      setDeleteConfirm(false)
      return
    }

    setDeleteResult(data)

    // Sign out after deletion
    await supabase.auth.signOut()
  }

  const provider = user?.app_metadata?.provider
  const createdAt = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 sm:px-10 py-8 pb-20 max-w-[640px] mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate('/')}
            className="p-1.5 mute hover:text-[var(--text)] transition-colors"
          >
            <Icons.Back size={18} />
          </button>
          <h1 className="serif text-[28px] font-medium tracking-tight m-0">Profile</h1>
        </div>

        {/* Account info */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)] p-5 mb-4">
          <div className="text-[12px] mono mute uppercase tracking-[0.08em] mb-3">Account</div>

          <div className="space-y-3">
            <div>
              <div className="text-[11px] mute mb-0.5">Email</div>
              <div className="text-[14px]">{user?.email || 'Unknown'}</div>
            </div>

            {provider && (
              <div>
                <div className="text-[11px] mute mb-0.5">Sign-in method</div>
                <div className="text-[14px] capitalize">{provider}</div>
              </div>
            )}

            {createdAt && (
              <div>
                <div className="text-[11px] mute mb-0.5">Member since</div>
                <div className="text-[14px]">{createdAt}</div>
              </div>
            )}
          </div>
        </div>

        {/* Sign out */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)] p-5 mb-4">
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex items-center gap-2 px-4 py-2.5 text-[14px] font-medium bg-[var(--bg)] border border-[var(--border)] rounded-[var(--r-md)] text-[var(--text)] transition-colors hover:bg-[var(--surface-2)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {signingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>

        {/* Danger zone */}
        <div className="bg-[var(--surface)] border border-[color-mix(in_oklab,var(--error),transparent_60%)] rounded-[var(--r-lg)] p-5">
          <div className="text-[12px] mono uppercase tracking-[0.08em] mb-2 text-[var(--error)]">
            Danger zone
          </div>
          <p className="text-[13px] dim mb-4 leading-relaxed">
            Permanently delete all your data including knowledge bases, podcasts,
            transcripts, conversations, and search history. This action cannot be undone.
          </p>

          {deleteConfirm ? (
            <div className="space-y-3">
              <p className="text-[13px] text-[var(--error)] font-medium">
                Are you sure? All your data will be permanently deleted.
              </p>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="px-4 py-2.5 text-[14px] font-semibold bg-[var(--error)] text-white rounded-[var(--r-md)] transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? 'Deleting...' : 'Yes, delete everything'}
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  disabled={deleting}
                  className="px-4 py-2.5 text-[14px] font-medium bg-[var(--bg)] border border-[var(--border)] rounded-[var(--r-md)] text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleDeleteAccount}
              className="px-4 py-2.5 text-[14px] font-medium bg-[var(--bg)] border border-[color-mix(in_oklab,var(--error),transparent_60%)] rounded-[var(--r-md)] text-[var(--error)] transition-colors hover:bg-[color-mix(in_oklab,var(--error),transparent_90%)]"
            >
              Delete all my data
            </button>
          )}

          {deleteResult && (
            <div className="mt-4 px-3.5 py-2.5 text-[13px] bg-[color-mix(in_oklab,var(--success),transparent_85%)] text-[var(--success)] border border-[color-mix(in_oklab,var(--success),transparent_70%)] rounded-[var(--r-md)]">
              All data deleted successfully. Signing out...
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <div className="mt-4 px-3.5 py-2.5 text-[13px] bg-[color-mix(in_oklab,var(--error),transparent_85%)] text-[var(--error)] border border-[color-mix(in_oklab,var(--error),transparent_70%)] rounded-[var(--r-md)]">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
