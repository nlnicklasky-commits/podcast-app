import { supabase } from '../lib/supabase'

/**
 * @typedef {Object} UsageStats
 * @property {number} podcastCount   - Total podcasts in the catalog
 * @property {number} kbCount        - Knowledge bases owned by the user
 * @property {number} totalChunks    - Total embedded chunks across all podcasts
 * @property {number} conversationCount - Conversations owned by the user
 */

/**
 * Fetch aggregate usage statistics from existing tables.
 * Runs four lightweight COUNT queries in parallel.
 *
 * @returns {Promise<UsageStats>}
 */
export async function getUsageStats() {
  const [podcasts, kbs, chunks, conversations] = await Promise.all([
    supabase.from('podcasts').select('id', { count: 'exact', head: true }),
    supabase.from('knowledge_bases').select('id', { count: 'exact', head: true }),
    supabase.from('chunks').select('id', { count: 'exact', head: true }),
    supabase.from('conversations').select('id', { count: 'exact', head: true }),
  ])

  // Surface the first error, if any
  const firstError = [podcasts, kbs, chunks, conversations].find((r) => r.error)
  if (firstError?.error) {
    throw new Error(`Failed to load usage stats: ${firstError.error.message}`)
  }

  return {
    podcastCount: podcasts.count ?? 0,
    kbCount: kbs.count ?? 0,
    totalChunks: chunks.count ?? 0,
    conversationCount: conversations.count ?? 0,
  }
}
