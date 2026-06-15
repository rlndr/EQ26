import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import heroImage from '../assets/hero.png'

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="relative min-h-[calc(100vh-57px)] flex flex-col items-center justify-center text-center px-4 overflow-hidden">
      {/* Hero background */}
      <div className="absolute inset-0 z-0">
        <img
          src={heroImage}
          alt=""
          className="w-full h-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/40 to-zinc-950" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 max-w-2xl">
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight">
          <span className="text-zinc-100">land</span><span className="text-rose-500">3</span><span className="text-zinc-100">r.net</span>
        </h1>

        <p className="text-zinc-400 text-base sm:text-lg leading-relaxed max-w-xl">
          A personal corner of the internet. Tools, experiments, and projects built for curiosity.
        </p>

        <button
          onClick={() => navigate('/projects')}
          className="mt-2 flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold px-6 py-3 rounded-lg transition-colors text-sm sm:text-base"
        >
          View Projects
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  )
}
