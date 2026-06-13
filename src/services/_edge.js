import { getAccessToken } from './_auth'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

/**
 * Call a Supabase Edge Function with the current user's session token.
 *
 * Centralizes the fetch wrapper duplicated across the chat, search,
 * synthesis, and processing services.
 *
 * @param {string} name - Edge function name (e.g. 'chat')
 * @param {object} body - JSON body to POST
 * @param {{ errorPrefix?: string, requireAuth?: boolean }} [options]
 * @returns {Promise<any>} Parsed JSON response
 */
export async function callEdgeFunction(name, body, { errorPrefix = 'Request failed', requireAuth = true } = {}) {
  const token = await getAccessToken()

  if (requireAuth && !token) {
    throw new Error(`${errorPrefix}: you must be signed in`)
  }

  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
  } catch (networkError) {
    throw new Error(`${errorPrefix}: network error (${networkError.message})`)
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `${errorPrefix}: HTTP ${response.status}`)
  }

  return response.json()
}
