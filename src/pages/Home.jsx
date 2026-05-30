import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { listKnowledgeBases, createKnowledgeBase, deleteKnowledgeBase } from '../services/knowledgeBases'
import { listAllPodcasts, addPodcastFromIndex } from '../services/podcasts'
import CreateKBModal from '../components/CreateKBModal'
import AddPodcastModal from '../components/AddPodcastModal'
import { formatDate, formatDuration, timeAgo } from '../lib/utils'
import { KBGlyph, StatusPip, SectionHeader } from '../components/ui'
import * as Icons from '../components/Icons'

export default function Home() {
  const navigate = useNavigate()
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

  useEffect(() => {
    function onNewKB() { setShowCreate(true) }
    function onAddPodcast() { setShowAddPodcast(true) }
    window.addEventListener('podbrain:new-kb', onNewKB)
    window.addEventListener('podbrain:add-podcast', onAddPodcast)
    return () => {
      window.removeEventListener('podbrain:new-kb', onNewKB)
      window.removeEventListener('podbrain:add-podcast', onAddPodcast)
    }
  }, [])

  async function handleCreate(name, description) {
    const kb = await createKnowledgeBase(name, description)
    setKnowledgeBases((prev) => [kb, ...prev])
    window.dispatchEvent(new CustomEvent('podbrain:data-changed'))
  }

  async function handleDelete(id) {
    if (!confirm('Delete this knowledge base and all its podcasts?')) return
    await deleteKnowledgeBase(id)
    setKnowledgeBases((prev) => prev.filter((kb) => kb.id !== id))
    window.dispatchEvent(new CustomEvent('podbrain:data-changed'))
  }

  async function handleAddFromIndex(episode) {
    const { podcast, alreadyProcessed } = await addPodcastFromIndex(null, episode)
    setPodcasts((prev) => [podcast, ...prev])
    window.dispatchEvent(new CustomEvent('podbrain:data-changed'))
    return { alreadyProcessed }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="mute text-sm">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-[var(--error)] mb-2">Failed to load</p>
          <p className="text-sm mute">{error}</p>
        </div>
      </div>
    )
  }

  const totalHours = podcasts.reduce((acc, p) => acc + (p.duration_seconds || 0), 0) / 3600
  const processingPodcasts = podcasts.filter((p) =>
    ['downloading', 'transcribing', 'processing'].includes(p.status),
  )
  const recentPodcasts = podcasts.slice(0, 5)

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const now = new Date()
  const dateStr = `${days[now.getDay()]} · ${months[now.getMonth()]} ${now.getDate()}`

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 sm:px-6 md:px-10 py-6 sm:py-8 pb-20 max-w-[1280px] mx-auto">
        {/* Hero */}
        <div className="mb-9">
          <div className="text-[11px] mono mute uppercase tracking-[0.12em] mb-2">
            {dateStr}
          </div>
          <h1 className="serif text-2xl sm:text-3xl md:text-[40px] font-medium tracking-tight leading-[1.1] m-0">
            Your library is{' '}
            <span className="text-[var(--accent)]">{Math.round(totalHours)} hours</span> deep
            {processingPodcasts.length > 0 && (
              <> — {processingPodcasts.length} episode{processingPodcasts.length !== 1 ? 's' : ''} still processing.</>
            )}
            {processingPodcasts.length === 0 && podcasts.length > 0 && '.'}
            {podcasts.length === 0 && ' — add your first podcast to get started.'}
          </h1>
        </div>

        {/* KB grid */}
        <SectionHeader
          title="Knowledge Bases"
          action={
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] transition-colors bg-transparent border border-transparent rounded-[var(--r-md)] text-[var(--text-dim)] hover:bg-[var(--surface)]"
            >
              <Icons.Plus size={13} />
              New KB
            </button>
          }
        />

        {knowledgeBases.length === 0 ? (
          <div
            className="text-center py-16 mb-9 border border-dashed border-[var(--border)] rounded-[var(--r-lg)]"
          >
            <p className="mute mb-1">No knowledge bases yet</p>
            <p className="text-sm mute">Create one to start organizing podcasts by topic.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 px-4 py-2 text-sm font-semibold transition-colors bg-[var(--accent)] text-[var(--accent-fg)] rounded-[var(--r-md)]"
            >
              Create your first knowledge base
            </button>
          </div>
        ) : (
          <div
            className="grid gap-3.5 mb-9 grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]"
          >
            {knowledgeBases.map((kb) => (
              <KBCard
                key={kb.id}
                kb={kb}
                onClick={() => navigate(`/kb/${kb.id}`)}
                onDelete={() => handleDelete(kb.id)}
              />
            ))}
          </div>
        )}

        {/* Recent podcasts */}
        {recentPodcasts.length > 0 && (
          <>
            <SectionHeader
              title="Recent podcasts"
              action={
                <button
                  onClick={() => setShowAddPodcast(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] transition-colors bg-transparent border border-transparent rounded-[var(--r-md)] text-[var(--text-dim)] hover:bg-[var(--surface)]"
                >
                  <Icons.Plus size={13} />
                  Add podcast
                </button>
              }
            />
            <div
              className="overflow-hidden bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)]"
            >
              {recentPodcasts.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => navigate(`/podcast/${p.id}`)}
                  className={`flex items-center gap-3 sm:gap-3.5 px-3 sm:px-[18px] py-3 sm:py-3.5 w-full text-left transition-colors min-h-[44px] hover:bg-[var(--surface-2)] ${i === recentPodcasts.length - 1 ? '' : 'border-b border-[var(--border-soft)]'}`}
                >
                  {p.thumbnail_url ? (
                    <img
                      src={p.thumbnail_url}
                      alt=""
                      className="w-10 h-10 object-cover shrink-0 rounded-[var(--r-sm)]"
                    />
                  ) : (
                    <div
                      className="w-10 h-10 shrink-0 grid place-items-center mute bg-[var(--bg-2)] rounded-[var(--r-sm)]"
                    >
                      <Icons.Headphones size={16} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] truncate text-[var(--text)]">
                      {p.title || 'Untitled'}
                    </div>
                    <div className="text-[12px] dim mt-0.5">{p.channel || 'Unknown'}</div>
                  </div>
                  <div className="hidden sm:flex items-center gap-3">
                    <StatusPip status={p.status} />
                    <span className="text-[11px] mono mute">{timeAgo(p.created_at)}</span>
                  </div>
                  <Icons.Arrow size={14} className="mute shrink-0" />
                </button>
              ))}
            </div>
          </>
        )}

        {podcasts.length === 0 && knowledgeBases.length > 0 && (
          <div
            className="text-center py-16 border border-dashed border-[var(--border)] rounded-[var(--r-lg)]"
          >
            <p className="mute mb-1">No podcasts yet</p>
            <p className="text-sm mute">Search for a podcast to get started.</p>
            <button
              onClick={() => setShowAddPodcast(true)}
              className="mt-4 px-4 py-2 text-sm font-semibold transition-colors bg-[var(--accent)] text-[var(--accent-fg)] rounded-[var(--r-md)]"
            >
              Add your first podcast
            </button>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateKBModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}

      {showAddPodcast && (
        <AddPodcastModal
          onClose={() => setShowAddPodcast(false)}
          onAddFromIndex={handleAddFromIndex}
        />
      )}
    </div>
  )
}

function KBCard({ kb, onClick, onDelete }) {
  const podcastCount = kb.knowledge_base_podcasts?.[0]?.count ?? 0
  return (
    <button
      onClick={onClick}
      className="text-left flex flex-col gap-2.5 p-3.5 sm:p-[18px] transition-all group bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)] hover:border-[color-mix(in_oklab,var(--accent),transparent_60%)] hover:-translate-y-px"
    >
      <div className="flex items-center gap-2.5">
        <KBGlyph name={kb.name} size={28} />
        <span className="text-[11px] mono mute">{timeAgo(kb.updated_at || kb.created_at)}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity p-1 mute hover:text-[var(--error)]"
          title="Delete"
        >
          <Icons.X size={12} />
        </button>
      </div>
      <h3 className="serif text-[17px] sm:text-[19px] leading-tight tracking-tight font-medium m-0">
        {kb.name}
      </h3>
      {kb.description && (
        <p className="text-[12.5px] dim leading-relaxed m-0 line-clamp-2">{kb.description}</p>
      )}
      <div className="flex gap-4 mt-1 text-[11px] mono mute">
        <span>{podcastCount} eps</span>
        <span>{formatDate(kb.created_at)}</span>
      </div>
    </button>
  )
}
