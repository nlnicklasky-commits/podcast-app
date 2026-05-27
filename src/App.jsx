import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import Home from './pages/Home'
import KnowledgeBase from './pages/KnowledgeBase'
import PodcastDetail from './pages/PodcastDetail'
import SearchPage from './pages/SearchPage'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsOfService from './pages/TermsOfService'

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/kb/:id" element={<KnowledgeBase />} />
            <Route path="/kb/:kbId/podcast/:podcastId" element={<PodcastDetail />} />
            <Route path="/podcast/:podcastId" element={<PodcastDetail />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
          </Routes>
        </Layout>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
