import { useState, useCallback, useEffect } from 'react'
import { podcastApi, jobApi } from '../services/api'

/**
 * Hook for managing podcasts list.
 */
export function usePodcasts() {
  const [podcasts, setPodcasts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: false,
  })

  const fetchPodcasts = useCallback(async (page = 1) => {
    try {
      setLoading(true)
      setError(null)
      const data = await podcastApi.list(page, pagination.pageSize)
      setPodcasts(data.items)
      setPagination({
        page: data.page,
        pageSize: data.page_size,
        total: data.total,
        hasMore: data.has_more,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [pagination.pageSize])

  const refresh = useCallback(() => {
    fetchPodcasts(pagination.page)
  }, [fetchPodcasts, pagination.page])

  useEffect(() => {
    fetchPodcasts()
  }, [fetchPodcasts])

  return {
    podcasts,
    loading,
    error,
    pagination,
    fetchPodcasts,
    refresh,
  }
}

/**
 * Hook for managing a single podcast.
 */
export function usePodcast(id) {
  const [podcast, setPodcast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchPodcast = useCallback(async () => {
    if (!id) return
    try {
      setLoading(true)
      setError(null)
      const data = await podcastApi.get(id)
      setPodcast(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchPodcast()
  }, [fetchPodcast])

  return {
    podcast,
    loading,
    error,
    refresh: fetchPodcast,
  }
}

/**
 * Hook for adding a podcast.
 */
export function useAddPodcast() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const addPodcast = useCallback(async (url) => {
    try {
      setLoading(true)
      setError(null)
      const result = await podcastApi.create(url)
      return result
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    addPodcast,
    loading,
    error,
    clearError: () => setError(null),
  }
}

/**
 * Hook for polling job status.
 */
export function useJobStatus(jobId, pollInterval = 2000) {
  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(!!jobId)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!jobId) return

    let cancelled = false
    let timeoutId = null

    const fetchJob = async () => {
      try {
        const data = await jobApi.get(jobId)
        if (!cancelled) {
          setJob(data)
          setLoading(false)

          // Continue polling if not complete
          if (data.status !== 'completed' && data.status !== 'failed') {
            timeoutId = setTimeout(fetchJob, pollInterval)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      }
    }

    fetchJob()

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [jobId, pollInterval])

  return { job, loading, error }
}
