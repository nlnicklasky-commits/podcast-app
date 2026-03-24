import { useState, useEffect } from 'react'
import { getInsights } from '../services/processing'

export default function InsightsPanel({ podcastId, podcastTitle }) {
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getInsights(podcastId)
      .then(setInsights)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [podcastId])

  if (loading) {
    return <div className="animate-pulse text-gray-400 py-8 text-center">Loading insights...</div>
  }

  if (!insights) {
    return (
      <div className="text-center py-8 text-gray-500">
        No insights generated yet. Process this podcast first.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      {insights.summary && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-purple-400 uppercase tracking-wide mb-2">
            Summary
          </h3>
          <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
            {insights.summary}
          </p>
        </div>
      )}

      {/* Topics */}
      {insights.topics?.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-purple-400 uppercase tracking-wide mb-3">
            Topics
          </h3>
          <div className="flex flex-wrap gap-2">
            {insights.topics.map((topic, i) => (
              <span
                key={i}
                className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-sm"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Key Points */}
      {insights.key_points?.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-purple-400 uppercase tracking-wide mb-3">
            Key Points
          </h3>
          <ul className="space-y-2">
            {insights.key_points.map((point, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-300">
                <span className="text-purple-400 flex-shrink-0">•</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Entities */}
      {insights.entities?.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-purple-400 uppercase tracking-wide mb-3">
            People, Companies & Concepts
          </h3>
          <div className="flex flex-wrap gap-2">
            {insights.entities.map((entity, i) => {
              const typeColors = {
                person: 'bg-blue-500/20 text-blue-300',
                company: 'bg-green-500/20 text-green-300',
                product: 'bg-orange-500/20 text-orange-300',
                concept: 'bg-yellow-500/20 text-yellow-300',
              }
              const colorClass = typeColors[entity.type] || 'bg-gray-500/20 text-gray-300'
              return (
                <span
                  key={i}
                  className={`px-3 py-1 rounded-full text-sm ${colorClass}`}
                  title={entity.type}
                >
                  {entity.name}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
