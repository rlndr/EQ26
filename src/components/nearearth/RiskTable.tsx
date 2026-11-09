import { useMemo, useState } from 'react'
import type { RiskObject } from '../../lib/nearearth/parse'
import { formatLength, oddsInWords } from '../../lib/nearearth/scale'

type SortKey = 'palermo' | 'probability' | 'size' | 'year'

const PAGE_SIZE = 12

const VALUE: Record<SortKey, (o: RiskObject) => number> = {
  palermo: (o) => o.palermo ?? -Infinity,
  probability: (o) => o.probability ?? -Infinity,
  size: (o) => o.diameterKm ?? -Infinity,
  year: (o) => -(o.firstYear ?? Infinity),
}

const years = (o: RiskObject) => (o.firstYear === null ? '—' : o.firstYear === o.lastYear ? String(o.firstYear) : `${o.firstYear}–${o.lastYear}`)

interface Props {
  objects: RiskObject[]
  selected: string | null
  onSelect: (object: RiskObject) => void
}

export default function RiskTable({ objects, selected, onSelect }: Props) {
  const [sort, setSort] = useState<SortKey>('palermo')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matching = q ? objects.filter((o) => o.name.toLowerCase().includes(q) || o.des.toLowerCase().includes(q)) : objects
    return [...matching].sort((a, b) => VALUE[sort](b) - VALUE[sort](a))
  }, [objects, sort, query])

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const shown = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  const header = (key: SortKey, label: string, extra = '') => (
    <th className={`font-normal pb-1 ${extra}`} aria-sort={sort === key ? 'descending' : 'none'}>
      <button onClick={() => { setSort(key); setPage(0) }} className={sort === key ? 'text-brass' : 'hover:text-zinc-300'}>{label}</button>
    </th>
  )

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-xs uppercase tracking-[0.15em] text-zinc-500">Objects being watched</h3>
        <input
          value={query}
          onChange={(ev) => { setQuery(ev.target.value); setPage(0) }}
          placeholder="Search by name"
          aria-label="Search the risk list by name"
          className="w-44 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-brass"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500">
              <th className="font-normal pb-1">Object</th>
              {header('palermo', 'Palermo', 'text-right')}
              {header('probability', 'Odds', 'text-right')}
              {header('size', 'Size', 'text-right hidden sm:table-cell')}
              {header('year', 'Years', 'text-right hidden sm:table-cell')}
            </tr>
          </thead>
          <tbody>
            {shown.map((o) => (
              <tr key={o.des} onClick={() => onSelect(o)} className={`border-t border-zinc-800/70 cursor-pointer transition-colors ${selected === o.des ? 'bg-brass/10' : 'hover:bg-zinc-800/60'}`}>
                <td className="py-1.5">
                  <button onClick={(ev) => { ev.stopPropagation(); onSelect(o) }} className={`text-left ${selected === o.des ? 'text-brass' : 'text-zinc-200'}`}>{o.name}</button>
                </td>
                <td className="py-1.5 text-right font-mono text-rose-400">{o.palermo?.toFixed(2) ?? '—'}</td>
                <td className="py-1.5 text-right font-mono text-zinc-300 whitespace-nowrap">{oddsInWords(o.probability)}</td>
                <td className="py-1.5 text-right font-mono text-zinc-400 hidden sm:table-cell">{o.diameterKm !== null ? formatLength(o.diameterKm * 1000) : '—'}</td>
                <td className="py-1.5 text-right font-mono text-zinc-400 hidden sm:table-cell">{years(o)}</td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-zinc-500">No objects match that search.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2 mt-2 text-xs text-zinc-500">
        <span>{rows.length.toLocaleString()} object{rows.length === 1 ? '' : 's'}</span>
        <span className="flex items-center gap-2">
          <button disabled={current === 0} onClick={() => setPage(current - 1)} className="hover:text-brass disabled:opacity-40">Previous</button>
          <span className="font-mono">{current + 1} / {pages}</span>
          <button disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="hover:text-brass disabled:opacity-40">Next</button>
        </span>
      </div>
    </section>
  )
}
