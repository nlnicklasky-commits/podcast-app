import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { listKnowledgeBases } from '../services/knowledgeBases'
import { listAllPodcasts } from '../services/podcasts'

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

  const refresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(fetchData, 200)
  }, [fetchData])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const totalHours = podcasts.reduce((acc, p) => acc + (p.duration_seconds || 0), 0) / 3600

  return (
    <DataContext.Provider value={{ knowledgeBases, podcasts, totalHours, loaded, loadError, refresh }}>
      {children}
    </DataContext.Provider>
  )
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
