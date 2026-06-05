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
 * Returns { episodes, hasMore, oldestTimestamp }
 */
export async function getEpisodes(feedId, feedUrl, options = {}) {
  if (!feedId) throw new Error('Failed to load episodes: feed ID is required')

  const payload = { feed_id: feedId, feed_url: feedUrl || null }
  if (options.max) payload.max = options.max
  if (options.since) payload.since = options.since

  let response
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/podcast-episodes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
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
  return {
    episodes: data.episodes || [],
    hasMore: data.hasMore || false,
    oldestTimestamp: data.oldestTimestamp || null,
  }
}

/**
 * Fetch all episodes for a feed, paginating via `since` until no more remain.
 * Returns the full episode array sorted newest-first.
 */
export async function getAllEpisodes(feedId, feedUrl, onProgress) {
  // PI API max is 1000 per call — for most feeds, one call gets everything.
  // `since` means "episodes NEWER than this timestamp" so it can't paginate backwards.
  // We fetch max=1000 in one shot. If the feed has >1000 episodes, this gets the 1000 most recent.
  const { episodes } = await getEpisodes(feedId, feedUrl, { max: 1000 })

  if (onProgress) onProgress(episodes.length)
  return episodes
}

/**
 * Batch-resolve RSS feed URLs to Podcast Index feed objects.
 * Returns { results: [...], unresolved: [...] }
 */
export async function resolveFeeds(feedUrls) {
  if (!feedUrls || feedUrls.length === 0) return { results: [], unresolved: [] }

  let response
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/resolve-feeds`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ feed_urls: feedUrls }),
    })
  } catch (networkError) {
    throw new Error(`Failed to resolve feeds: network error (${networkError.message})`)
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `Failed to resolve feeds: HTTP ${response.status}`)
  }

  return response.json()
}

/**
 * Get Podcast Index categories.
 * Returns array of { id, name }
 */
export async function getCategories() {
  let response
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/podcast-discover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ action: 'categories' }),
    })
  } catch (networkError) {
    throw new Error(`Failed to load categories: network error (${networkError.message})`)
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `Failed to load categories: HTTP ${response.status}`)
  }

  const data = await response.json()
  return data.categories || []
}

/**
 * Get trending shows, optionally filtered by category.
 * Returns array of { id, title, author, description, artwork, feedUrl, episodeCount, trendScore }
 */
export async function getTrendingShows(categoryId, max = 20) {
  const payload = { action: 'trending', max }
  if (categoryId) payload.categoryId = categoryId

  let response
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/podcast-discover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    })
  } catch (networkError) {
    throw new Error(`Failed to load trending shows: network error (${networkError.message})`)
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `Failed to load trending shows: HTTP ${response.status}`)
  }

  const data = await response.json()
  return data.shows || []
}
