import { useMemo, useState } from 'react'
import type { Flyby } from '../../lib/nearearth/parse'
import { auToLd, formatLength, sizeFromH } from '../../lib/nearearth/scale'

type Order = 'soonest' | 'closest'

const date = (t: number) => new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' })

interface Props {
  flybys: Flyby[]
  now: number
  selected: string | null
  onSelect: (flyby: Flyby) => void
}

export default function FlybyTable({ flybys, now, selected, onSelect }: Props) {
  const [order, setOrder] = useState<Order>('soonest')
  const rows = useMemo(() => {
    const upcoming = flybys.filter((f) => f.t >= now)
    if (order === 'closest') return [...upcoming].sort((a, b) => a.distAu - b.distAu)
    return [...upcoming].sort((a, b) => a.t - b.t)
  }, [flybys, now, order])

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-xs uppercase tracking-[0.15em] text-zinc-500">Upcoming passes</h3>
        <div className="flex gap-1">
          {(['soonest', 'closest'] as const).map((o) => (
            <button key={o} onClick={() => setOrder(o)} aria-pressed={order === o} className={`px-2 py-0.5 rounded border text-xs capitalize transition-colors ${order === o ? 'border-brass bg-brass/10 text-brass' : 'border-zinc-700 text-zinc-400 hover:text-brass'}`}>{o}</button>
          ))}
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-zinc-900">
            <tr className="text-left text-xs text-zinc-500">
              <th className="font-normal pb-1">Object</th>
              <th className="font-normal pb-1">Date</th>
              <th className="font-normal pb-1 text-right">Distance</th>
              <th className="font-normal pb-1 text-right hidden sm:table-cell">Size</th>
              <th className="font-normal pb-1 text-right hidden sm:table-cell">Speed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr
                key={`${f.des}-${f.t}`}
                onClick={() => onSelect(f)}
                className={`border-t border-zinc-800/70 cursor-pointer transition-colors ${selected === f.des ? 'bg-brass/10' : 'hover:bg-zinc-800/60'}`}
              >
                <td className="py-1.5">
                  <button onClick={(ev) => { ev.stopPropagation(); onSelect(f) }} className={selected === f.des ? 'text-brass' : 'text-zinc-200'}>{f.name}</button>
                  {f.onRisk && <span className="ml-2 text-[10px] uppercase tracking-wide text-rose-400">risk list</span>}
                </td>
                <td className="py-1.5 text-zinc-400">{date(f.t)}</td>
                <td className="py-1.5 text-right font-mono text-sky-400">{auToLd(f.distAu).toFixed(1)} LD</td>
                <td className="py-1.5 text-right font-mono text-zinc-400 hidden sm:table-cell">{f.h !== null ? `~${formatLength(sizeFromH(f.h).centralM)}` : '—'}</td>
                <td className="py-1.5 text-right font-mono text-zinc-400 hidden sm:table-cell">{f.speedKms !== null ? `${f.speedKms.toFixed(1)} km/s` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500 mt-2">LD is one lunar distance, about 384,400 km. Sizes are estimated from brightness.</p>
    </section>
  )
}
