import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import Home from './pages/Home'
import KnowledgeBase from './pages/KnowledgeBase'
import PodcastDetail from './pages/PodcastDetail'
import SearchPage from './pages/SearchPage'

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
          </Routes>
        </Layout>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
