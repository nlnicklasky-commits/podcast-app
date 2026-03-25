import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getKnowledgeBase, updateKnowledgeBase } from '../services/knowledgeBases'
import { listPodcasts, addPodcast, addPodcastFromIndex, removePodcastFromKB } from '../services/podcasts'
import AddPodcastModal from '../components/AddPodcastModal'
import PodcastCard from '../components/PodcastCard'
import ChatPanel from '../components/ChatPanel'

export default function KnowledgeBase() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [kb, setKb] = useState(null)
  const [podcasts, setPodcasts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [activeTab, setActiveTab] = useState('podcasts')

  async function load() {
    try {
      const [kbData, podcastData] = await Promise.all([
        getKnowledgeBase(id),
        listPodcasts(id),
      ])
      setKb(kbData)
      setPodcasts(podcastData)
      setEditName(kbData.name)
    } catch (err) {
      console.error(err)
      navigate('/')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  async function handleAddPodcast(url) {
    const { podcast, alreadyProcessed } = await addPodcast(id, url)
    setPodcasts((prev) => [podcast, ...prev])
    return { alreadyProcessed }
  }

  async function handleAddFromIndex(episode) {
    const { podcast, alreadyProcessed } = await addPodcastFromIndex(id, episode)
    setPodcasts((prev) => [podcast, ...prev])
    return { alreadyProcessed }
  }

  async function handleDeletePodcast(podcastId) {
    if (!confirm('Remove this podcast from the knowledge base?')) return
    await removePodcastFromKB(id, podcastId)
    setPodcasts((prev) => prev.filter((p) => p.id !== podcastId))
  }

  function handleStatusChange(podcastId, status, errorMessage, progress) {
    setPodcasts((prev) =>
      prev.map((p) =>
        p.id === podcastId
          ? { ...p, status, error_message: errorMessage, progress: progress || 0 }
          : p,
      ),
    )
  }

  function handleSelectPodcast(podcast) {
    navigate(`/kb/${id}/podcast/${podcast.id}`)
  }

  async function handleRename() {
    if (!editName.trim() || editName.trim() === kb.name) {
      setEditing(false)
      return
    }
    const updated = await updateKnowledgeBase(id, { name: editName.trim() })
    setKb(updated)
    setEditing(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    )
  }

  if (!kb) return null

  const readyCount = podcasts.filter((p) => p.status === 'ready').length
  const tabs = [
    { id: 'podcasts', label: `Podcasts (${podcasts.length})` },
    { id: 'chat', label: '💬 Chat', disabled: readyCount === 0 },
  ]

  return (
    <div>
      {/* KB Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1">
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleRename()
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-2xl font-bold bg-white/5 border border-white/20 rounded-lg px-3 py-1 text-white focus:outline-none focus:border-purple-500"
                autoFocus
                onBlur={handleRename}
              />
            </form>
          ) : (
            <h1
              className="text-3xl font-bold text-white cursor-pointer hover:text-purple-300 transition-colors"
              onClick={() => setEditing(true)}
              title="Click to rename"
            >
              {kb.name}
            </h1>
          )}
          {kb.description && (
            <p className="text-gray-400 mt-1">{kb.description}</p>
          )}
        </div>
        {activeTab === 'podcasts' && (
          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
          >
            + Add Podcast
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && setActiveTab(tab.id)}
            disabled={tab.disabled}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'text-purple-400 border-purple-400'
                : tab.disabled
                  ? 'text-gray-600 border-transparent cursor-not-allowed'
                  : 'text-gray-400 border-transparent hover:text-white'
            }`}
            title={tab.disabled ? 'Process at least one podcast first' : ''}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
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
                onClick={() => setShowAdd(true)}
                className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors"
              >
                Add your first podcast
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {podcasts.map((podcast) => (
                <PodcastCard
                  key={podcast.id}
                  podcast={podcast}
                  onDelete={handleDeletePodcast}
                  onSelect={handleSelectPodcast}
                />
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'chat' && (
        <ChatPanel knowledgeBaseId={id} />
      )}

      {showAdd && (
        <AddPodcastModal
          onClose={() => setShowAdd(false)}
          onAdd={handleAddPodcast}
          onAddFromIndex={handleAddFromIndex}
        />
      )}
    </div>
  )
}
