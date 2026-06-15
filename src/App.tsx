import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import LandingPage from './pages/LandingPage'
import ProjectsPage from './pages/ProjectsPage'
import EQPage from './pages/EQPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<LandingPage />} />
        <Route path="projects">
          <Route index element={<ProjectsPage />} />
          <Route path="earthquakes" element={<EQPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
