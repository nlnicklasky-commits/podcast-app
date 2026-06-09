import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { AuthProvider } from './lib/AuthContext'
import { ToastProvider } from './lib/ToastContext'
import { DataProvider } from './lib/DataContext'
import { AudioProvider } from './lib/AudioContext'
import { useAuth } from './lib/useAuth'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'

const Home = lazy(() => import('./pages/Home'))
const KnowledgeBase = lazy(() => import('./pages/KnowledgeBase'))
const PodcastDetail = lazy(() => import('./pages/PodcastDetail'))
const SearchPage = lazy(() => import('./pages/SearchPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const DiscoverPage = lazy(() => import('./pages/DiscoverPage'))
const AuthPage = lazy(() => import('./pages/AuthPage'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))
const TermsOfService = lazy(() => import('./pages/TermsOfService'))

function AuthGate({ children }) {
  const { loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--bg)]">
        <div className="mute text-sm">Loading...</div>
      </div>
    )
  }

  return children
}

function AuthRoute() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--bg)]">
        <div className="mute text-sm">Loading...</div>
      </div>
    )
  }

  if (session) {
    return <Navigate to="/" replace />
  }

  return <AuthPage />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
        <DataProvider>
        <AudioProvider>
        <ErrorBoundary>
          <Suspense fallback={<div className="flex items-center justify-center h-screen bg-[var(--bg)]"><div className="mute text-sm">Loading...</div></div>}>
            <Routes>
              {/* Public routes */}
              <Route path="/auth" element={<AuthRoute />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />

              {/* Protected routes */}
              <Route
                path="/*"
                element={
                  <AuthGate>
                    <Layout>
                      <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="mute text-sm">Loading...</div></div>}>
                        <Routes>
                          <Route path="/" element={<Home />} />
                          <Route path="/search" element={<SearchPage />} />
                          <Route path="/discover" element={<DiscoverPage />} />
                          <Route path="/kb/:id" element={<KnowledgeBase />} />
                          <Route path="/kb/:kbId/podcast/:podcastId" element={<PodcastDetail />} />
                          <Route path="/podcast/:podcastId" element={<PodcastDetail />} />
                          <Route path="/profile" element={<ProfilePage />} />
                          <Route path="*" element={
                            <div className="flex flex-col items-center justify-center h-full gap-3">
                              <h1 className="serif text-2xl font-medium">Page not found</h1>
                              <Link to="/" className="text-sm text-[var(--accent)]">Back to home</Link>
                            </div>
                          } />
                        </Routes>
                      </Suspense>
                    </Layout>
                  </AuthGate>
                }
              />
            </Routes>
          </Suspense>
        </ErrorBoundary>
        </AudioProvider>
        </DataProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
