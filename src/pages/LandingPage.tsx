import { useNavigate } from 'react-router-dom'
import DecoPortal from '../components/DecoPortal'

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="relative min-h-[calc(100vh-57px)] flex flex-col items-center justify-center text-center px-4 overflow-hidden">
      {/* Hero background */}
      <div className="absolute inset-0 z-0">
        <DecoPortal />
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/40 via-transparent to-zinc-950" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 max-w-2xl">
        {/* The name is drawn in the DecoPortal artwork, which is decorative; this carries it
            to screen readers and gives the page its heading */}
        <h1 className="sr-only">land3r.net</h1>

        <p className="text-zinc-400 text-base sm:text-lg leading-relaxed max-w-lg">
          A personal corner of the internet. Tools, experiments, and projects built for curiosity.
        </p>

        {/* Double-line rose plate, echoing the portal's banded arch */}
        <button
          onClick={() => navigate('/projects')}
          className="group mt-2 border border-rose-500/60 p-[3px] transition-colors hover:border-rose-400"
        >
          <span className="block border border-rose-500/50 px-8 py-2.5 text-sm sm:text-base font-medium uppercase tracking-[0.25em] indent-[0.25em] text-rose-400 transition-colors group-hover:border-rose-400 group-hover:bg-rose-500/15">
            Projects
          </span>
        </button>
      </div>
    </div>
  )
}
