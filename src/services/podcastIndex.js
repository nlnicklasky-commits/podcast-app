/**
 * Frontend service for Podcast Index search and episode listing.
 * Calls our Supabase Edge Functions which handle Podcast Index API auth.
 */

import { callEdgeFunction } from './_edge'

/**
 * Search for podcast shows by name/term.
 * Returns array of { id, title, author, description, artwork, feedUrl, episodeCount }
 */
export async function searchShows(query) {
  if (!query || !query.trim()) throw new Error('Search failed: query is required')

  const data = await callEdgeFunction('podcast-search', { query: query.trim() }, {
    errorPrefix: 'Search failed',
  })
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

  const data = await callEdgeFunction('podcast-episodes', payload, {
    errorPrefix: 'Failed to load episodes',
  })
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

  return callEdgeFunction('resolve-feeds', { feed_urls: feedUrls }, {
    errorPrefix: 'Failed to resolve feeds',
  })
}

/**
 * Get Podcast Index categories.
 * Returns array of { id, name }
 */
export async function getCategories() {
  const data = await callEdgeFunction('podcast-discover', { action: 'categories' }, {
    errorPrefix: 'Failed to load categories',
  })
  return data.categories || []
}

/**
 * Get trending shows, optionally filtered by category.
 * Returns array of { id, title, author, description, artwork, feedUrl, episodeCount, trendScore }
 */
export async function getTrendingShows(categoryId, max = 20) {
  const payload = { action: 'trending', max }
  if (categoryId) payload.categoryId = categoryId

  const data = await callEdgeFunction('podcast-discover', payload, {
    errorPrefix: 'Failed to load trending shows',
  })
  return data.shows || []
}
