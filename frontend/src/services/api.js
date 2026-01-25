/**
 * API service for podcast knowledge base.
 */

const API_BASE = '/api'

/**
 * Handle API response, throwing on error.
 */
async function handleResponse(response) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(error.detail || `HTTP ${response.status}`)
  }
  return response.json()
}

/**
 * Podcast API
 */
export const podcastApi = {
  /**
   * Add a new podcast by URL.
   */
  async create(url) {
    const response = await fetch(`${API_BASE}/podcasts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    return handleResponse(response)
  },

  /**
   * List all podcasts with pagination.
   */
  async list(page = 1, pageSize = 20, status = null) {
    const params = new URLSearchParams({ page, page_size: pageSize })
    if (status) params.append('status', status)

    const response = await fetch(`${API_BASE}/podcasts?${params}`)
    return handleResponse(response)
  },

  /**
   * Get podcast details by ID.
   */
  async get(id) {
    const response = await fetch(`${API_BASE}/podcasts/${id}`)
    return handleResponse(response)
  },

  /**
   * Delete a podcast by ID.
   */
  async delete(id) {
    const response = await fetch(`${API_BASE}/podcasts/${id}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
      throw new Error(error.detail || `HTTP ${response.status}`)
    }
    return true
  },
}

/**
 * Job API
 */
export const jobApi = {
  /**
   * Get job status by ID.
   */
  async get(id) {
    const response = await fetch(`${API_BASE}/jobs/${id}`)
    return handleResponse(response)
  },

  /**
   * List jobs with optional filters.
   */
  async list(status = null, podcastId = null, limit = 20) {
    const params = new URLSearchParams({ limit })
    if (status) params.append('status', status)
    if (podcastId) params.append('podcast_id', podcastId)

    const response = await fetch(`${API_BASE}/jobs?${params}`)
    return handleResponse(response)
  },
}

/**
 * Search API
 */
export const searchApi = {
  /**
   * Perform semantic search.
   */
  async search(query, limit = 10, podcastId = null) {
    const response = await fetch(`${API_BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        limit,
        podcast_id: podcastId,
      }),
    })
    return handleResponse(response)
  },
}

export default { podcastApi, jobApi, searchApi }
