import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getInsights, getTranscript, processPodcast, getPodcastStatus, cancelProcessing, getProcessingLogs } from '../services/processing'
import { getPodcastKBs } from '../services/podcasts'
import InsightsPanel from '../components/InsightsPanel'
import AddToKBModal from '../components/AddToKBModal'
import ProcessingProgress from '../components/ProcessingProgress'
import ProcessingLog from '../components/ProcessingLog'
import { StatusPip, Tag } from '../components/ui'
import * as Icons from '../components/Icons'
import { formatDate, formatDuration, formatTimestamp } from '../lib/utils'

export default function PodcastDetail() {
  const { kbId, podcastId } = useParams()
  const navigate = useNavigate()
  const [podcast, setPodcast] = useState(null)
  const [transcript, setTranscript] = useState(null)
  const [linkedKBs, setLinkedKBs] = useState([])
  const [activeTab, setActiveTab] = useState('insights')
  const [loading, setLoading] = useState(true)
  const [showAddToKB, setShowAddToKB] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processingStartedAt, setProcessingStartedAt] = useState(null)
  const [processingFinishedAt, setProcessingFinishedAt] = useState(null)

  useEffect(() => {
    async function load() {
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

    const poll = setInterval(async () => {
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
            clearInterval(poll)
          }
        }
      } catch {
        // keep polling
      }
    }, 2000)

    return () => clearInterval(poll)
  }, [podcast?.status, processing, podcastId])

  async function handleProcess() {
    if (processing) return
    setProcessing(true)
    setProcessingStartedAt(new Date().toISOString())
    setProcessingFinishedAt(null)
    setPodcast((prev) => ({ ...prev, status: 'downloading', error_message: null, progress: 0 }))
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
  if (!podcast) return null

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
              className="w-[88px] h-[88px] object-cover shrink-0"
              style={{ borderRadius: 'var(--r-lg)' }}
            />
          ) : (
            <div
              className="w-[88px] h-[88px] shrink-0 grid place-items-center mute"
              style={{ background: 'var(--surface)', borderRadius: 'var(--r-lg)' }}
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
            <div className="flex gap-3 mt-2.5 text-[11px] mono mute items-center">
              <StatusPip status={podcast.status} />
              <span>·</span>
              <span>{formatDuration(podcast.duration_seconds)}</span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {canProcess && (
                <button
                  onClick={handleProcess}
                  disabled={processing}
                  className="text-[13px] px-3.5 py-1.5 font-semibold transition-colors disabled:opacity-50"
                  style={{
                    background: podcast.status === 'error' ? 'var(--error)' : 'var(--accent)',
                    color: 'var(--accent-fg)',
                    borderRadius: 'var(--r-md)',
                  }}
                >
                  {processing ? 'Starting...' : podcast.status === 'error' ? 'Retry' : 'Process'}
                </button>
              )}
              {isActive && (
                <button
                  onClick={handleCancel}
                  className="text-[13px] px-3.5 py-1.5 transition-colors"
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-md)',
                    color: 'var(--text-dim)',
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                onClick={() => setShowAddToKB(true)}
                className="text-[13px] px-3 py-1.5 transition-colors"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  color: 'var(--text-dim)',
                }}
              >
                + Add to KB
              </button>
              {podcast.url && (
                <a
                  href={podcast.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] mono transition-colors"
                  style={{ color: 'var(--accent)' }}
                >
                  {podcast.source === 'podcast_index' ? 'Open Episode →' : 'Open Source →'}
                </a>
              )}
            </div>

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
              <p className="text-[12px] mt-2" style={{ color: 'var(--error)' }}>
                {podcast.error_message}
              </p>
            )}
          </div>
        </div>

        {/* Processing progress */}
        <div
          className="p-3 sm:p-4 mb-4 sm:mb-6"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
          }}
        >
          <ProcessingProgress
            status={podcast.status}
            startedAt={processingStartedAt}
            finishedAt={processingFinishedAt}
            progress={podcast.progress}
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-[22px]" style={{ borderBottom: '1px solid var(--border)' }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] -mb-px transition-colors"
              style={{
                color: activeTab === t.id ? 'var(--text)' : 'var(--text-mute)',
                borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                fontWeight: activeTab === t.id ? 500 : 400,
              }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'insights' && (
          <InsightsPanel podcastId={podcastId} podcastTitle={podcast.title} />
        )}

        {activeTab === 'transcript' && (
          <TranscriptView transcript={transcript} />
        )}

        {activeTab === 'processing' && (
          <ProcessingLog podcastId={podcastId} status={podcast.status} />
        )}
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

function TranscriptView({ transcript }) {
  if (!transcript) {
    return (
      <div className="text-center py-12 mute">
        No transcript available. Process this podcast first.
      </div>
    )
  }

  return (
    <div
      className="p-4 sm:p-5"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[11px] mono uppercase tracking-[0.08em]" style={{ color: 'var(--accent)' }}>
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
          {transcript.segments.map((seg, i) => (
            <div
              key={i}
              className="grid gap-4"
              style={{ gridTemplateColumns: '70px 1fr' }}
            >
              <span
                className="mono text-[11px] text-right pt-[3px]"
                style={{ color: 'var(--accent)' }}
              >
                {formatTimestamp(seg.start)}
              </span>
              <p className="serif text-[16px] leading-relaxed tracking-tight m-0 dim">
                {seg.sentences?.map((s) => s.text).join(' ') || seg.text || ''}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm dim leading-relaxed whitespace-pre-wrap">
          {transcript.full_text}
        </p>
      )}
    </div>
  )
}
