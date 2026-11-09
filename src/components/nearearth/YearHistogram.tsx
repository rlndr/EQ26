import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { yearCounts, type YearCount } from '../../lib/nearearth/markers'
import type { Fireball } from '../../lib/nearearth/parse'

interface Props {
  events: Fireball[]
  selectedYear: number | null
  onSelectYear: (year: number | null) => void
}

const AXIS_TICK = { fill: '#a1a1aa', fontSize: 11 }

export default function YearHistogram({ events, selectedYear, onSelectYear }: Props) {
  const data = useMemo(() => yearCounts(events), [events])

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="text-xs uppercase tracking-[0.15em] text-zinc-500">Fireballs per year</h3>
        {selectedYear !== null && (
          <button onClick={() => onSelectYear(null)} className="text-xs text-brass hover:underline">Show all years</button>
        )}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barCategoryGap={1}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis dataKey="year" tick={AXIS_TICK} axisLine={{ stroke: '#3f3f46' }} tickLine={false} minTickGap={28} />
          <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as YearCount | undefined
              if (!active || !row) return null
              return (
                <div className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-xs">
                  <div className="text-zinc-400">{row.year}</div>
                  <div className="text-zinc-100 font-mono">{row.count} fireball{row.count === 1 ? '' : 's'}</div>
                </div>
              )
            }}
          />
          <Bar dataKey="count" isAnimationActive={false}>
            {data.map((row) => (
              <Cell
                key={row.year}
                cursor="pointer"
                fill={selectedYear === row.year ? '#d8b553' : '#f97316'}
                fillOpacity={selectedYear === null || selectedYear === row.year ? 0.9 : 0.35}
                onClick={() => onSelectYear(selectedYear === row.year ? null : row.year)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-zinc-500 mt-2">Click a year to show only that year on the globe. The record is not complete and its early years are sparse, so this is not a trend.</p>
    </section>
  )
}
