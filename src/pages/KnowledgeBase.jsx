import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getKnowledgeBase, updateKnowledgeBase } from '../services/knowledgeBases'
import { listPodcasts, addPodcastFromIndex, removePodcastFromKB } from '../services/podcasts'
import { getInsights, getPodcastStatus } from '../services/processing'
import { useData } from '../lib/DataContext'
import { useToast } from '../lib/ToastContext'
import { useAudio } from '../lib/AudioContext'
import ConfirmDialog from '../components/ConfirmDialog'
import { KBGlyph, StatusPip, Button, EmptyState } from '../components/ui'
import PodcastImage from '../components/PodcastImage'
import * as Icons from '../components/Icons'
import { formatDuration } from '../lib/utils'
import ExportModal from '../components/ExportModal'
import { KBDetailSkeleton } from '../components/Skeleton'

const AddPodcastModal = lazy(() => import('../components/AddPodcastModal'))
const ChatPanel = lazy(() => import('../components/ChatPanel'))
const SynthesisPanel = lazy(() => import('../components/SynthesisPanel'))

const PanelFallback = () => (
  <div className="flex items-center justify-center h-full py-16">
    <div className="mute text-sm">Loading...</div>
  </div>
)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ACTIVE_STATUSES = ['downloading', 'transcribing', 'processing']

export default function KnowledgeBase() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { refresh } = useData()
  const { addToast } = useToast()
  const { track } = useAudio()
  const [kb, setKb] = useState(null)
  const [podcasts, setPodcasts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState(null)
  const [activeSection, setActiveSection] = useState('episodes')
  const [showChat, setShowChat] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportData, setExportData] = useState(null)
  const [pendingRemove, setPendingRemove] = useState(null)
  const [removing, setRemoving] = useState(false)

  // Poller bookkeeping that must survive across effect runs without retriggering it.
  const pollIntervalRef = useRef(null)
  const pollErrorsRef = useRef(0)
  // Latest active podcast ids for the interval to read without re-subscribing.
  const activeIdsRef = useRef([])

  // Extra bottom padding so the fixed MiniPlayer bar doesn't cover the last items
  const playerPad = track ? 'pb-[72px]' : ''

  async function handleOpenExportModal() {
    if (exporting) return
    setExporting(true)
    try {
      const readyPodcasts = podcasts.filter((p) => p.status === 'ready')
      const insightsResults = await Promise.all(
        readyPodcasts.map((p) => getInsights(p.id).then((ins) => ({ podcast: p, insights: ins })).catch(() => ({ podcast: p, insights: null }))),
      )
      setExportData({
        kb,
        podcastsWithInsights: insightsResults,
      })
      setShowExportModal(true)
    } catch (err) {
      console.error('Failed to load export data:', err)
      addToast('Failed to load data for export', 'error')
    } finally {
      setExporting(false)
    }
  }

  const load = useCallback(async () => {
    if (!UUID_RE.test(id)) {
      setKb(null)
      setLoadError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
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
      setLoadError('Failed to load this knowledge base.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  // Which rows are mid-processing right now. Joined+sorted into a stable key so
  // the poller effect only re-subscribes when the *set* of active rows changes
  // (a row starts/finishes), NOT on every progress tick — progress updates only
  // mutate the `progress`/`status` fields, keeping list order stable.
  const activeIds = podcasts.filter((p) => ACTIVE_STATUSES.includes(p.status)).map((p) => p.id)
  const activeKey = [...activeIds].sort().join(',')
  activeIdsRef.current = activeIds

  // Poll the status/progress of any in-flight rows ~every 3s, merging only the
  // changed fields back into state so the list neither reorders nor flickers.
  useEffect(() => {
    if (!activeKey) return

    pollErrorsRef.current = 0

    function stopPoll() {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }

    // Guard against a double-interval if the effect re-runs while one is live.
    if (pollIntervalRef.current) return stopPoll

    pollIntervalRef.current = setInterval(async () => {
      const ids = activeIdsRef.current
      if (ids.length === 0) {
        stopPoll()
        return
      }
      try {
        const results = await Promise.all(
          ids.map((pid) => getPodcastStatus(pid).then((s) => ({ pid, s })).catch(() => null)),
        )
        pollErrorsRef.current = 0
        const updates = new Map()
        let anyFinished = false
        for (const r of results) {
          if (!r || !r.s) continue
          updates.set(r.pid, r.s)
          if (!ACTIVE_STATUSES.includes(r.s.status)) anyFinished = true
        }
        if (updates.size > 0) {
          setPodcasts((prev) =>
            prev.map((p) => {
              const s = updates.get(p.id)
              return s ? { ...p, status: s.status, error_message: s.error_message, progress: s.progress } : p
            }),
          )
        }
        // A row reached ready/error/cancelled — refresh global counts/sidebars.
        if (anyFinished) refresh()
      } catch {
        pollErrorsRef.current++
        if (pollErrorsRef.current >= 5) stopPoll()
      }
    }, 3000)

    return stopPoll
  }, [activeKey, refresh])

  useEffect(() => {
    document.title = kb ? `${kb.name} — PodBrain` : 'PodBrain'
  }, [kb])

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

  async function confirmRemovePodcast() {
    if (!pendingRemove || removing) return
    setRemoving(true)
    try {
      await removePodcastFromKB(id, pendingRemove)
      setPodcasts((prev) => prev.filter((p) => p.id !== pendingRemove))
      refresh()
      setPendingRemove(null)
    } catch {
      addToast('Failed to remove podcast', 'error')
    } finally {
      setRemoving(false)
    }
  }

  function startRename() {
    setEditName(kb.name)
    setRenameError(null)
    setEditing(true)
  }

  function cancelRename() {
    setEditing(false)
    setRenameError(null)
    setEditName(kb.name)
  }

  async function handleRename() {
    const next = editName.trim()
    if (!next) {
      setRenameError('Name cannot be empty')
      return
    }
    if (next === kb.name) {
      setEditing(false)
      setRenameError(null)
      return
    }
    setRenaming(true)
    setRenameError(null)
    try {
      const updated = await updateKnowledgeBase(id, { name: next })
      setKb(updated)
      setEditing(false)
      refresh()
    } catch {
      setRenameError('Failed to rename — try again')
    } finally {
      setRenaming(false)
    }
  }

  if (loading) {
    return <KBDetailSkeleton />
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
        <h1 className="serif text-2xl font-medium">Couldn’t load knowledge base</h1>
        <p className="text-sm dim max-w-sm">{loadError}</p>
        <div className="flex items-center gap-3">
          <Button variant="primary" size="md" onClick={load}>Retry</Button>
          <Link to="/" className="text-sm text-[var(--accent)]">Back to home</Link>
        </div>
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
        <div className={`px-4 sm:px-6 md:px-8 py-6 sm:py-8 pb-16 max-w-[820px] mx-auto ${playerPad}`}>
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
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => { setEditName(e.target.value); setRenameError(null) }}
                      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); cancelRename() } }}
                      disabled={renaming}
                      className="serif text-2xl sm:text-[32px] font-medium tracking-tight flex-1 min-w-0 bg-transparent outline-none border border-[var(--border)] focus:border-[var(--accent)] rounded-[var(--r-sm)] px-2 py-[2px] text-[var(--text)] disabled:opacity-60"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={renaming}
                      title="Save name"
                      aria-label="Save name"
                      className="shrink-0 flex items-center justify-center min-w-[40px] min-h-[40px] rounded-[var(--r-md)] text-[var(--accent)] hover:bg-[var(--surface)] disabled:opacity-50"
                    >
                      <Icons.Check size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={cancelRename}
                      disabled={renaming}
                      title="Cancel"
                      aria-label="Cancel rename"
                      className="shrink-0 flex items-center justify-center min-w-[40px] min-h-[40px] rounded-[var(--r-md)] mute hover:bg-[var(--surface)] disabled:opacity-50"
                    >
                      <Icons.X size={16} />
                    </button>
                  </div>
                  {renameError && (
                    <p className="mt-1.5 text-[12px] text-[var(--error)]" role="alert">{renameError}</p>
                  )}
                </form>
              ) : (
                <button
                  type="button"
                  className="group/rename flex items-center gap-1.5 max-w-full cursor-pointer bg-transparent border-0 p-0 m-0 text-left"
                  onClick={startRename}
                  aria-label={`Rename ${kb.name}`}
                >
                  <h1 className="serif text-2xl sm:text-[32px] font-medium tracking-tight m-0 transition-colors truncate group-hover/rename:text-[var(--accent)]">
                    {kb.name}
                  </h1>
                  <Icons.Pencil size={14} className="shrink-0 mute sm:opacity-0 sm:group-hover/rename:opacity-100 transition-opacity" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Export all */}
              {readyCount > 0 && (
                <button
                  onClick={handleOpenExportModal}
                  disabled={exporting}
                  className="flex items-center gap-1.5 px-3 py-2 text-[13px] min-h-[44px] bg-transparent text-[var(--text-dim)] border border-[var(--border)] rounded-[var(--r-md)] hover:bg-[var(--surface)] disabled:opacity-50"
                  title="Export knowledge base"
                >
                  <Icons.Download size={14} />
                  <span className="hidden sm:inline">{exporting ? 'Loading...' : 'Export'}</span>
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
          <div role="tablist" aria-label="Knowledge base sections" className="flex gap-1 mt-8 mb-[22px] border-b border-[var(--border)] overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            {[
              { id: 'episodes', label: `Episodes · ${podcasts.length}`, icon: <Icons.Headphones size={12} /> },
              { id: 'synthesis', label: 'Synthesis', icon: <Icons.Sparkle size={12} /> },
            ].map((t) => (
              <button
                key={t.id}
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={activeSection === t.id}
                aria-controls={`tabpanel-${t.id}`}
                tabIndex={activeSection === t.id ? 0 : -1}
                onClick={() => setActiveSection(t.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] -mb-px transition-colors border-b-2 whitespace-nowrap min-h-[44px] ${activeSection === t.id ? 'text-[var(--text)] border-[var(--accent)] font-medium' : 'text-[var(--text-mute)] border-transparent font-normal'}`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          <div key={activeSection} role="tabpanel" id={`tabpanel-${activeSection}`} aria-labelledby={`tab-${activeSection}`} className="fade-in">
            {/* Episodes tab */}
            {activeSection === 'episodes' && (
              <div>
                {podcasts.length === 0 ? (
                  <EmptyState
                    icon={<Icons.Headphones size={24} />}
                    title="No podcasts yet"
                    subtitle="Search for a podcast to get started."
                    action={
                      <Button variant="primary" size="md" onClick={() => setShowAdd(true)}>
                        Add your first podcast
                      </Button>
                    }
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    {podcasts.map((p) => (
                      <PodcastRow
                        key={p.id}
                        podcast={p}
                        onClick={() => navigate(`/kb/${id}/podcast/${p.id}`)}
                        onDelete={() => setPendingRemove(p.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Synthesis tab */}
            {activeSection === 'synthesis' && (
              <Suspense fallback={<PanelFallback />}>
                <SynthesisPanel knowledgeBaseId={id} kbName={kb.name} readyCount={readyCount} />
              </Suspense>
            )}
          </div>
        </div>
      </div>

      {/* Co-present chat column — hidden on mobile */}
      <div
        className="hidden md:flex w-[400px] xl:w-[440px] shrink-0 flex-col h-full border-l border-[var(--border)] bg-[var(--bg-2)]"
      >
        <Suspense fallback={<PanelFallback />}>
          <ChatPanel knowledgeBaseId={id} kbName={kb.name} podcastCount={podcasts.length} />
        </Suspense>
      </div>

      {/* Mobile chat overlay */}
      {showChat && (
        <div className={`fixed inset-0 z-50 flex flex-col md:hidden bg-[var(--bg-2)] ${playerPad}`}>
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
            <Suspense fallback={<PanelFallback />}>
              <ChatPanel knowledgeBaseId={id} kbName={kb.name} podcastCount={podcasts.length} />
            </Suspense>
          </div>
        </div>
      )}

      {showAdd && (
        <Suspense fallback={null}>
          <AddPodcastModal
            onClose={() => setShowAdd(false)}
            onAddFromIndex={handleAddFromIndex}
            knowledgeBaseId={id}
          />
        </Suspense>
      )}

      <ConfirmDialog
        open={pendingRemove !== null}
        title="Remove podcast?"
        message="This removes the podcast from this knowledge base. The episode and its insights stay available elsewhere."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        destructive
        loading={removing}
        onConfirm={confirmRemovePodcast}
        onCancel={() => { if (!removing) setPendingRemove(null) }}
      />

      {showExportModal && exportData && (
        <ExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          scope="kb"
          data={exportData}
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
      <PodcastImage src={p.thumbnail_url} size={52} className="w-10 h-10 sm:w-[52px] sm:h-[52px]" />
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
        aria-label="Remove podcast"
        className="shrink-0 flex items-center justify-center min-w-[40px] min-h-[40px] rounded-[var(--r-md)] mute opacity-60 hover:opacity-100 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity hover:text-[var(--error)]"
        title="Remove"
      >
        <Icons.X size={14} />
      </button>
      <Icons.Arrow size={14} className="mute shrink-0" />
    </div>
  )
}
