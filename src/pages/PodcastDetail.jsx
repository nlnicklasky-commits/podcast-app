import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getInsights, getTranscript, processPodcast, getPodcastStatus, cancelProcessing, getProcessingLogs } from '../services/processing'
import { getPodcastKBs } from '../services/podcasts'
import { getProgress, saveProgress } from '../services/playback'
import { useAuth } from '../lib/useAuth'
import { useToast } from '../lib/ToastContext'
import InsightsPanel from '../components/InsightsPanel'
import AddToKBModal from '../components/AddToKBModal'
import ProcessingProgress from '../components/ProcessingProgress'
import ProcessingLog from '../components/ProcessingLog'
import { StatusPip, Tag } from '../components/ui'
import * as Icons from '../components/Icons'
import { formatDate, formatDuration, formatTimestamp } from '../lib/utils'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2]
const SAVE_DEBOUNCE_MS = 10_000
const COMPLETION_THRESHOLD = 0.9

export default function PodcastDetail() {
  const { kbId, podcastId } = useParams()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [searchParams] = useSearchParams()
  const timestampParam = searchParams.get('t')
  const [podcast, setPodcast] = useState(null)
  const [transcript, setTranscript] = useState(null)
  const [linkedKBs, setLinkedKBs] = useState([])
  const [activeTab, setActiveTab] = useState('insights')
  const [loading, setLoading] = useState(true)
  const [showAddToKB, setShowAddToKB] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processingStartedAt, setProcessingStartedAt] = useState(null)
  const [processingFinishedAt, setProcessingFinishedAt] = useState(null)
  const [showAudioConfirm, setShowAudioConfirm] = useState(false)

  // Playback state
  const { user } = useAuth()
  const audioRef = useRef(null)
  const [savedProgress, setSavedProgress] = useState(null)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [isPlaying, setIsPlaying] = useState(false)
  const lastSaveRef = useRef(0)
  const saveTimerRef = useRef(null)
  const pollIntervalRef = useRef(null)
  const completionSavedRef = useRef(false)

  // Persist progress to Supabase (debounced)
  const persistProgress = useCallback(
    async (force = false) => {
      const audio = audioRef.current
      if (!audio || !user || !podcastId) return
      const now = Date.now()
      if (!force && now - lastSaveRef.current < SAVE_DEBOUNCE_MS) return
      lastSaveRef.current = now

      const position = audio.currentTime
      const duration = audio.duration || null
      const completed = duration ? position / duration >= COMPLETION_THRESHOLD : false

      await saveProgress(podcastId, {
        positionSeconds: position,
        durationSeconds: duration,
        playbackSpeed: audio.playbackRate,
        completed,
      })
    },
    [user, podcastId],
  )

  // Load saved progress on mount
  useEffect(() => {
    if (!user || !podcastId) return
    let cancelled = false

    async function loadProgress() {
      const progress = await getProgress(podcastId)
      if (!cancelled && progress) {
        setSavedProgress(progress)
        setPlaybackSpeed(progress.playback_speed || 1)
      }
    }
    loadProgress()

    return () => { cancelled = true }
  }, [user, podcastId])

  // Set audio position & speed once audio element is ready and progress is loaded
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !savedProgress) return

    function onLoadedMetadata() {
      if (savedProgress.position_seconds > 0 && !savedProgress.completed) {
        audio.currentTime = savedProgress.position_seconds
      }
      audio.playbackRate = savedProgress.playback_speed || 1
    }

    // If already loaded (e.g. cached), apply immediately
    if (audio.readyState >= 1) {
      onLoadedMetadata()
    } else {
      audio.addEventListener('loadedmetadata', onLoadedMetadata, { once: true })
    }

    return () => audio.removeEventListener('loadedmetadata', onLoadedMetadata)
  }, [savedProgress])

  // Auto-save every 10s while playing
  useEffect(() => {
    if (!isPlaying) return

    saveTimerRef.current = setInterval(() => {
      persistProgress(true)
    }, SAVE_DEBOUNCE_MS)

    return () => clearInterval(saveTimerRef.current)
  }, [isPlaying, persistProgress])

  // Save on pause
  function handlePause() {
    setIsPlaying(false)
    persistProgress(true)
  }

  function handlePlay() {
    setIsPlaying(true)
  }

  // Save on page visibility change (tab switch / close)
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        persistProgress(true)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [persistProgress])

  // Check completion on timeupdate — only persist once after crossing threshold
  function handleTimeUpdate() {
    const audio = audioRef.current
    if (!audio || !audio.duration) return
    if (audio.currentTime / audio.duration >= COMPLETION_THRESHOLD) {
      if (!completionSavedRef.current) {
        completionSavedRef.current = true
        persistProgress(true)
      }
    }
  }

  // Speed selector
  function cycleSpeed() {
    const audio = audioRef.current
    if (!audio) return
    const idx = PLAYBACK_SPEEDS.indexOf(playbackSpeed)
    const next = PLAYBACK_SPEEDS[(idx + 1) % PLAYBACK_SPEEDS.length]
    setPlaybackSpeed(next)
    audio.playbackRate = next
  }

  useEffect(() => {
    async function load() {
      if (!UUID_RE.test(podcastId) || (kbId && !UUID_RE.test(kbId))) {
        setLoading(false)
        return
      }
      try {
        const [{ data: pod }, trans, kbs, logs] = await Promise.all([
          supabase.from('podcasts').select('*').eq('id', podcastId).limit(1),
          getTranscript(podcastId),
          getPodcastKBs(podcastId),
          getProcessingLogs(podcastId),
        ])
        if (logs && logs.length > 0) {
          setProcessingStartedAt(logs[0].created_at)
          const lastLog = logs[logs.length - 1]
          if (['ready', 'error', 'cancelled'].includes(lastLog.step)) {
            setProcessingFinishedAt(lastLog.created_at)
          }
        }
        if (!pod?.[0]) {
          navigate(kbId ? `/kb/${kbId}` : '/')
          return
        }
        setPodcast(pod[0])
        setTranscript(trans)
        setLinkedKBs(kbs)
      } catch (err) {
        console.error(err)
        navigate(kbId ? `/kb/${kbId}` : '/')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [podcastId, kbId, navigate])

  useEffect(() => {
    if (!podcast) return
    const isActive = ['downloading', 'transcribing', 'processing'].includes(podcast.status)
    if (!isActive && !processing) return

    // Clear any existing interval to prevent stacking
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)

    pollIntervalRef.current = setInterval(async () => {
      try {
        const result = await getPodcastStatus(podcastId)
        if (result) {
          setPodcast((prev) => ({ ...prev, status: result.status, error_message: result.error_message, progress: result.progress }))
          if (result.status === 'ready' || result.status === 'error') {
            const [trans, logs] = await Promise.all([
              result.status === 'ready' ? getTranscript(podcastId) : Promise.resolve(null),
              getProcessingLogs(podcastId),
            ])
            if (trans) setTranscript(trans)
            if (logs && logs.length > 0) {
              setProcessingStartedAt(logs[0].created_at)
              setProcessingFinishedAt(logs[logs.length - 1].created_at)
            }
            setProcessing(false)
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
        }
      } catch {
        // keep polling
      }
    }, 2000)

    return () => {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [podcast?.status, processing, podcastId])

  function handleProcess() {
    if (processing) return
    if (!podcast.transcript_url) {
      setShowAudioConfirm(true)
      return
    }
    startProcessing()
  }

  async function startProcessing() {
    setShowAudioConfirm(false)
    setProcessing(true)
    setProcessingStartedAt(new Date().toISOString())
    setProcessingFinishedAt(null)
    setPodcast((prev) => ({ ...prev, status: 'downloading', error_message: null, progress: 0 }))
    addToast('Processing started', 'info')
    try {
      await processPodcast(podcastId)
    } catch (err) {
      console.error('Processing failed:', err)
      setProcessing(false)
    }
  }

  async function handleCancel() {
    try {
      await cancelProcessing(podcastId)
      setPodcast((prev) => ({ ...prev, status: 'pending', error_message: null }))
      setProcessing(false)
    } catch (err) {
      console.error('Cancel failed:', err)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full mute text-sm">Loading...</div>
  }
  if (!podcast) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <h1 className="serif text-2xl font-medium">Podcast not found</h1>
        <Link to="/" className="text-sm text-[var(--accent)]">Back to home</Link>
      </div>
    )
  }

  const isActive = ['downloading', 'transcribing', 'processing'].includes(podcast.status)
  const canProcess = podcast.status === 'pending' || podcast.status === 'error'

  const tabs = [
    { id: 'insights', label: 'Insights', icon: <Icons.Sparkle size={12} /> },
    { id: 'transcript', label: 'Transcript', icon: <Icons.Quote size={12} /> },
    { id: 'processing', label: 'Processing', icon: <Icons.Clock size={12} /> },
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 sm:px-8 py-6 pb-20 max-w-[820px] mx-auto">
        {/* Breadcrumb */}
        <Link
          to={kbId ? `/kb/${kbId}` : '/'}
          className="inline-flex items-center gap-1.5 text-[12px] mono mute mb-4 transition-colors hover:text-[var(--text)]"
        >
          <Icons.Back size={12} />
          {kbId ? 'Back to Knowledge Base' : 'All Podcasts'}
        </Link>

        {/* Header */}
        <div className="flex gap-[18px] mb-[22px]">
          {podcast.thumbnail_url ? (
            <img
              src={podcast.thumbnail_url}
              alt=""
              className="w-[88px] h-[88px] object-cover shrink-0 rounded-[var(--r-lg)]"
              onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
            />
          ) : (
            <div
              className="w-[88px] h-[88px] shrink-0 grid place-items-center mute bg-[var(--surface)] rounded-[var(--r-lg)]"
            >
              <Icons.Headphones size={32} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[11px] mono mute uppercase tracking-[0.1em] mb-1">
              {podcast.channel || 'Unknown'} · {formatDate(podcast.created_at)}
            </div>
            <h1 className="serif text-[28px] font-medium tracking-tight leading-tight m-0">
              {podcast.title || 'Untitled Podcast'}
            </h1>
            <div className="flex gap-3 mt-2.5 text-[11px] mono mute items-center flex-wrap">
              <StatusPip status={podcast.status} />
              <span>·</span>
              <span>{formatDuration(podcast.duration_seconds)}</span>
              {canProcess && (
                <>
                  <span>·</span>
                  {podcast.transcript_url ? (
                    <span className="flex items-center gap-1 text-[var(--accent)]">
                      <Icons.FileText size={11} />
                      RSS Transcript
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[color-mix(in_oklab,var(--text-dim),orange_40%)]">
                      <Icons.Mic size={11} />
                      Audio Only
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {canProcess && (
                <button
                  onClick={handleProcess}
                  disabled={processing}
                  className={`text-[13px] px-3.5 py-1.5 font-semibold transition-colors disabled:opacity-50 text-[var(--accent-fg)] rounded-[var(--r-md)] ${podcast.status === 'error' ? 'bg-[var(--error)]' : 'bg-[var(--accent)]'}`}
                >
                  {processing ? 'Starting...' : podcast.status === 'error' ? 'Retry' : 'Process'}
                </button>
              )}
              {isActive && (
                <button
                  onClick={handleCancel}
                  className="text-[13px] px-3.5 py-1.5 transition-colors bg-transparent border border-[var(--border)] rounded-[var(--r-md)] text-[var(--text-dim)]"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={() => setShowAddToKB(true)}
                className="text-[13px] px-3 py-1.5 transition-colors bg-transparent border border-[var(--border)] rounded-[var(--r-md)] text-[var(--text-dim)]"
              >
                + Add to KB
              </button>
              {podcast.url && (
                <a
                  href={podcast.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] mono transition-colors text-[var(--accent)]"
                >
                  {podcast.source === 'podcast_index' ? 'Open Episode →' : 'Open Source →'}
                </a>
              )}
            </div>

            {/* Audio processing confirmation */}
            {showAudioConfirm && (
              <div className="mt-3 p-3 bg-[color-mix(in_oklab,var(--surface),orange_8%)] border border-[color-mix(in_oklab,var(--border),orange_20%)] rounded-[var(--r-md)]">
                <p className="text-[12px] m-0 mb-2 text-[var(--text-dim)]">
                  No RSS transcript available. Processing will download audio and use Whisper transcription, which costs money.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={startProcessing}
                    className="text-[12px] px-3 py-1.5 font-medium bg-[var(--accent)] text-[var(--accent-fg)] rounded-[var(--r-sm)]"
                  >
                    Process Anyway
                  </button>
                  <button
                    onClick={() => setShowAudioConfirm(false)}
                    className="text-[12px] px-3 py-1.5 font-medium bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-sm)] text-[var(--text-dim)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Linked KBs */}
            {linkedKBs.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <span className="text-[11px] mute">In:</span>
                {linkedKBs.map((kb) => (
                  <Link key={kb.id} to={`/kb/${kb.id}`}>
                    <Tag variant="accent">{kb.name}</Tag>
                  </Link>
                ))}
              </div>
            )}

            {podcast.error_message && podcast.status === 'error' && (
              <p className="text-[12px] mt-2 text-[var(--error)]">
                {podcast.error_message}
              </p>
            )}
          </div>
        </div>

        {/* Processing progress */}
        {podcast.status !== 'ready' && (
          <div
            className="p-3 sm:p-4 mb-4 sm:mb-6 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)]"
          >
            <ProcessingProgress
              status={podcast.status}
              startedAt={processingStartedAt}
              finishedAt={processingFinishedAt}
              progress={podcast.progress}
            />
          </div>
        )}

        {/* Audio Player */}
        {podcast.enclosure_url && (
          <div className="p-3 sm:p-4 mb-4 sm:mb-6 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)]">
            {/* Resume indicator */}
            {user && savedProgress && savedProgress.position_seconds > 0 && !savedProgress.completed && (
              <div className="flex items-center gap-2 mb-3 text-[12px] mono text-[var(--accent)]">
                <Icons.Play size={10} />
                Resume from {formatTimestamp(savedProgress.position_seconds)}
              </div>
            )}
            {user && savedProgress?.completed && (
              <div className="flex items-center gap-2 mb-3 text-[12px] mono text-[var(--success, var(--accent))]">
                <Icons.Check size={10} />
                Completed
              </div>
            )}

            <div className="flex items-center gap-3">
              <audio
                ref={audioRef}
                src={podcast.enclosure_url}
                className="flex-1 h-8"
                controls
                preload="metadata"
                onPlay={handlePlay}
                onPause={handlePause}
                onTimeUpdate={handleTimeUpdate}
              />
              {user && (
                <button
                  onClick={cycleSpeed}
                  className="shrink-0 px-2.5 py-1 text-[12px] mono font-semibold transition-colors bg-[var(--bg-2)] border border-[var(--border)] rounded-[var(--r-md)] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--accent)]"
                  title="Playback speed"
                >
                  {playbackSpeed}x
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-[22px] border-b border-[var(--border)]">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] -mb-px transition-colors border-b-2 ${activeTab === t.id ? 'text-[var(--text)] border-[var(--accent)] font-medium' : 'text-[var(--text-mute)] border-transparent font-normal'}`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div key={activeTab} className="fade-in">
          {activeTab === 'insights' && (
            <InsightsPanel podcastId={podcastId} podcastTitle={podcast.title} podcast={podcast} />
          )}

          {activeTab === 'transcript' && (
            <TranscriptView transcript={transcript} highlightTime={timestampParam ? parseFloat(timestampParam) : null} audioRef={audioRef} />
          )}

          {activeTab === 'processing' && (
            <ProcessingLog podcastId={podcastId} status={podcast.status} />
          )}
        </div>
      </div>

      {showAddToKB && (
        <AddToKBModal
          podcastId={podcastId}
          existingKBIds={linkedKBs.map((kb) => kb.id)}
          onClose={() => setShowAddToKB(false)}
          onAdded={(kb) => setLinkedKBs((prev) => [...prev, kb])}
        />
      )}
    </div>
  )
}

function TranscriptView({ transcript, highlightTime, audioRef }) {
  const [, setSearchParams] = useSearchParams()
  const highlightRef = useRef(null)
  const hasScrolled = useRef(false)

  useEffect(() => {
    if (highlightTime != null && highlightRef.current && !hasScrolled.current) {
      hasScrolled.current = true
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }, [highlightTime])

  if (!transcript) {
    return (
      <div className="text-center py-12 mute">
        No transcript available. Process this podcast first.
      </div>
    )
  }

  function isHighlighted(seg) {
    if (highlightTime == null) return false
    const segEnd = seg.end ?? (seg.start + 60)
    return highlightTime >= seg.start && highlightTime < segEnd
  }

  return (
    <div
      className="p-4 sm:p-5 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-lg)]"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[11px] mono uppercase tracking-[0.08em] text-[var(--accent)]">
          Full Transcript
        </h3>
        {transcript.word_count && (
          <span className="text-[11px] mono mute">
            {transcript.word_count.toLocaleString()} words
          </span>
        )}
      </div>

      {transcript.segments && transcript.segments.length > 0 ? (
        <div className="flex flex-col gap-4">
          {transcript.segments.map((seg, i) => {
            const highlighted = isHighlighted(seg)
            return (
              <div
                key={i}
                ref={highlighted ? highlightRef : undefined}
                className={`grid gap-4 grid-cols-[70px_1fr] transition-colors rounded-sm ${
                  highlighted
                    ? 'bg-[var(--accent-faint)] border-l-2 border-[var(--accent)] pl-1 -ml-1'
                    : ''
                }`}
              >
                <button
                  onClick={() => {
                    if (audioRef?.current) {
                      audioRef.current.currentTime = seg.start
                      audioRef.current.play()
                    }
                    setSearchParams((prev) => { prev.set('t', String(Math.floor(seg.start))); return prev }, { replace: true })
                  }}
                  className="mono text-[11px] text-right pt-[3px] text-[var(--accent)] cursor-pointer bg-transparent border-none p-0 hover:underline"
                >
                  {formatTimestamp(seg.start)}
                </button>
                <p className="serif text-[16px] leading-relaxed tracking-tight m-0 dim">
                  {seg.sentences?.map((s) => s.text).join(' ') || seg.text || ''}
                </p>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm dim leading-relaxed whitespace-pre-wrap">
          {transcript.full_text}
        </p>
      )}
    </div>
  )
}
