import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { listKnowledgeBases } from '../services/knowledgeBases'
import { listAllPodcasts } from '../services/podcasts'

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const [knowledgeBases, setKnowledgeBases] = useState([])
  const [podcasts, setPodcasts] = useState([])
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [kbData, podcastData] = await Promise.all([
        listKnowledgeBases(),
        listAllPodcasts(),
      ])
      setKnowledgeBases(kbData)
      setPodcasts(podcastData)
    } catch (err) {
      console.error('DataContext refresh failed:', err)
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const totalHours = podcasts.reduce((acc, p) => acc + (p.duration_seconds || 0), 0) / 3600

  return (
    <DataContext.Provider value={{ knowledgeBases, podcasts, totalHours, loaded, refresh }}>
      {children}
    </DataContext.Provider>
  )
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
