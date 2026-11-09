import { useEffect, useState } from 'react'
import { scrollToSection, type SectionId } from '../../lib/nearearth/sections'

interface Item {
  id: SectionId
  label: string
  count: number | null
  active: string
}

interface Props {
  fireballs: number | null
  flybys: number | null
  risk: number | null
}

/** Stays under the site header and shows which of the three sections is on screen */
export default function SectionNav({ fireballs, flybys, risk }: Props) {
  const [current, setCurrent] = useState<SectionId>('past')

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) setCurrent(entry.target.id as SectionId)
      }
    }, { rootMargin: '-40% 0px -55% 0px' })
    for (const id of ['past', 'now', 'future']) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [])

  const items: Item[] = [
    { id: 'past', label: 'Past', count: fireballs, active: 'border-orange-500 text-orange-400' },
    { id: 'now', label: 'Now', count: flybys, active: 'border-sky-400 text-sky-400' },
    { id: 'future', label: 'Future', count: risk, active: 'border-rose-400 text-rose-400' },
  ]

  return (
    <nav aria-label="Sections" className="sticky top-[57px] z-[5] bg-zinc-950/90 backdrop-blur-sm border-b border-zinc-800">
      <div className="max-w-6xl mx-auto px-4 flex gap-1">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => scrollToSection(item.id)}
            aria-current={current === item.id ? 'true' : undefined}
            className={`px-3 py-2.5 text-sm border-b-2 transition-colors ${current === item.id ? item.active : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
          >
            {item.label}
            {item.count !== null && <span className="ml-1.5 font-mono text-xs opacity-75">{item.count.toLocaleString()}</span>}
          </button>
        ))}
      </div>
    </nav>
  )
}
