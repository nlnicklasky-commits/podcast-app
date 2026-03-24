import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getInsights, getTranscript } from '../services/processing'
import InsightsPanel from '../components/InsightsPanel'
import { formatDate, statusColors } from '../lib/utils'

export default function PodcastDetail() {
  const { kbId, podcastId } = useParams()
  const navigate = useNavigate()
  const [podcast, setPodcast] = useState(null)
  const [transcript, setTranscript] = useState(null)
  const [activeTab, setActiveTab] = useState('insights')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [{ data: pod }, trans] = await Promise.all([
          supabase.from('podcasts').select('*').eq('id', podcastId).limit(1),
          getTranscript(podcastId),
        ])
        if (!pod?.[0]) {
          navigate(`/kb/${kbId}`)
          return
        }
        setPodcast(pod[0])
        setTranscript(trans)
      } catch (err) {
        console.error(err)
        navigate(`/kb/${kbId}`)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [podcastId, kbId, navigate])

  if (loading) {
    return <div className="animate-pulse text-gray-400 py-20 text-center">Loading...</div>
  }

  if (!podcast) return null

  const statusClass = statusColors[podcast.status] || statusColors.pending
  const tabs = [
    { id: 'insights', label: 'Insights' },
    { id: 'transcript', label: 'Transcript' },
  ]

  function formatTimestamp(seconds) {
    if (!seconds) return '0:00'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div>
      {/* Breadcrumb */}
      <Link
        to={`/kb/${kbId}`}
        className="text-sm text-gray-400 hover:text-white transition-colors mb-4 inline-block"
      >
        ← Back to Knowledge Base
      </Link>

      {/* Header */}
      <div className="flex gap-4 mb-6">
        {podcast.thumbnail_url ? (
          <img
            src={podcast.thumbnail_url}
            alt=""
            className="w-48 h-28 object-cover rounded-xl flex-shrink-0"
          />
        ) : (
          <div className="w-48 h-28 bg-white/5 rounded-xl flex-shrink-0 flex items-center justify-center text-4xl">
            🎙️
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-white">
            {podcast.title || 'Untitled Podcast'}
          </h1>
          {podcast.channel && (
            <p className="text-gray-400 mt-1">{podcast.channel}</p>
          )}
          <div className="flex items-center gap-3 mt-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass}`}>
              {podcast.status}
            </span>
            <span className="text-xs text-gray-500">{formatDate(podcast.created_at)}</span>
          </div>
          <a
            href={podcast.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-purple-400 hover:text-purple-300 mt-2 inline-block"
          >
            Open on YouTube →
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'text-purple-400 border-purple-400'
                : 'text-gray-400 border-transparent hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'insights' && (
        <InsightsPanel podcastId={podcastId} podcastTitle={podcast.title} />
      )}

      {activeTab === 'transcript' && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          {transcript ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-purple-400 uppercase tracking-wide">
                  Full Transcript
                </h3>
                <span className="text-xs text-gray-500">
                  {transcript.word_count?.toLocaleString()} words
                </span>
              </div>
              {transcript.segments && transcript.segments.length > 0 ? (
                <div className="space-y-3">
                  {transcript.segments.map((seg, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="text-xs text-purple-400 font-mono flex-shrink-0 pt-0.5 w-14 text-right">
                        {formatTimestamp(seg.start)}
                      </span>
                      <p className="text-sm text-gray-300 leading-relaxed">
                        {seg.sentences?.map((s) => s.text).join(' ') || seg.text || ''}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {transcript.full_text}
                </p>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">
              No transcript available. Process this podcast first.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
