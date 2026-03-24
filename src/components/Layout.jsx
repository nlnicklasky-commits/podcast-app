import { Link, useLocation } from 'react-router-dom'

export default function Layout({ children }) {
  const location = useLocation()
  const isHome = location.pathname === '/'

  return (
    <div className="min-h-screen bg-[#0f0f13] text-gray-200">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0f0f13]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 no-underline">
            <span className="text-xl">🎙️</span>
            <span className="font-semibold text-white text-lg tracking-tight">
              PodBrain
            </span>
          </Link>
          {!isHome && (
            <Link
              to="/"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              ← All Knowledge Bases
            </Link>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
