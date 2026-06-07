import { useState, useEffect, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { listKnowledgeBases } from '../services/knowledgeBases'
import { listAllPodcasts } from '../services/podcasts'
import * as Icons from './Icons'
import { KBGlyph } from './ui'
import CommandPalette from './CommandPalette'

export default function Layout({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [kbs, setKbs] = useState([])
  const [podcasts, setPodcasts] = useState([])
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    listKnowledgeBases().then(setKbs).catch(console.error)
    listAllPodcasts().then(setPodcasts).catch(console.error)
  }, [])

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      } else if (e.key === 'Escape' && paletteOpen) {
        setPaletteOpen(false)
      } else if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        const tag = document.activeElement?.tagName
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !document.activeElement?.isContentEditable) {
          e.preventDefault()
          navigate('/search')
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen, navigate])

  const handlePaletteClose = useCallback((action) => {
    setPaletteOpen(false)
    if (action === 'add-podcast') {
      window.dispatchEvent(new CustomEvent('podbrain:add-podcast'))
    } else if (action === 'new-kb') {
      window.dispatchEvent(new CustomEvent('podbrain:new-kb'))
    }
  }, [])

  const refreshData = useCallback(() => {
    listKnowledgeBases().then(setKbs).catch(console.error)
    listAllPodcasts().then(setPodcasts).catch(console.error)
  }, [])

  useEffect(() => {
    window.addEventListener('podbrain:data-changed', refreshData)
    return () => window.removeEventListener('podbrain:data-changed', refreshData)
  }, [refreshData])

  const currentKbId = location.pathname.startsWith('/kb/') ? location.pathname.split('/')[2] : null

  const totalHours = podcasts.reduce((acc, p) => acc + (p.duration_seconds || 0), 0) / 3600

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
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
      <main className="flex-1 min-w-0 relative flex flex-col overflow-hidden">
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

        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </main>

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
