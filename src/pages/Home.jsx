import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listKnowledgeBases, createKnowledgeBase, deleteKnowledgeBase } from '../services/knowledgeBases'
import { listAllPodcasts } from '../services/podcasts'
import CreateKBModal from '../components/CreateKBModal'
import AddPodcastModal from '../components/AddPodcastModal'
import { addPodcast, addPodcastFromIndex } from '../services/podcasts'
import { formatDate, statusColors } from '../lib/utils'

export default function Home() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('knowledgeBases')
  const [knowledgeBases, setKnowledgeBases] = useState([])
  const [podcasts, setPodcasts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showAddPodcast, setShowAddPodcast] = useState(false)
  const [error, setError] = useState(null)

  async function load() {
    try {
      const [kbData, podcastData] = await Promise.all([
        listKnowledgeBases(),
        listAllPodcasts(),
      ])
      setKnowledgeBases(kbData)
      setPodcasts(podcastData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleCreate(name, description) {
    const kb = await createKnowledgeBase(name, description)
    setKnowledgeBases((prev) => [kb, ...prev])
  }

  async function handleDelete(id) {
    if (!confirm('Delete this knowledge base and all its podcasts?')) return
    await deleteKnowledgeBase(id)
    setKnowledgeBases((prev) => prev.filter((kb) => kb.id !== id))
  }

  async function handleAddStandalonePodcast(url) {
    const { podcast, alreadyProcessed } = await addPodcast(null, url)
    setPodcasts((prev) => [podcast, ...prev])
    return { alreadyProcessed }
  }

  async function handleAddFromIndex(episode) {
    const { podcast, alreadyProcessed } = await addPodcastFromIndex(null, episode)
    setPodcasts((prev) => [podcast, ...prev])
    return { alreadyProcessed }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400 mb-2">Failed to load</p>
        <p className="text-sm text-gray-500">{error}</p>
        <p className="text-sm text-gray-500 mt-4">
          Make sure your <code className="bg-white/10 px-1.5 py-0.5 rounded text-xs">.env</code> file
          has valid Supabase credentials.
        </p>
      </div>
    )
  }

  const tabs = [
    { id: 'knowledgeBases', label: `Knowledge Bases (${knowledgeBases.length})` },
    { id: 'podcasts', label: `Podcasts (${podcasts.length})` },
  ]

  return (
    <div>
      {/* Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex gap-1 border-b border-white/10">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 sm:px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'text-purple-400 border-purple-400'
                  : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {activeTab === 'knowledgeBases' && (
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors self-start sm:self-auto"
          >
            + New KB
          </button>
        )}
        {activeTab === 'podcasts' && (
          <button
            onClick={() => setShowAddPodcast(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors self-start sm:self-auto"
          >
            + Add Podcast
          </button>
        )}
      </div>

      {/* Knowledge Bases Tab */}
      {activeTab === 'knowledgeBases' && (
        <>
          {knowledgeBases.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-white/10 rounded-xl">
              <p className="text-4xl mb-3">🎧</p>
              <p className="text-gray-400 mb-1">No knowledge bases yet</p>
              <p className="text-sm text-gray-500">
                Create one to start organizing podcasts by topic.
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors"
              >
                Create your first knowledge base
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {knowledgeBases.map((kb) => {
                const podcastCount = kb.knowledge_base_podcasts?.[0]?.count ?? 0
                return (
                  <Link
                    key={kb.id}
                    to={`/kb/${kb.id}`}
                    className="block bg-white/5 border border-white/10 rounded-xl p-5 hover:border-purple-500/50 hover:bg-white/[0.07] transition-all group no-underline"
                  >
                    <div className="flex items-start justify-between">
                      <h2 className="text-lg font-semibold text-white group-hover:text-purple-300 transition-colors">
                        {kb.name}
                      </h2>
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleDelete(kb.id)
                        }}
                        className="sm:opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all p-1"
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                    {kb.description && (
                      <p className="text-sm text-gray-400 mt-1 line-clamp-2">
                        {kb.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
                      <span>{podcastCount} podcast{podcastCount !== 1 ? 's' : ''}</span>
                      <span>·</span>
                      <span>{formatDate(kb.created_at)}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Podcasts Tab */}
      {activeTab === 'podcasts' && (
        <>
          {podcasts.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-white/10 rounded-xl">
              <p className="text-4xl mb-3">📻</p>
              <p className="text-gray-400 mb-1">No podcasts yet</p>
              <p className="text-sm text-gray-500">
                Search for a podcast to get started.
              </p>
              <button
                onClick={() => setShowAddPodcast(true)}
                className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors"
              >
                Add your first podcast
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {podcasts.map((podcast) => {
                const statusClass = statusColors[podcast.status] || statusColors.pending
                return (
                  <Link
                    key={podcast.id}
                    to={`/podcast/${podcast.id}`}
                    className="block bg-white/5 border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors no-underline"
                  >
                    <div className="flex gap-3 sm:gap-4">
                      {podcast.thumbnail_url ? (
                        <img
                          src={podcast.thumbnail_url}
                          alt=""
                          className="w-20 h-14 sm:w-32 sm:h-20 object-cover rounded-lg flex-shrink-0"
                        />
                      ) : (
                        <div className="w-20 h-14 sm:w-32 sm:h-20 bg-white/5 rounded-lg flex-shrink-0 flex items-center justify-center text-xl sm:text-2xl">
                          🎙️
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-medium truncate">
                          {podcast.title || 'Untitled Podcast'}
                        </h3>
                        {podcast.channel && (
                          <p className="text-sm text-gray-400 mt-0.5">{podcast.channel}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass}`}>
                            {podcast.status}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatDate(podcast.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </>
      )}

      {showCreate && (
        <CreateKBModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}

      {showAddPodcast && (
        <AddPodcastModal
          onClose={() => setShowAddPodcast(false)}
          onAdd={handleAddStandalonePodcast}
          onAddFromIndex={handleAddFromIndex}
        />
      )}
    </div>
  )
}
