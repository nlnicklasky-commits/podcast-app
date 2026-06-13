import { useState, useEffect } from 'react'
import { getCategories, getTrendingShows } from '../services/podcastIndex'
import SubscribeButton from '../components/SubscribeButton'
import AddPodcastModal from '../components/AddPodcastModal'
import { addPodcastFromIndex } from '../services/podcasts'
import { useData } from '../lib/DataContext'
import { DiscoverSkeleton } from '../components/Skeleton'
import * as Icons from '../components/Icons'

function decodeHtml(html) {
  if (!html) return ''
  const txt = document.createElement('textarea')
  txt.innerHTML = html
  return txt.value
}

function decodeShows(shows) {
  return shows.map(show => ({
    ...show,
    title: decodeHtml(show.title),
    description: decodeHtml(show.description),
  }))
}

export default function DiscoverPage() {
  const { refresh } = useData()
  const [categories, setCategories] = useState([])
  const [shows, setShows] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [loadingShows, setLoadingShows] = useState(false)
  const [error, setError] = useState(null)
  const [browseShow, setBrowseShow] = useState(null)

  useEffect(() => { document.title = 'Discover — PodBrain' }, [])

  useEffect(() => {
    loadInitial()
  }, [])

  async function loadInitial() {
    setLoadingCategories(true)
    setError(null)
    try {
      const [cats, trending] = await Promise.all([
        getCategories(),
        getTrendingShows(null, 20),
      ])
      setCategories(cats)
      setShows(decodeShows(trending))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingCategories(false)
    }
  }

  async function handleSelectCategory(cat) {
    setSelectedCategory(cat)
    setLoadingShows(true)
    setError(null)
    try {
      const results = await getTrendingShows(cat.id, 30)
      setShows(decodeShows(results))
    } catch (err) {
      setError(err.message)
      setShows([])
    } finally {
      setLoadingShows(false)
    }
  }

  async function handleClearCategory() {
    setSelectedCategory(null)
    setLoadingShows(true)
    setError(null)
    try {
      const trending = await getTrendingShows(null, 20)
      setShows(decodeShows(trending))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingShows(false)
    }
  }

  async function handleAddFromIndex(episode) {
    const { alreadyProcessed } = await addPodcastFromIndex(null, episode)
    refresh()
    return { alreadyProcessed }
  }

  if (loadingCategories) {
    return <DiscoverSkeleton />
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 sm:px-10 py-8 pb-20 max-w-[960px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="serif text-[28px] font-medium tracking-tight m-0 mb-1">Discover</h1>
          <p className="text-[14px] dim m-0">
            {selectedCategory
              ? `Trending in ${selectedCategory.name}`
              : 'Trending podcasts across all categories'
            }
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-3 px-3.5 py-2.5 text-[13px] bg-[color-mix(in_oklab,var(--error),transparent_85%)] text-[var(--error)] border border-[color-mix(in_oklab,var(--error),transparent_70%)] rounded-[var(--r-md)]">
            <span className="flex-1">{error}</span>
            <button
              onClick={selectedCategory ? () => handleSelectCategory(selectedCategory) : loadInitial}
              className="shrink-0 px-3 py-1 text-[12px] mono bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-md)] text-[var(--text-dim)] hover:border-[var(--accent)] transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Categories */}
        <div className="mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            {selectedCategory && (
              <button
                onClick={handleClearCategory}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-[var(--accent)] text-[var(--accent-fg)] rounded-full"
              >
                {selectedCategory.name}
                <Icons.X size={11} />
              </button>
            )}
            {!selectedCategory && categories.slice(0, 24).map(cat => (
              <button
                key={cat.id}
                onClick={() => handleSelectCategory(cat)}
                className="px-3 py-1.5 text-[12px] font-medium bg-[var(--surface)] border border-[var(--border)] rounded-full transition-colors hover:border-[color-mix(in_oklab,var(--accent),transparent_60%)] hover:text-[var(--accent)]"
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Shows */}
        {loadingShows ? (
          <div className="flex items-center justify-center py-12 gap-2">
            <span className="w-4 h-4 rounded-full border-2 animate-spin border-[var(--accent)] border-t-transparent" />
            <span className="text-[13px] mute">Loading...</span>
          </div>
        ) : shows.length === 0 ? (
          <p className="mute text-[13px] text-center py-12">No shows found</p>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {shows.map(show => (
              <div
                key={show.id}
                className="flex gap-3 p-3.5 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)] transition-colors hover:border-[color-mix(in_oklab,var(--accent),transparent_60%)]"
              >
                {show.artwork && (
                  <img
                    src={show.artwork}
                    alt=""
                    className="w-[60px] h-[60px] rounded-[var(--r-md)] object-cover shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium line-clamp-1 m-0">
                    {show.title}
                  </p>
                  <p className="text-[12px] dim mt-0.5 m-0 truncate">{show.author}</p>
                  <p className="text-[11px] mute mt-0.5 line-clamp-1 m-0">
                    {show.episodeCount ? `${show.episodeCount} episodes` : ''}
                    {show.description ? (show.episodeCount ? ' · ' : '') + show.description.slice(0, 60) : ''}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => setBrowseShow(show)}
                      className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-[var(--accent)] text-[var(--accent-fg)] rounded-[var(--r-sm)] transition-colors"
                    >
                      Browse Episodes
                    </button>
                    <SubscribeButton show={show} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {browseShow && (
        <AddPodcastModal
          onClose={() => setBrowseShow(null)}
          onAddFromIndex={handleAddFromIndex}
          knowledgeBaseId={null}
          initialShow={browseShow}
        />
      )}
    </div>
  )
}
