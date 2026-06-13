import { supabase } from '../lib/supabase'

/**
 * Resolve the current authenticated user's id.
 * Throws if no user is signed in — use to stamp user_id on writes.
 */
export async function requireUserId() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in')
  return user.id
}

/**
 * Get the current session's access token (JWT), or null if not signed in.
 * Used to authorize edge-function fetch() calls.
 */
export async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}
