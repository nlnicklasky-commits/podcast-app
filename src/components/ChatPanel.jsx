import { useState, useRef, useEffect, useCallback } from 'react'
import { sendMessage, listConversations, getMessages } from '../services/chat'
import { useAudio } from '../lib/AudioContext'
import { formatTimestamp } from '../lib/utils'
import * as Icons from './Icons'

function parseFollowUps(content) {
  const match = content.match(/FOLLOW_UPS:\s*(.+)$/m)
  if (!match) return { text: content, followUps: [] }
  const text = content.replace(/FOLLOW_UPS:\s*.+$/m, '').trim()
  const followUps = match[1].split('|').map(q => q.trim()).filter(Boolean)
  return { text, followUps }
}

let msgCounter = 0

export default function ChatPanel({ knowledgeBaseId, kbName = 'KB' }) {
  const { track } = useAudio()
  const [conversations, setConversations] = useState([])
  const [activeConvId, setActiveConvId] = useState(null)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [error, setError] = useState(null)
  const [convError, setConvError] = useState(null)
  const [followUps, setFollowUps] = useState([])
  const endRef = useRef(null)
  const menuRef = useRef(null)
  const switcherBtnRef = useRef(null)

  const loadConversations = useCallback(() => {
    setLoadingConversations(true)
    setConvError(null)
    listConversations(knowledgeBaseId)
      .then(setConversations)
      .catch((err) => setConvError(err.message || 'Failed to load conversations'))
      .finally(() => setLoadingConversations(false))
  }, [knowledgeBaseId])

  useEffect(() => { loadConversations() }, [loadConversations])

  useEffect(() => {
    if (!activeConvId) return
    let ignore = false
    getMessages(activeConvId)
      .then((data) => {
        if (ignore) return
        setMessages(data)
        setError(null)
      })
      .catch((err) => {
        if (ignore) return
        setError(err.message || 'Failed to load messages')
      })
    return () => { ignore = true }
  }, [activeConvId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (!showSwitcher) return
    const first = menuRef.current?.querySelector('[role="menuitem"]')
    first?.focus()
  }, [showSwitcher, loadingConversations, conversations])

  function closeSwitcher() {
    setShowSwitcher(false)
    switcherBtnRef.current?.focus()
  }

  function handleMenuKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeSwitcher()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]') || [])
    if (items.length === 0) return
    e.preventDefault()
    const current = items.indexOf(document.activeElement)
    const delta = e.key === 'ArrowDown' ? 1 : -1
    const next = (current + delta + items.length) % items.length
    items[next].focus()
  }

  async function send(text) {
    if (!text.trim() || loading) return
    const question = text.trim()
    setInput('')
    setFollowUps([])
    setError(null)
    const tempId = `temp-${++msgCounter}`
    setMessages((prev) => [...prev, { role: 'user', content: question, id: tempId }])
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
      const { text: parsedText, followUps: suggestions } = parseFollowUps(result.answer)
      setFollowUps(suggestions)
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        { role: 'user', content: question, id: `user-${++msgCounter}` },
        { role: 'assistant', content: parsedText, sources: result.sources, id: `asst-${++msgCounter}` },
      ])
    } catch (err) {
      setError(err.message)
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
    } finally {
      setLoading(false)
    }
  }

  function startNew() {
    setActiveConvId(null)
    setMessages([])
    setFollowUps([])
    setError(null)
    setShowSwitcher(false)
  }

  function selectConversation(id) {
    setShowSwitcher(false)
    if (id === activeConvId) return
    setActiveConvId(id)
    setMessages([])
    setFollowUps([])
    setError(null)
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
          <div className="relative ml-auto flex gap-1">
            <button
              ref={switcherBtnRef}
              onClick={() => setShowSwitcher((v) => !v)}
              title="Conversation history"
              aria-haspopup="menu"
              aria-expanded={showSwitcher}
              className="mute p-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <Icons.Chat size={14} />
            </button>
            <button onClick={startNew} title="New chat" className="mute p-1 min-w-[44px] min-h-[44px] flex items-center justify-center">
              <Icons.Plus size={14} />
            </button>

            {showSwitcher && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowSwitcher(false)}
                  aria-hidden="true"
                />
                <div
                  ref={menuRef}
                  role="menu"
                  aria-label="Conversations"
                  onKeyDown={handleMenuKeyDown}
                  className="absolute right-0 top-[46px] z-20 w-[260px] max-h-[320px] overflow-y-auto py-1 bg-[var(--bg-2)] border border-[var(--border)] rounded-[var(--r-md)] shadow-lg fade-in"
                >
                  <button
                    role="menuitem"
                    onClick={startNew}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left text-[12.5px] text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
                  >
                    <Icons.Plus size={13} className="text-[var(--accent)]" />
                    New chat
                  </button>

                  {loadingConversations && (
                    <div className="px-3 py-2 text-[11.5px] dim" role="status">
                      <span className="sr-only">Loading conversations</span>
                      Loading…
                    </div>
                  )}

                  {!loadingConversations && convError && (
                    <div className="px-3 py-2 text-[11.5px] text-[var(--error)]" role="alert">
                      {convError}
                    </div>
                  )}

                  {!loadingConversations && !convError && conversations.length === 0 && (
                    <div className="px-3 py-2 text-[11.5px] dim">No past conversations</div>
                  )}

                  {!loadingConversations && !convError && conversations.map((c) => (
                    <button
                      key={c.id}
                      role="menuitem"
                      onClick={() => selectConversation(c.id)}
                      aria-current={c.id === activeConvId ? 'true' : undefined}
                      className={`block w-full px-3 py-2 text-left text-[12.5px] truncate transition-colors hover:bg-[var(--surface)] ${
                        c.id === activeConvId
                          ? 'text-[var(--accent)] bg-[var(--surface)]'
                          : 'text-[var(--text-dim)]'
                      }`}
                    >
                      {c.title || 'Untitled conversation'}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className={`flex-1 overflow-y-auto px-[18px] py-4 ${track ? 'pb-[72px]' : ''}`}>
        {loadingConversations && messages.length === 0 && !convError && (
          <div className="space-y-3 animate-pulse" role="status">
            <span className="sr-only">Loading conversations</span>
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 bg-[var(--surface)] rounded-[var(--r-md)]" />
            ))}
          </div>
        )}

        {convError && messages.length === 0 && (
          <div className="text-center py-8 fade-in">
            <Icons.Chat size={24} className="mx-auto mb-2 mute" />
            <p className="text-[13px] dim mb-3">{convError}</p>
            <button
              onClick={loadConversations}
              className="px-3 py-1.5 text-[12px] mono bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-md)] hover:border-[var(--accent)] transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {messages.length === 0 && !loading && !loadingConversations && !convError && (
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
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
          {loading && <ThinkingDots />}
        </div>
        <div ref={endRef} />

        {followUps.length > 0 && !loading && (
          <div className="flex flex-wrap gap-1.5 mt-2 mb-3 px-[18px]">
            {followUps.map((q, i) => (
              <button
                key={i}
                onClick={() => send(q)}
                className="px-2.5 py-1.5 text-[11px] bg-[var(--surface)] border border-[var(--border)] rounded-full text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="px-[18px] py-2 text-[12px] text-[var(--error)] bg-[color-mix(in_oklab,var(--error),transparent_90%)]"
        >
          {error}
        </div>
      )}

      {/* Input */}
      <div className={`p-3.5 border-t border-[var(--border)] ${track ? 'pb-[calc(0.875rem+72px)]' : ''}`}>
        <form
          onSubmit={(e) => { e.preventDefault(); send(input) }}
          className="flex items-end gap-2 bg-[var(--surface)] border border-[var(--border)] focus-within:border-[var(--accent)] rounded-[var(--r-md)] px-2.5 py-2 transition-colors"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
            }}
            placeholder="Ask about these podcasts..."
            aria-label="Message"
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
    <div className="fade-in flex items-center gap-2 mute text-[12px] mono" role="status">
      <span className="sr-only">Searching your podcasts</span>
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
      Searching your podcasts...
    </div>
  )
}
