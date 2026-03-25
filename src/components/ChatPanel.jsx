import { useState, useRef, useEffect } from 'react'
import { sendMessage, listConversations, getMessages } from '../services/chat'
import { formatDate } from '../lib/utils'

export default function ChatPanel({ knowledgeBaseId }) {
  const [conversations, setConversations] = useState([])
  const [activeConvId, setActiveConvId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showSidebar, setShowSidebar] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    listConversations(knowledgeBaseId).then(setConversations).catch(console.error)
  }, [knowledgeBaseId])

  useEffect(() => {
    if (activeConvId) {
      getMessages(activeConvId).then(setMessages).catch(console.error)
    }
  }, [activeConvId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e) {
    e.preventDefault()
    if (!input.trim() || loading) return

    const question = input.trim()
    setInput('')
    setError(null)

    // Optimistically add user message
    setMessages((prev) => [...prev, { role: 'user', content: question, id: 'temp-user' }])
    setLoading(true)

    try {
      const result = await sendMessage(knowledgeBaseId, question, activeConvId)

      // Update conversation ID
      if (!activeConvId && result.conversation_id) {
        setActiveConvId(result.conversation_id)
        setConversations((prev) => [
          { id: result.conversation_id, title: question.slice(0, 100), created_at: new Date().toISOString() },
          ...prev,
        ])
      }

      // Replace temp message and add assistant response
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== 'temp-user'),
        { role: 'user', content: question },
        { role: 'assistant', content: result.answer, sources: result.sources },
      ])
    } catch (err) {
      setError(err.message)
      setMessages((prev) => prev.filter((m) => m.id !== 'temp-user'))
    } finally {
      setLoading(false)
    }
  }

  function startNewConversation() {
    setActiveConvId(null)
    setMessages([])
    setShowSidebar(false)
  }

  function selectConversation(id) {
    setActiveConvId(id)
    setShowSidebar(false)
  }

  function formatTimestamp(seconds) {
    if (!seconds) return '0:00'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-16rem)] sm:h-[600px]">
      {/* Conversation sidebar — hidden on mobile, toggled via button */}
      <div className={`${showSidebar ? 'fixed inset-0 z-40 flex' : 'hidden'} sm:relative sm:flex sm:z-auto`}>
        {/* Backdrop on mobile */}
        {showSidebar && (
          <div
            className="fixed inset-0 bg-black/50 sm:hidden"
            onClick={() => setShowSidebar(false)}
          />
        )}
        <div className="relative z-10 w-64 sm:w-56 flex-shrink-0 border border-white/10 rounded-xl overflow-hidden flex flex-col bg-[#1a1a24] sm:bg-transparent">
          <div className="p-3 border-b border-white/10 flex items-center gap-2">
            <button
              onClick={startNewConversation}
              className="flex-1 px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
            >
              + New Chat
            </button>
            <button
              onClick={() => setShowSidebar(false)}
              className="sm:hidden p-1.5 text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                className={`w-full text-left px-3 py-2 text-sm border-b border-white/5 transition-colors ${
                  activeConvId === conv.id
                    ? 'bg-purple-600/20 text-purple-300'
                    : 'text-gray-400 hover:bg-white/5'
                }`}
              >
                <p className="truncate">{conv.title || 'Untitled'}</p>
                <p className="text-xs text-gray-500 mt-0.5">{formatDate(conv.created_at)}</p>
              </button>
            ))}
            {conversations.length === 0 && (
              <p className="text-xs text-gray-500 p-3">No conversations yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 border border-white/10 rounded-xl overflow-hidden flex flex-col min-w-0">
        {/* Mobile header with sidebar toggle */}
        <div className="flex items-center gap-2 p-2 border-b border-white/10 sm:hidden">
          <button
            onClick={() => setShowSidebar(true)}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
            title="Conversations"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm text-gray-400 flex-1 truncate">
            {activeConvId ? (conversations.find(c => c.id === activeConvId)?.title || 'Chat') : 'New Chat'}
          </span>
          <button
            onClick={startNewConversation}
            className="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
          >
            + New
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-8 sm:py-12">
              <p className="text-3xl mb-2">💬</p>
              <p className="text-gray-400">Ask a question about your podcasts</p>
              <p className="text-sm text-gray-500 mt-1">
                I'll search across all transcripts and cite my sources.
              </p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[90%] sm:max-w-[80%] rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 ${
                  msg.role === 'user'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/5 border border-white/10 text-gray-200'
                }`}
              >
                <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-white/10">
                    <p className="text-xs text-gray-400 mb-1.5">Sources:</p>
                    <div className="space-y-1">
                      {msg.sources.slice(0, 5).map((src, j) => (
                        <div
                          key={j}
                          className="text-xs text-gray-400 bg-white/5 rounded px-2 py-1"
                        >
                          <span className="text-purple-400">[{j + 1}]</span>{' '}
                          {src.podcast_title} at {formatTimestamp(src.start_time)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:0.1s]" />
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSend} className="p-2 sm:p-3 border-t border-white/10">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your podcasts..."
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors text-sm"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="px-3 sm:px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg transition-colors text-sm flex-shrink-0"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
