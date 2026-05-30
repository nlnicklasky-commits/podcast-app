import { useState, useRef, useEffect } from 'react'
import { sendMessage, listConversations, getMessages } from '../services/chat'
import { formatTimestamp } from '../lib/utils'
import * as Icons from './Icons'

export default function ChatPanel({ knowledgeBaseId, kbName = 'KB', podcastCount = 0 }) {
  const [conversations, setConversations] = useState([])
  const [activeConvId, setActiveConvId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const endRef = useRef(null)

  useEffect(() => {
    listConversations(knowledgeBaseId).then(setConversations).catch(console.error)
  }, [knowledgeBaseId])

  useEffect(() => {
    if (activeConvId) {
      getMessages(activeConvId).then(setMessages).catch(console.error)
    }
  }, [activeConvId])

  useEffect(() => {
    endRef.current?.scrollTo({ top: 999999, behavior: 'smooth' })
  }, [messages, loading])

  async function send(text) {
    if (!text.trim() || loading) return
    const question = text.trim()
    setInput('')
    setError(null)
    setMessages((prev) => [...prev, { role: 'user', content: question, id: 'temp-user' }])
    setLoading(true)

    try {
      const result = await sendMessage(knowledgeBaseId, question, activeConvId)
      if (!activeConvId && result.conversation_id) {
        setActiveConvId(result.conversation_id)
        setConversations((prev) => [
          { id: result.conversation_id, title: question.slice(0, 100), created_at: new Date().toISOString() },
          ...prev,
        ])
      }
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

  function startNew() {
    setActiveConvId(null)
    setMessages([])
  }

  const starters = [
    'What are the key takeaways?',
    'Compare different viewpoints',
    'Summarize the latest episodes',
    'Find quotes about a specific topic',
  ]

  return (
    <>
      {/* Header */}
      <div className="px-[18px] pt-4 pb-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 mb-1.5">
          <Icons.Sparkle size={14} className="text-[var(--accent)]" />
          <span className="text-[11px] mono mute uppercase tracking-[0.1em]">
            Ask {kbName}
          </span>
          <div className="ml-auto flex gap-1">
            <button onClick={startNew} title="New chat" className="mute p-1">
              <Icons.Plus size={14} />
            </button>
            <button title="History" className="mute p-1">
              <Icons.More size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={endRef} className="flex-1 overflow-y-auto px-[18px] py-4">
        {messages.length === 0 && !loading && (
          <div className="fade-in">
            <div className="text-[11px] mono mute uppercase tracking-[0.1em] mb-2.5">Try</div>
            <div className="flex flex-col gap-1.5">
              {starters.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left px-3 py-2.5 text-[13px] serif italic transition-colors min-h-[44px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-md)] text-[var(--text-dim)] hover:border-[color-mix(in_oklab,var(--accent),transparent_50%)] hover:text-[var(--text)]"
                >
                  &ldquo;{s}&rdquo;
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-[18px]">
          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}
          {loading && <ThinkingDots />}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-[18px] py-2 text-[12px] text-[var(--error)] bg-[color-mix(in_oklab,var(--error),transparent_90%)]">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="p-3.5 border-t border-[var(--border)]">
        <form
          onSubmit={(e) => { e.preventDefault(); send(input) }}
          className="flex items-end gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-md)] px-2.5 py-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
            }}
            placeholder="Ask about these podcasts..."
            rows={1}
            className="flex-1 bg-transparent border-none outline-none resize-none text-[13.5px] leading-relaxed max-h-[120px] text-[var(--text)]"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className={`w-[30px] h-[30px] rounded-[7px] grid place-items-center transition-colors shrink-0 ${
              input.trim()
                ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                : 'bg-[var(--surface-2)] text-[var(--text-mute)]'
            }`}
          >
            <Icons.Send size={14} />
          </button>
        </form>
        <div className="mt-1.5 text-[10px] mono mute flex justify-between">
          <span>↵ send · ⇧↵ newline</span>
          <span>scoped to KB</span>
        </div>
      </div>
    </>
  )
}

function MessageBubble({ msg }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[85%] px-3.5 py-2.5 text-[13.5px] leading-relaxed bg-[var(--accent-faint)] border border-[var(--accent-soft)] text-[var(--text)] rounded-[var(--r-md)]"
        >
          {msg.content}
        </div>
      </div>
    )
  }

  const parts = msg.content.split(/(\[\d+\]|\*\*[^*]+\*\*)/g)

  return (
    <div className="fade-in text-[14px] leading-[1.6] text-[var(--text)]">
      <div className="flex items-center gap-1.5 mb-2">
        <div
          className="w-[18px] h-[18px] rounded grid place-items-center bg-[var(--accent)]"
        >
          <Icons.Sparkle size={11} className="text-[var(--accent-fg)]" />
        </div>
        <span className="text-[11px] mono mute">PodBrain</span>
      </div>
      <div className="whitespace-pre-wrap">
        {parts.map((part, i) => {
          const bold = part.match(/^\*\*(.+)\*\*$/)
          if (bold) return <strong key={i} className="font-semibold">{bold[1]}</strong>

          const cit = part.match(/^\[(\d+)\]$/)
          if (cit) {
            const src = msg.sources?.find((s, idx) => idx + 1 === Number(cit[1]))
            return (
              <span
                key={i}
                className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-[5px] rounded text-[10px] mono mx-0.5 align-baseline bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-soft)]"
                title={src ? `${src.podcast_title} @ ${formatTimestamp(src.start_time)}` : ''}
              >
                {cit[1]}
              </span>
            )
          }
          return <span key={i}>{part}</span>
        })}
      </div>

      {msg.sources && msg.sources.length > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          {msg.sources.slice(0, 5).map((s, j) => (
            <div
              key={j}
              className="flex items-center gap-2 px-2.5 py-1.5 text-[11.5px] w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-sm)] text-[var(--text-dim)]"
            >
              <span className="mono text-[10px] text-[var(--accent)]">[{j + 1}]</span>
              <span className="flex-1 truncate">{s.podcast_title}</span>
              <span className="mono text-[10px] mute">{formatTimestamp(s.start_time)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ThinkingDots() {
  return (
    <div className="fade-in flex items-center gap-2 mute text-[12px] mono">
      <span className="inline-flex gap-[3px]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-[5px] h-[5px] rounded-full bg-[var(--accent)]"
            style={{
              animation: `pulse-dot 1.2s ease-in-out ${i * 0.18}s infinite`,
            }}
          />
        ))}
      </span>
      searching chunks...
    </div>
  )
}
