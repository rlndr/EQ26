import { Outlet, NavLink } from 'react-router-dom'

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/projects', label: 'Projects' },
  { to: '/blog', label: 'Blog' },
]

export default function Layout() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <NavLink to="/" className="hover:opacity-80 transition-opacity">
            <span className="text-lg font-bold tracking-tight">
              <span className="text-brass">LAND</span><span className="text-rose-500">3</span><span className="text-brass">R.net</span>
            </span>
          </NavLink>

          <nav className="flex items-center gap-1">
            {NAV.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brass/10 text-brass ring-1 ring-inset ring-brass-dark/40'
                      : 'text-zinc-400 hover:text-brass hover:bg-brass/5'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <div className="flex-1">
        <Outlet />
      </div>

      <footer className="border-t border-brass-dark/20 py-5">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-center gap-3 text-xs tracking-[0.2em] text-brass-dark/75">
          <span aria-hidden="true" className="h-px w-8 bg-brass-dark/30" />
          {/* One flex item, so gap-3 spaces only the rules and not the letters */}
          <span className="-mr-[0.2em]">LAND<span className="text-rose-500/80">3</span>R.net</span>
          <span aria-hidden="true" className="h-px w-8 bg-brass-dark/30" />
        </div>
      </footer>
    </div>
  )
}
