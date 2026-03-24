import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { listKnowledgeBases, createKnowledgeBase, deleteKnowledgeBase } from '../services/knowledgeBases'
import CreateKBModal from '../components/CreateKBModal'
import { formatDate } from '../lib/utils'

export default function Home() {
  const [knowledgeBases, setKnowledgeBases] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState(null)

  async function load() {
    try {
      const data = await listKnowledgeBases()
      setKnowledgeBases(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleCreate(name, description) {
    const kb = await createKnowledgeBase(name, description)
    setKnowledgeBases((prev) => [kb, ...prev])
  }

  async function handleDelete(id) {
    if (!confirm('Delete this knowledge base and all its podcasts?')) return
    await deleteKnowledgeBase(id)
    setKnowledgeBases((prev) => prev.filter((kb) => kb.id !== id))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400 mb-2">Failed to load knowledge bases</p>
        <p className="text-sm text-gray-500">{error}</p>
        <p className="text-sm text-gray-500 mt-4">
          Make sure your <code className="bg-white/10 px-1.5 py-0.5 rounded text-xs">.env</code> file
          has valid Supabase credentials.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Knowledge Bases</h1>
          <p className="text-gray-400 mt-1">
            Organize podcasts by topic, then chat with the content.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + New
        </button>
      </div>

      {/* Grid */}
      {knowledgeBases.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-white/10 rounded-xl">
          <p className="text-4xl mb-3">🎧</p>
          <p className="text-gray-400 mb-1">No knowledge bases yet</p>
          <p className="text-sm text-gray-500">
            Create one to start adding podcasts.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors"
          >
            Create your first knowledge base
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {knowledgeBases.map((kb) => {
            const podcastCount = kb.podcasts?.[0]?.count ?? 0
            return (
              <Link
                key={kb.id}
                to={`/kb/${kb.id}`}
                className="block bg-white/5 border border-white/10 rounded-xl p-5 hover:border-purple-500/50 hover:bg-white/[0.07] transition-all group no-underline"
              >
                <div className="flex items-start justify-between">
                  <h2 className="text-lg font-semibold text-white group-hover:text-purple-300 transition-colors">
                    {kb.name}
                  </h2>
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleDelete(kb.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all p-1"
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
                {kb.description && (
                  <p className="text-sm text-gray-400 mt-1 line-clamp-2">
                    {kb.description}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
                  <span>{podcastCount} podcast{podcastCount !== 1 ? 's' : ''}</span>
                  <span>·</span>
                  <span>{formatDate(kb.created_at)}</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {showCreate && (
        <CreateKBModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  )
}
