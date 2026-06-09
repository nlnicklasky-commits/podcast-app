import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getKnowledgeBase, updateKnowledgeBase } from '../services/knowledgeBases'
import { listPodcasts, addPodcastFromIndex, removePodcastFromKB } from '../services/podcasts'
import { getInsights } from '../services/processing'
import { getSynthesis } from '../services/synthesis'
import { useData } from '../lib/DataContext'
import AddPodcastModal from '../components/AddPodcastModal'
import ChatPanel from '../components/ChatPanel'
import SynthesisPanel from '../components/SynthesisPanel'
import { KBGlyph, StatusPip, SectionHeader } from '../components/ui'
import * as Icons from '../components/Icons'
import { formatDuration } from '../lib/utils'
import { fullKBToMarkdown, downloadMarkdown, slugify } from '../lib/export'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function KnowledgeBase() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { refresh } = useData()
  const [kb, setKb] = useState(null)
  const [podcasts, setPodcasts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [activeSection, setActiveSection] = useState('episodes')
  const [showChat, setShowChat] = useState(false)
  const [exporting, setExporting] = useState(false)

  async function handleExportAll() {
    if (exporting) return
    setExporting(true)
    try {
      // Fetch insights for all ready podcasts in parallel
      const readyPodcasts = podcasts.filter((p) => p.status === 'ready')
      const [insightsResults, synthesis] = await Promise.all([
        Promise.all(readyPodcasts.map((p) => getInsights(p.id).then((ins) => ({ podcast: p, insights: ins })))),
        getSynthesis(id),
      ])
      const podcastInsights = insightsResults.filter((r) => r.insights)
      const md = fullKBToMarkdown(kb.name, podcastInsights, synthesis)
      const filename = `${slugify(kb.name)}-full-export.md`
      downloadMarkdown(md, filename)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  const load = useCallback(async () => {
    if (!UUID_RE.test(id)) {
      setLoading(false)
      return
    }
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
  }, [id, navigate])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    function onAddPodcast() { setShowAdd(true) }
    window.addEventListener('podbrain:add-podcast', onAddPodcast)
    return () => window.removeEventListener('podbrain:add-podcast', onAddPodcast)
  }, [])

  async function handleAddFromIndex(episode) {
    const { podcast, alreadyProcessed } = await addPodcastFromIndex(id, episode)
    setPodcasts((prev) => [podcast, ...prev])
    refresh()
    return { alreadyProcessed }
  }

  async function handleDeletePodcast(podcastId) {
    if (!confirm('Remove this podcast from the knowledge base?')) return
    await removePodcastFromKB(id, podcastId)
    setPodcasts((prev) => prev.filter((p) => p.id !== podcastId))
    refresh()
  }

  async function handleRename() {
    if (!editName.trim() || editName.trim() === kb.name) {
      setEditing(false)
      return
    }
    const updated = await updateKnowledgeBase(id, { name: editName.trim() })
    setKb(updated)
    setEditing(false)
    refresh()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="mute text-sm">Loading...</div>
      </div>
    )
  }

  if (!kb) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <h1 className="serif text-2xl font-medium">Knowledge base not found</h1>
        <Link to="/" className="text-sm text-[var(--accent)]">Back to home</Link>
      </div>
    )
  }

  const readyCount = podcasts.filter((p) => p.status === 'ready').length

  return (
    <div className="flex h-full min-w-0">
      {/* Main column */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="px-4 sm:px-6 md:px-8 py-6 sm:py-8 pb-16 max-w-[820px] mx-auto">
          {/* Header */}
          <div className="flex items-start sm:items-center gap-3 sm:gap-3.5 mb-2.5">
            <KBGlyph name={kb.name} size={40} className="shrink-0" />
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
                    className="serif text-2xl sm:text-[32px] font-medium tracking-tight w-full bg-transparent outline-none border border-[var(--border)] rounded-[var(--r-sm)] px-2 py-[2px] text-[var(--text)]"
                    autoFocus
                    onBlur={handleRename}
                  />
                </form>
              ) : (
                <h1
                  className="serif text-2xl sm:text-[32px] font-medium tracking-tight m-0 cursor-pointer transition-colors truncate hover:text-[var(--accent)]"
                  onClick={() => setEditing(true)}
                  title="Click to rename"
                >
                  {kb.name}
                </h1>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Export all */}
              {readyCount > 0 && (
                <button
                  onClick={handleExportAll}
                  disabled={exporting}
                  className="flex items-center gap-1.5 px-3 py-2 text-[13px] min-h-[44px] bg-transparent text-[var(--text-dim)] border border-[var(--border)] rounded-[var(--r-md)] hover:bg-[var(--surface)] disabled:opacity-50"
                  title="Export all insights and synthesis as markdown"
                >
                  <Icons.Download size={14} />
                  <span className="hidden sm:inline">{exporting ? 'Exporting...' : 'Export All'}</span>
                </button>
              )}
              {/* Mobile chat toggle */}
              <button
                onClick={() => setShowChat(true)}
                className="md:hidden flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold min-h-[44px] bg-[var(--surface)] text-[var(--text-dim)] border border-[var(--border)] rounded-[var(--r-md)]"
              >
                <Icons.Sparkle size={14} />
                <span className="hidden sm:inline">Chat</span>
              </button>
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-3.5 py-2 text-[13px] font-semibold min-h-[44px] bg-[var(--accent)] text-[var(--accent-fg)] border border-[color-mix(in_oklab,var(--accent),white_10%)] rounded-[var(--r-md)]"
              >
                <Icons.Plus size={14} />
                <span className="hidden sm:inline">Add podcast</span>
              </button>
            </div>
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

          {/* Section tabs */}
          <div className="flex gap-1 mt-8 mb-[22px] border-b border-[var(--border)] overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            {[
              { id: 'episodes', label: `Episodes · ${podcasts.length}`, icon: <Icons.Headphones size={12} /> },
              { id: 'synthesis', label: 'Synthesis', icon: <Icons.Sparkle size={12} /> },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveSection(t.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] -mb-px transition-colors border-b-2 whitespace-nowrap min-h-[44px] ${activeSection === t.id ? 'text-[var(--text)] border-[var(--accent)] font-medium' : 'text-[var(--text-mute)] border-transparent font-normal'}`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          <div key={activeSection} className="fade-in">
            {/* Episodes tab */}
            {activeSection === 'episodes' && (
              <div>
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
            )}

            {/* Synthesis tab */}
            {activeSection === 'synthesis' && (
              <SynthesisPanel knowledgeBaseId={id} kbName={kb.name} readyCount={readyCount} />
            )}
          </div>
        </div>
      </div>

      {/* Co-present chat column — hidden on mobile */}
      <div
        className="hidden md:flex w-[400px] xl:w-[440px] shrink-0 flex-col h-full border-l border-[var(--border)] bg-[var(--bg-2)]"
      >
        <ChatPanel knowledgeBaseId={id} kbName={kb.name} podcastCount={podcasts.length} />
      </div>

      {/* Mobile chat overlay */}
      {showChat && (
        <div className="fixed inset-0 z-50 flex flex-col md:hidden bg-[var(--bg-2)]">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] shrink-0">
            <button
              onClick={() => setShowChat(false)}
              className="mute min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <Icons.Back size={18} />
            </button>
            <span className="text-sm font-medium flex-1">Chat with {kb.name}</span>
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            <ChatPanel knowledgeBaseId={id} kbName={kb.name} podcastCount={podcasts.length} />
          </div>
        </div>
      )}

      {showAdd && (
        <AddPodcastModal
          onClose={() => setShowAdd(false)}
          onAddFromIndex={handleAddFromIndex}
          knowledgeBaseId={id}
        />
      )}
    </div>
  )
}

function PodcastRow({ podcast: p, onClick, onDelete }) {
  const isProcessing = ['downloading', 'transcribing', 'processing'].includes(p.status)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      className="flex gap-3 p-3 text-left items-center transition-colors group cursor-pointer min-h-[44px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-md)] hover:border-[color-mix(in_oklab,var(--accent),transparent_60%)]"
    >
      {p.thumbnail_url ? (
        <img
          src={p.thumbnail_url}
          alt=""
          className="w-10 h-10 sm:w-[52px] sm:h-[52px] object-cover shrink-0 rounded-[var(--r-sm)]"
          onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
        />
      ) : (
        <div
          className="w-10 h-10 sm:w-[52px] sm:h-[52px] shrink-0 grid place-items-center mute bg-[var(--bg-2)] rounded-[var(--r-sm)]"
        >
          <Icons.Headphones size={20} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="serif text-[14px] sm:text-[16px] tracking-tight truncate">{p.title || 'Untitled'}</div>
        <div className="text-[12px] dim mt-0.5">{p.channel || 'Unknown'}</div>
        <div className="flex gap-3 mt-1.5 text-[11px] mono mute items-center flex-wrap">
          <StatusPip status={p.status} />
          <span>{formatDuration(p.duration_seconds)}</span>
          {p.status === 'pending' && (
            p.transcript_url
              ? <span className="text-[var(--accent)]">Transcript</span>
              : <span className="text-[color-mix(in_oklab,var(--text-dim),orange_40%)]">Audio</span>
          )}
          {p.published_at && <span className="hidden sm:inline">{p.published_at}</span>}
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
    </div>
  )
}
