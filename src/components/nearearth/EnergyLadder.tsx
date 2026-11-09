import { useMemo } from 'react'
import { formatEnergy, LADDER, ladderFraction } from '../../lib/nearearth/energy'

export interface LadderItem {
  label: string
  kt: number
}

interface Row {
  id: string
  label: string
  kt: number
  note: string
  selected: boolean
}

export default function EnergyLadder({ item }: { item: LadderItem | null }) {
  const rows = useMemo<Row[]>(() => {
    const base = LADDER.map((r) => ({ ...r, selected: false }))
    if (item) base.push({ id: 'selected', label: item.label, kt: item.kt, note: 'Your selection', selected: true })
    return base.sort((a, b) => a.kt - b.kt)
  }, [item])

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h3 className="text-xs uppercase tracking-[0.15em] text-zinc-500 mb-3">Energy ladder</h3>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className={row.selected ? 'text-brass' : 'text-zinc-200'}>
                {row.label}<span className="text-xs text-zinc-500 ml-2">{row.note}</span>
              </span>
              <span className={`font-mono shrink-0 ${row.selected ? 'text-brass' : 'text-zinc-300'}`}>{formatEnergy(row.kt)}</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full mt-1 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.max(1, ladderFraction(row.kt) * 100)}%`, backgroundColor: row.selected ? '#d8b553' : '#f97316' }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-zinc-500 mt-3">A logarithmic scale: each small step along the bar is a huge jump in energy. Pick a fireball or an object on the risk list to add it here.</p>
    </section>
  )
}
