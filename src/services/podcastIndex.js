/**
 * Frontend service for Podcast Index search and episode listing.
 * Calls our Supabase Edge Functions which handle Podcast Index API auth.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Search for podcast shows by name/term.
 * Returns array of { id, title, author, description, artwork, feedUrl, episodeCount }
 */
export async function searchShows(query) {
  if (!query || !query.trim()) throw new Error('Search failed: query is required')

  let response
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/podcast-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ query: query.trim() }),
    })
  } catch (networkError) {
    throw new Error(`Search failed: network error (${networkError.message})`)
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(
      err.error || `Search failed: edge function returned HTTP ${response.status}`
    )
  }

  const data = await response.json()
  return data.results || []
}

/**
 * Get episodes for a podcast feed by Podcast Index feed ID.
 * Returns array of { id, title, description, datePublished, duration, enclosureUrl, image, fileSize, transcriptUrl, transcripts }
 */
export async function getEpisodes(feedId, feedUrl) {
  if (!feedId) throw new Error('Failed to load episodes: feed ID is required')

  let response
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/podcast-episodes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ feed_id: feedId, feed_url: feedUrl || null }),
    })
  } catch (networkError) {
    throw new Error(`Failed to load episodes: network error (${networkError.message})`)
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(
      err.error || `Failed to load episodes: edge function returned HTTP ${response.status}`
    )
  }

  const data = await response.json()
  return data.episodes || []
}
