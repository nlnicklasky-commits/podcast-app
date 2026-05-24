import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export async function semanticSearch({ query, scope, limit = 20, offset = 0, threshold = 0.3 }) {
  if (!query || query.trim().length < 3) {
    throw new Error('Search query must be at least 3 characters')
  }

  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY

  const response = await fetch(`${SUPABASE_URL}/functions/v1/semantic-search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: query.trim(),
      scope,
      limit,
      offset,
      threshold,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `Search failed: HTTP ${response.status}`)
  }

  return response.json()
}

export async function getSearchHistory(limit = 20) {
  const { data, error } = await supabase
    .from('search_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to load search history: ${error.message}`)

  const seen = new Set()
  return (data || []).filter((entry) => {
    const key = entry.query.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function deleteSearchHistoryEntry(id) {
  const { error } = await supabase
    .from('search_history')
    .delete()
    .eq('id', id)

  if (error) throw new Error(`Failed to delete search history entry: ${error.message}`)
}

export async function clearSearchHistory() {
  const { error } = await supabase
    .from('search_history')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')

  if (error) throw new Error(`Failed to clear search history: ${error.message}`)
}
