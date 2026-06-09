import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createKnowledgeBase, deleteKnowledgeBase } from '../services/knowledgeBases'
import { addPodcastFromIndex } from '../services/podcasts'
import { getRecentProgress } from '../services/playback'
import { useData } from '../lib/DataContext'
import CreateKBModal from '../components/CreateKBModal'
import AddPodcastModal from '../components/AddPodcastModal'
import { formatDate, timeAgo } from '../lib/utils'
import { KBGlyph, StatusPip, SectionHeader } from '../components/ui'
import { HomeSkeleton } from '../components/Skeleton'
import PodcastImage from '../components/PodcastImage'
import * as Icons from '../components/Icons'

export default function Home() {
  const navigate = useNavigate()
  const { knowledgeBases, podcasts, totalHours, loaded, loadError, refresh } = useData()
  const [showCreate, setShowCreate] = useState(false)
  const [showAddPodcast, setShowAddPodcast] = useState(false)
  const [progressMap, setProgressMap] = useState({})

  useEffect(() => {
    getRecentProgress().then((progressData) => {
      const map = {}
      for (const p of progressData) {
        if (p.duration_seconds && p.duration_seconds > 0) {
          map[p.podcast_id] = {
            percent: Math.min(100, Math.round((p.position_seconds / p.duration_seconds) * 100)),
            completed: p.completed,
          }
        }
      }
      setProgressMap(map)
    }).catch(console.error)
  }, [])

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
    await createKnowledgeBase(name, description)
    refresh()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this knowledge base and all its podcasts?')) return
    await deleteKnowledgeBase(id)
    refresh()
  }

  async function handleAddFromIndex(episode) {
    const { podcast, alreadyProcessed } = await addPodcastFromIndex(null, episode)
    refresh()
    return { alreadyProcessed }
  }

  if (!loaded) {
    return <HomeSkeleton />
  }
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

        {loadError && (
          <div className="mb-6 flex items-center gap-3 px-4 py-3 text-[13px] bg-[color-mix(in_oklab,var(--error),transparent_90%)] border border-[color-mix(in_oklab,var(--error),transparent_60%)] rounded-[var(--r-md)]">
            <span className="text-[var(--error)] flex-1">{loadError}</span>
            <button
              onClick={refresh}
              className="shrink-0 px-3 py-1 text-[12px] mono bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-md)] hover:border-[var(--accent)] transition-colors"
            >
              Retry
            </button>
          </div>
        )}

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
              {recentPodcasts.map((p, i) => {
                const prog = progressMap[p.id]
                return (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/podcast/${p.id}`)}
                    className={`relative flex items-center gap-3 sm:gap-3.5 px-3 sm:px-[18px] py-3 sm:py-3.5 w-full text-left transition-colors min-h-[44px] hover:bg-[var(--surface-2)] ${i === recentPodcasts.length - 1 ? '' : 'border-b border-[var(--border-soft)]'}`}
                  >
                    <PodcastImage src={p.thumbnail_url} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] truncate text-[var(--text)]">
                        {p.title || 'Untitled'}
                      </div>
                      <div className="text-[12px] dim mt-0.5">{p.channel || 'Unknown'}</div>
                    </div>
                    <div className="hidden sm:flex items-center gap-3">
                      <StatusPip status={p.status} />
                      {p.status === 'pending' && (
                        p.transcript_url
                          ? <span className="text-[11px] mono text-[var(--accent)]">Transcript</span>
                          : <span className="text-[11px] mono text-[color-mix(in_oklab,var(--text-dim),orange_40%)]">Audio</span>
                      )}
                      <span className="text-[11px] mono mute">{timeAgo(p.created_at)}</span>
                    </div>
                    <Icons.Arrow size={14} className="mute shrink-0" />

                    {/* Playback progress bar */}
                    {prog && !prog.completed && prog.percent > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--border-soft)]">
                        <div
                          className="h-full bg-[var(--accent)] transition-all"
                          style={{ width: `${prog.percent}%` }}
                        />
                      </div>
                    )}
                    {prog?.completed && (
                      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent)] opacity-40" />
                    )}
                  </button>
                )
              })}
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
          knowledgeBaseId={null}
        />
      )}
    </div>
  )
}

function KBCard({ kb, onClick, onDelete }) {
  const podcastCount = kb.knowledge_base_podcasts?.[0]?.count ?? 0
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      className="text-left flex flex-col gap-2.5 p-3.5 sm:p-[18px] transition-all group cursor-pointer bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)] hover:border-[color-mix(in_oklab,var(--accent),transparent_60%)] hover:-translate-y-px"
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
    </div>
  )
}
