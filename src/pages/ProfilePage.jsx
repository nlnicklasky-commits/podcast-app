import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import { useToast } from '../lib/ToastContext'
import { listSubscriptions, unsubscribe, updateSubscription } from '../services/subscriptions'
import OPMLImportModal from '../components/OPMLImportModal'
import * as Icons from '../components/Icons'

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addToast } = useToast()
  const [signingOut, setSigningOut] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [error, setError] = useState(null)
  const [deleteResult, setDeleteResult] = useState(null)
  const [subscriptions, setSubscriptions] = useState([])
  const [subsLoading, setSubsLoading] = useState(true)
  const [showOPML, setShowOPML] = useState(false)

  useEffect(() => {
    listSubscriptions()
      .then(setSubscriptions)
      .catch(() => {})
      .finally(() => setSubsLoading(false))
  }, [])

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

        {/* Subscriptions */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)] p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[12px] mono mute uppercase tracking-[0.08em]">
              Feed Subscriptions
            </div>
            <button
              onClick={() => setShowOPML(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-[var(--bg)] border border-[var(--border)] rounded-[var(--r-sm)] transition-colors hover:border-[color-mix(in_oklab,var(--accent),transparent_60%)]"
            >
              <Icons.Download size={11} />
              Import OPML
            </button>
          </div>

          {subsLoading && (
            <p className="text-[13px] mute">Loading...</p>
          )}

          {!subsLoading && subscriptions.length === 0 && (
            <p className="text-[13px] dim">
              No subscriptions yet. Subscribe to feeds from the Add Podcast search to auto-ingest new episodes.
            </p>
          )}

          {!subsLoading && subscriptions.length > 0 && (
            <div className="space-y-2">
              {subscriptions.map(sub => (
                <div
                  key={sub.id}
                  className="flex items-center gap-3 p-2.5 bg-[var(--bg)] border border-[var(--border-soft)] rounded-[var(--r-md)]"
                >
                  {sub.feed_artwork && (
                    <img
                      src={sub.feed_artwork}
                      alt=""
                      className="w-9 h-9 rounded-[var(--r-sm)] object-cover shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate m-0">{sub.feed_title || 'Unknown Feed'}</p>
                    <p className="text-[11px] mute m-0 mt-0.5">
                      {sub.feed_author}
                      {sub.last_checked_at && (
                        <> · checked {new Date(sub.last_checked_at).toLocaleDateString()}</>
                      )}
                    </p>
                  </div>
                  <label className="flex items-center gap-1.5 shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sub.auto_process}
                      onChange={async (e) => {
                        const checked = e.target.checked
                        try {
                          const updated = await updateSubscription(sub.id, {
                            auto_process: checked,
                          })
                          setSubscriptions(prev =>
                            prev.map(s => s.id === sub.id ? { ...s, ...updated } : s)
                          )
                          addToast(checked ? 'Auto-process enabled' : 'Auto-process disabled', 'success')
                        } catch (err) {
                          setError(err.message || 'Failed to update subscription')
                        }
                      }}
                      className="w-3.5 h-3.5 accent-[var(--accent)]"
                    />
                    <span className="text-[11px] mute">Auto-process</span>
                  </label>
                  <button
                    onClick={async () => {
                      try {
                        await unsubscribe(sub.id)
                        setSubscriptions(prev => prev.filter(s => s.id !== sub.id))
                        addToast('Unsubscribed', 'success')
                      } catch (err) {
                        setError(err.message || 'Failed to unsubscribe')
                      }
                    }}
                    className="p-1.5 mute hover:text-[var(--error)] transition-colors shrink-0"
                    title="Unsubscribe"
                  >
                    <Icons.X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
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

      {showOPML && (
        <OPMLImportModal
          onClose={() => {
            setShowOPML(false)
            listSubscriptions().then(setSubscriptions).catch(() => {})
          }}
        />
      )}
    </div>
  )
}
