import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getKnowledgeBase, updateKnowledgeBase } from '../services/knowledgeBases'
import { listPodcasts, addPodcastFromIndex, removePodcastFromKB } from '../services/podcasts'
import AddPodcastModal from '../components/AddPodcastModal'
import ChatPanel from '../components/ChatPanel'
import { KBGlyph, StatusPip, SectionHeader } from '../components/ui'
import * as Icons from '../components/Icons'
import { formatDuration } from '../lib/utils'

export default function KnowledgeBase() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [kb, setKb] = useState(null)
  const [podcasts, setPodcasts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')

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

  useEffect(() => {
    function onAddPodcast() { setShowAdd(true) }
    window.addEventListener('podbrain:add-podcast', onAddPodcast)
    return () => window.removeEventListener('podbrain:add-podcast', onAddPodcast)
  }, [])

  async function handleAddFromIndex(episode) {
    const { podcast, alreadyProcessed } = await addPodcastFromIndex(id, episode)
    setPodcasts((prev) => [podcast, ...prev])
    window.dispatchEvent(new CustomEvent('podbrain:data-changed'))
    return { alreadyProcessed }
  }

  async function handleDeletePodcast(podcastId) {
    if (!confirm('Remove this podcast from the knowledge base?')) return
    await removePodcastFromKB(id, podcastId)
    setPodcasts((prev) => prev.filter((p) => p.id !== podcastId))
    window.dispatchEvent(new CustomEvent('podbrain:data-changed'))
  }

  async function handleRename() {
    if (!editName.trim() || editName.trim() === kb.name) {
      setEditing(false)
      return
    }
    const updated = await updateKnowledgeBase(id, { name: editName.trim() })
    setKb(updated)
    setEditing(false)
    window.dispatchEvent(new CustomEvent('podbrain:data-changed'))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="mute text-sm">Loading...</div>
      </div>
    )
  }

  if (!kb) return null

  const readyCount = podcasts.filter((p) => p.status === 'ready').length

  return (
    <div className="flex h-full min-w-0">
      {/* Main column */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="px-6 sm:px-8 py-8 pb-16 max-w-[820px] mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3.5 mb-2.5">
            <KBGlyph name={kb.name} size={40} />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] mono mute uppercase tracking-[0.1em]">Knowledge Base</div>
              {editing ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); handleRename() }}
                  className="mt-0.5"
                >
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="serif text-[32px] font-medium tracking-tight w-full bg-transparent outline-none border border-[var(--border)] rounded-[var(--r-sm)] px-2 py-[2px] text-[var(--text)]"
                    autoFocus
                    onBlur={handleRename}
                  />
                </form>
              ) : (
                <h1
                  className="serif text-[32px] font-medium tracking-tight m-0 cursor-pointer transition-colors truncate hover:text-[var(--accent)]"
                  onClick={() => setEditing(true)}
                  title="Click to rename"
                >
                  {kb.name}
                </h1>
              )}
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-3.5 py-2 text-[13px] font-semibold shrink-0 bg-[var(--accent)] text-[var(--accent-fg)] border border-[color-mix(in_oklab,var(--accent),white_10%)] rounded-[var(--r-md)]"
            >
              <Icons.Plus size={14} />
              Add podcast
            </button>
          </div>

          {kb.description && (
            <p className="dim text-sm leading-relaxed mt-0 mb-[18px]">{kb.description}</p>
          )}

          {/* Meta row */}
          <div className="flex gap-[18px] mb-7 text-[11px] mono mute">
            <span>{podcasts.length} podcasts</span>
            <span>·</span>
            <span>{readyCount} ready</span>
          </div>

          {/* Episode list */}
          <div className="mt-8">
            <SectionHeader
              title={`Episodes · ${podcasts.length}`}
              action={
                <button
                  onClick={() => setShowAdd(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] dim bg-transparent border border-transparent rounded-[var(--r-md)] hover:bg-[var(--surface)]"
                >
                  <Icons.Filter size={13} />
                  Filter
                </button>
              }
            />

            {podcasts.length === 0 ? (
              <div
                className="text-center py-16 border border-dashed border-[var(--border)] rounded-[var(--r-lg)]"
              >
                <p className="mute mb-1">No podcasts yet</p>
                <p className="text-sm mute">Search for a podcast to get started.</p>
                <button
                  onClick={() => setShowAdd(true)}
                  className="mt-4 px-4 py-2 text-sm font-semibold bg-[var(--accent)] text-[var(--accent-fg)] rounded-[var(--r-md)]"
                >
                  Add your first podcast
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {podcasts.map((p) => (
                  <PodcastRow
                    key={p.id}
                    podcast={p}
                    onClick={() => navigate(`/kb/${id}/podcast/${p.id}`)}
                    onDelete={() => handleDeletePodcast(p.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Co-present chat column — hidden on mobile */}
      <div
        className="hidden lg:flex w-[400px] xl:w-[440px] shrink-0 flex-col h-full border-l border-[var(--border)] bg-[var(--bg-2)]"
      >
        <ChatPanel knowledgeBaseId={id} kbName={kb.name} podcastCount={podcasts.length} />
      </div>

      {showAdd && (
        <AddPodcastModal
          onClose={() => setShowAdd(false)}
          onAddFromIndex={handleAddFromIndex}
        />
      )}
    </div>
  )
}

function PodcastRow({ podcast: p, onClick, onDelete }) {
  const isProcessing = ['downloading', 'transcribing', 'processing'].includes(p.status)
  return (
    <button
      onClick={onClick}
      className="flex gap-3 p-3 text-left items-center transition-colors group bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-md)] hover:border-[color-mix(in_oklab,var(--accent),transparent_60%)]"
    >
      {p.thumbnail_url ? (
        <img
          src={p.thumbnail_url}
          alt=""
          className="w-[52px] h-[52px] object-cover shrink-0 rounded-[var(--r-sm)]"
        />
      ) : (
        <div
          className="w-[52px] h-[52px] shrink-0 grid place-items-center mute bg-[var(--bg-2)] rounded-[var(--r-sm)]"
        >
          <Icons.Headphones size={20} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="serif text-[16px] tracking-tight truncate">{p.title || 'Untitled'}</div>
        <div className="text-[12px] dim mt-0.5">{p.channel || 'Unknown'}</div>
        <div className="flex gap-3 mt-1.5 text-[11px] mono mute items-center">
          <StatusPip status={p.status} />
          <span>{formatDuration(p.duration_seconds)}</span>
          {p.published_at && <span>{p.published_at}</span>}
        </div>
        {isProcessing && (
          <div className="mt-2 flex items-center gap-2.5">
            <div
              className="flex-1 h-[3px] overflow-hidden bg-[var(--bg-2)] rounded-[2px]"
            >
              <div
                className="h-full transition-all duration-500 bg-[var(--accent)]"
                style={{ width: `${p.progress || 0}%` }}
              />
            </div>
            <span className="text-[10px] mono text-[var(--accent)]">
              {Math.round(p.progress || 0)}%
            </span>
          </div>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 mute hover:text-[var(--error)]"
        title="Remove"
      >
        <Icons.X size={12} />
      </button>
      <Icons.Arrow size={14} className="mute" />
    </button>
  )
}
