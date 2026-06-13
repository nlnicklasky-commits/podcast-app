import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { listKnowledgeBases } from '../services/knowledgeBases'
import { listAllPodcasts } from '../services/podcasts'
import { supabase } from './supabase'

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const [knowledgeBases, setKnowledgeBases] = useState([])
  const [podcasts, setPodcasts] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const debounceRef = useRef(null)

  const fetchData = useCallback(async () => {
    try {
      setLoadError(null)
      const [kbData, podcastData] = await Promise.all([
        listKnowledgeBases(),
        listAllPodcasts(),
      ])
      setKnowledgeBases(kbData)
      setPodcasts(podcastData)
    } catch (err) {
      console.error('DataContext refresh failed:', err)
      setLoadError(err.message || 'Failed to load data')
    } finally {
      setLoaded(true)
    }
  }, [])

  const clearData = useCallback(() => {
    setKnowledgeBases([])
    setPodcasts([])
    setLoadError(null)
    setLoaded(true)
  }, [])

  const refresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(fetchData, 200)
  }, [fetchData])

  // Drive data loading off auth state instead of a bare mount-fetch so the
  // Library/sidebar populate once the user is authenticated (RLS-aware).
  // onAuthStateChange fires INITIAL_SESSION synchronously on subscribe, so it
  // replaces the old mount-fetch - no duplicate fetch storm on first mount.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        clearData()
      } else if (session) {
        // INITIAL_SESSION (with session), SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED
        fetchData()
      } else {
        // INITIAL_SESSION with no session: nothing to load, mark resolved
        clearData()
      }
    })
    return () => subscription.unsubscribe()
  }, [fetchData, clearData])

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const totalHours = useMemo(
    () => podcasts.reduce((acc, p) => acc + (p.duration_seconds || 0), 0) / 3600,
    [podcasts],
  )

  const value = useMemo(
    () => ({ knowledgeBases, podcasts, totalHours, loaded, loadError, refresh }),
    [knowledgeBases, podcasts, totalHours, loaded, loadError, refresh],
  )

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  )
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
