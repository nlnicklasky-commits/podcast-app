import { useState, useEffect } from 'react'
import { listKnowledgeBases } from '../services/knowledgeBases'
import { addPodcastToKB } from '../services/podcasts'

export default function AddToKBModal({ podcastId, existingKBIds = [], onClose, onAdded }) {
  const [knowledgeBases, setKnowledgeBases] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const kbs = await listKnowledgeBases()
        setKnowledgeBases(kbs)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleAdd(kb) {
    setAdding(kb.id)
    setError('')
    try {
      await addPodcastToKB(kb.id, podcastId)
      onAdded?.({ id: kb.id, name: kb.name })
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to add')
      setAdding(null)
    }
  }

  const availableKBs = knowledgeBases.filter(
    (kb) => !existingKBIds.includes(kb.id)
  )

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a24] border border-white/10 rounded-xl w-full max-w-md p-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          Add to Knowledge Base
        </h2>

        {loading ? (
          <div className="py-8 text-center">
            <div className="animate-pulse text-gray-400">Loading knowledge bases...</div>
          </div>
        ) : availableKBs.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-gray-400 mb-1">
              {knowledgeBases.length === 0
                ? 'No knowledge bases yet'
                : 'Already in all knowledge bases'}
            </p>
            <p className="text-sm text-gray-500">
              {knowledgeBases.length === 0
                ? 'Create a knowledge base first from the home page.'
                : 'This podcast is already linked to every knowledge base.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {availableKBs.map((kb) => (
              <button
                key={kb.id}
                onClick={() => handleAdd(kb)}
                disabled={adding === kb.id}
                className="w-full text-left bg-white/5 border border-white/10 rounded-lg p-3 hover:border-purple-500/50 hover:bg-white/[0.07] transition-all disabled:opacity-50"
              >
                <span className="text-white font-medium">{kb.name}</span>
                {kb.description && (
                  <span className="text-sm text-gray-500 block mt-0.5 truncate">
                    {kb.description}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="text-red-400 text-sm mt-3">{error}</p>
        )}

        <div className="flex justify-end pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
