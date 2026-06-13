import { supabase } from '../lib/supabase'
import { callEdgeFunction } from './_edge'

export async function semanticSearch({ query, scope, limit = 20, offset = 0, threshold = 0.3 }) {
  if (!query || query.trim().length < 3) {
    throw new Error('Search query must be at least 3 characters')
  }

  return callEdgeFunction(
    'semantic-search',
    {
      query: query.trim(),
      scope,
      limit,
      offset,
      threshold,
    },
    { errorPrefix: 'Search failed' },
  )
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
