import { useNavigate } from 'react-router-dom'
import { Activity, ArrowRight, BookOpen, Satellite } from 'lucide-react'

const projects = [
  {
    title: 'Earthquake Monitor',
    description: 'Explore M5.0+ seismic events worldwide. Monthly reports with magnitude breakdowns, regional summaries, and individual event data sourced from the USGS.',
    icon: Activity,
    accent: 'text-rose-500',
    href: '/projects/earthquakes',
  },
  {
    title: 'ISS Tracker',
    description: 'Live position of the International Space Station on a world map, updating every 5 seconds.',
    icon: Satellite,
    accent: 'text-rose-500',
    href: '/projects/iss',
  },
  {
    title: 'Blog',
    description: 'Thoughts, notes, and writing on things I find interesting.',
    icon: BookOpen,
    accent: 'text-rose-500',
    href: '/blog',
  },
]

export default function ProjectsPage() {
  const navigate = useNavigate()

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-zinc-100 mb-2">Projects</h1>
      <p className="text-zinc-400 mb-10">A collection of tools and experiments.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {projects.map((project) => {
          const Icon = project.icon
          return (
            <button
              key={project.href}
              onClick={() => navigate(project.href)}
              className="text-left p-5 rounded-xl border border-zinc-800 bg-zinc-900 hover:border-zinc-700 hover:bg-zinc-800/60 transition-colors group"
            >
              <div className="flex items-center gap-2 mb-3">
                <Icon size={18} className={project.accent} />
                <span className="font-semibold text-zinc-100 text-sm">{project.title}</span>
              </div>
              <p className="text-zinc-400 text-sm leading-relaxed mb-4">{project.description}</p>
              <span className="inline-flex items-center gap-1 text-xs text-zinc-500 group-hover:text-zinc-300 transition-colors">
                View project <ArrowRight size={12} />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
