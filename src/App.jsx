import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import KnowledgeBase from './pages/KnowledgeBase'
import PodcastDetail from './pages/PodcastDetail'

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/kb/:id" element={<KnowledgeBase />} />
          <Route path="/kb/:kbId/podcast/:podcastId" element={<PodcastDetail />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
