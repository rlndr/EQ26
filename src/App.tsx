import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import LandingPage from './pages/LandingPage'
import ProjectsPage from './pages/ProjectsPage'
import EQPage from './pages/EQPage'
import BlogPage from './pages/BlogPage'
import BlogPostPage from './pages/BlogPostPage'
import ISSPage from './pages/ISSPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<LandingPage />} />
        <Route path="projects">
          <Route index element={<ProjectsPage />} />
          <Route path="earthquakes" element={<EQPage />} />
          <Route path="iss" element={<ISSPage />} />
        </Route>
        <Route path="blog">
          <Route index element={<BlogPage />} />
          <Route path=":slug" element={<BlogPostPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
