import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useData } from '../lib/DataContext'
import { useAudio, useAudioTime } from '../lib/AudioContext'
import * as Icons from './Icons'
import { KBGlyph } from './ui'
import CommandPalette from './CommandPalette'
import MiniPlayer from './MiniPlayer'

export default function Layout({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { knowledgeBases: kbs, podcasts, totalHours } = useData()
  const { track: activeTrack, togglePlay, seek } = useAudio()
  const { currentTime, duration } = useAudioTime()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Live playhead read inside the keydown handler via a ref so the listener
  // binds once and does not re-bind on every currentTime/duration tick.
  const timeRef = useRef({ currentTime, duration })
  useEffect(() => {
    timeRef.current = { currentTime, duration }
  }, [currentTime, duration])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- closes mobile sidebar on route change (reset-on-navigation); refactor tracked
    setSidebarOpen(false)
  }, [location.pathname])

  useEffect(() => {
    function isTyping() {
      const el = document.activeElement
      const tag = el?.tagName
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        el?.isContentEditable ||
        el?.getAttribute?.('contenteditable') === 'true' ||
        el?.getAttribute?.('role') === 'textbox'
      )
    }

    function onKey(e) {
      const { currentTime, duration } = timeRef.current
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      } else if (e.key === 'Escape' && paletteOpen) {
        setPaletteOpen(false)
      } else if (e.key === '/' && !e.metaKey && !e.ctrlKey && !isTyping()) {
        e.preventDefault()
        navigate('/search')
      } else if (e.key === ' ' && !isTyping() && activeTrack) {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'ArrowLeft' && !isTyping() && activeTrack) {
        e.preventDefault()
        seek(Math.max(0, currentTime - 5))
      } else if (e.key === 'ArrowRight' && !isTyping() && activeTrack) {
        e.preventDefault()
        seek(Math.min(duration, currentTime + 5))
      } else if ((e.key === 'j' || e.key === 'J') && !isTyping() && activeTrack) {
        seek(Math.max(0, currentTime - 15))
      } else if ((e.key === 'l' || e.key === 'L') && !isTyping() && activeTrack) {
        seek(Math.min(duration, currentTime + 30))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen, navigate, activeTrack, togglePlay, seek])

  const handlePaletteClose = useCallback((action) => {
    setPaletteOpen(false)
    if (action === 'add-podcast') {
      window.dispatchEvent(new CustomEvent('podbrain:add-podcast'))
    } else if (action === 'new-kb') {
      window.dispatchEvent(new CustomEvent('podbrain:new-kb'))
    }
  }, [])

  const currentKbId = location.pathname.startsWith('/kb/') ? location.pathname.split('/')[2] : null

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Skip to main content (visually hidden until focused) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-3 focus:left-3 focus:px-3 focus:py-2 focus:rounded-[var(--r-md)] focus:bg-[var(--accent)] focus:text-[var(--accent-fg)] focus:text-[13px] focus:font-medium focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        aria-label="Primary"
        className={`
          fixed md:relative z-40 md:z-auto
          w-[248px] shrink-0 flex flex-col gap-1.5
          transition-transform duration-200 ease-out md:translate-x-0
          border-r border-[var(--border)] bg-[var(--bg)] px-3 py-4 h-screen
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Wordmark */}
        <div className="flex items-center gap-2.5 px-2 pb-3.5 mb-1">
          <div
            className="w-7 h-7 rounded-lg grid place-items-center bg-[var(--accent)] text-[var(--accent-fg)] shadow-[0_0_24px_color-mix(in_oklab,var(--accent),transparent_60%)]"
          >
            <Icons.Wave size={16} strokeWidth={2} />
          </div>
          <div>
            <div className="font-semibold text-[15px] tracking-tight">PodBrain</div>
            <div className="text-[10px] mute mono tracking-[0.06em]">v0.4 · personal</div>
          </div>
          {/* Mobile close */}
          <button aria-label="Close navigation" className="ml-auto md:hidden mute p-1 min-w-[44px] min-h-[44px] flex items-center justify-center" onClick={() => setSidebarOpen(false)}>
            <Icons.X size={16} />
          </button>
        </div>

        {/* Search trigger */}
        <button
          onClick={() => setPaletteOpen(true)}
          className="flex items-center gap-2.5 px-2.5 py-2 mb-2 text-[13px] text-left bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-md)] text-[var(--text-mute)]"
        >
          <Icons.Search size={14} />
          <span className="flex-1">Search or ask...</span>
          <kbd
            className="text-[10px] mono px-[5px] py-0.5 rounded mute hidden sm:inline border border-[var(--border)]"
          >
            {typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl+K'}
          </kbd>
        </button>

        {/* Primary nav */}
        <NavItem
          icon={<Icons.Library size={15} />}
          label="Library"
          active={location.pathname === '/'}
          onClick={() => navigate('/')}
        />
        <NavItem
          icon={<Icons.Search size={15} />}
          label="Search"
          active={location.pathname === '/search'}
          onClick={() => navigate('/search')}
        />
        <NavItem
          icon={<Icons.Compass size={15} />}
          label="Discover"
          active={location.pathname === '/discover'}
          onClick={() => navigate('/discover')}
        />

        {/* KB section */}
        <div className="flex items-center justify-between px-2 pt-4 pb-1.5">
          <span className="text-[10px] mono mute uppercase tracking-[0.1em]">
            Knowledge Bases
          </span>
          <button
            aria-label="New knowledge base"
            onClick={() => window.dispatchEvent(new CustomEvent('podbrain:new-kb'))}
            title="New KB"
            className="mute p-0.5"
          >
            <Icons.Plus size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-0.5 flex-1 overflow-y-auto -mx-1 px-1">
          {kbs.map((kb) => {
            const isActive = currentKbId === kb.id
            return (
              <button
                key={kb.id}
                onClick={() => navigate(`/kb/${kb.id}`)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-2.5 py-[7px] px-2 text-left text-[13px] transition-colors rounded-[var(--r-md)] border min-h-[44px] md:min-h-0 hover:bg-[var(--surface)] ${
                  isActive
                    ? 'bg-[var(--surface)] border-[var(--border)] text-[var(--text)]'
                    : 'bg-transparent border-transparent text-[var(--text-dim)]'
                }`}
              >
                <KBGlyph name={kb.name} size={20} />
                <span className="flex-1 truncate">{kb.name}</span>
                <span className="text-[10px] mono mute">
                  {kb.knowledge_base_podcasts?.[0]?.count ?? 0} eps
                </span>
              </button>
            )
          })}
          {kbs.length === 0 && (
            <p className="text-[12px] mute px-2 py-4">No knowledge bases yet</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-2 pt-2.5 mt-2 border-t border-[var(--border-soft)] space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] mute mono">{totalHours.toFixed(1)} h indexed</span>
            <button aria-label="Profile settings" className="mute" title="Profile" onClick={() => navigate('/profile')}><Icons.Settings size={15} /></button>
          </div>
          <div className="flex items-center gap-2 text-[10px] mute">
            <a
              href="https://podcastindex.org"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--text-dim)] transition-colors"
            >
              Powered by Podcast Index
            </a>
          </div>
          <div className="flex items-center gap-2 text-[10px] mute">
            <Link to="/privacy" className="hover:text-[var(--text-dim)] transition-colors">Privacy</Link>
            <span>&middot;</span>
            <Link to="/terms" className="hover:text-[var(--text-dim)] transition-colors">Terms</Link>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main id="main-content" className="flex-1 min-w-0 relative flex flex-col overflow-hidden">
        {/* Mobile header */}
        <div
          className="flex md:hidden items-center gap-3 px-4 py-3 shrink-0 border-b border-[var(--border)] bg-[var(--bg)]"
        >
          <button aria-label="Open navigation" onClick={() => setSidebarOpen(true)} className="mute min-w-[44px] min-h-[44px] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-md grid place-items-center bg-[var(--accent)] text-[var(--accent-fg)]"
            >
              <Icons.Wave size={12} strokeWidth={2} />
            </div>
            <span className="font-semibold text-sm">PodBrain</span>
          </div>
          <button aria-label="Search" className="ml-auto mute min-w-[44px] min-h-[44px] flex items-center justify-center" onClick={() => setPaletteOpen(true)}>
            <Icons.Search size={18} />
          </button>
        </div>

        <div className={`flex-1 overflow-hidden ${activeTrack ? 'pb-[60px]' : ''}`}>
          {children}
        </div>
      </main>

      <MiniPlayer />

      <CommandPalette
        open={paletteOpen}
        onClose={handlePaletteClose}
        knowledgeBases={kbs}
        podcasts={podcasts}
      />
    </div>
  )
}

function NavItem({ icon, label, hint, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-2.5 py-[7px] md:py-[7px] min-h-[44px] md:min-h-0 px-2.5 text-[13px] text-left transition-colors rounded-[var(--r-md)] border hover:bg-[var(--surface)] ${
        active
          ? 'bg-[var(--surface)] border-[var(--border)] text-[var(--text)]'
          : 'bg-transparent border-transparent text-[var(--text-dim)]'
      }`}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {hint && <span className="text-[10px] mono mute">{hint}</span>}
      {count != null && <span className="text-[10px] mono mute">{count}</span>}
    </button>
  )
}
