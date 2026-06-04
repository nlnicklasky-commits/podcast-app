import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import { useAuth } from './lib/useAuth'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import Home from './pages/Home'
import KnowledgeBase from './pages/KnowledgeBase'
import PodcastDetail from './pages/PodcastDetail'
import SearchPage from './pages/SearchPage'
import ProfilePage from './pages/ProfilePage'
import DiscoverPage from './pages/DiscoverPage'
import AuthPage from './pages/AuthPage'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsOfService from './pages/TermsOfService'

function AuthGate({ children }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--bg)]">
        <div className="mute text-sm">Loading...</div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/auth" replace />
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
        <ErrorBoundary>
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
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/search" element={<SearchPage />} />
                      <Route path="/discover" element={<DiscoverPage />} />
                      <Route path="/kb/:id" element={<KnowledgeBase />} />
                      <Route path="/kb/:kbId/podcast/:podcastId" element={<PodcastDetail />} />
                      <Route path="/podcast/:podcastId" element={<PodcastDetail />} />
                      <Route path="/profile" element={<ProfilePage />} />
                    </Routes>
                  </Layout>
                </AuthGate>
              }
            />
          </Routes>
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  )
}
