import { useState, useCallback } from 'react'
import { searchApi } from '../services/api'

/**
 * Hook for semantic search.
 */
export function useSearch() {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [total, setTotal] = useState(0)

  const search = useCallback(async (query, limit = 10, podcastId = null) => {
    if (!query.trim()) {
      setResults([])
      setTotal(0)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const data = await searchApi.search(query, limit, podcastId)
      setResults(data.results)
      setTotal(data.total)
    } catch (err) {
      setError(err.message)
      setResults([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  const clear = useCallback(() => {
    setResults([])
    setTotal(0)
    setError(null)
  }, [])

  return {
    results,
    total,
    loading,
    error,
    search,
    clear,
  }
}

export default useSearch
