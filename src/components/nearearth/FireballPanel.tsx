import { useMemo } from 'react'
import { formatLatLon } from '../../lib/aurora/format'
import { comparedToHiroshima, formatEnergy } from '../../lib/nearearth/energy'
import type { Fireball } from '../../lib/nearearth/parse'

const LARGEST = 8

const fullDate = (t: number) =>
  new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

const utcTime = (t: number) =>
  `${new Date(t).toISOString().slice(11, 16)} UTC`

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="font-mono text-sm text-zinc-100">{value}</p>
    </div>
  )
}

interface Props {
  events: Fireball[]
  selected: Fireball | null
  onSelect: (event: Fireball) => void
}

export default function FireballPanel({ events, selected, onSelect }: Props) {
  const largest = useMemo(() => [...events].sort((a, b) => b.kt - a.kt).slice(0, LARGEST), [events])
  const missing = useMemo(() => events.filter((e) => e.lat === null).length, [events])

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h3 className="text-xs uppercase tracking-[0.15em] text-zinc-500 mb-3">{selected ? 'Selected fireball' : 'Fireballs'}</h3>

      {selected ? (
        <div className="mb-4">
          <p className="text-lg text-zinc-100">{fullDate(selected.t)} <span className="text-sm text-zinc-500 font-mono">{utcTime(selected.t)}</span></p>
          <p className="text-2xl font-semibold text-orange-400 mt-1">{formatEnergy(selected.kt)}</p>
          <p className="text-sm text-zinc-400 mb-3">{comparedToHiroshima(selected.kt)}</p>
          <div className="grid grid-cols-3 gap-2">
            <Fact label="Location" value={selected.lat !== null && selected.lon !== null ? formatLatLon(selected.lat, selected.lon) : 'Not recorded'} />
            <Fact label="Altitude" value={selected.altKm !== null ? `${selected.altKm} km` : 'Not recorded'} />
            <Fact label="Speed" value={selected.speedKms !== null ? `${selected.speedKms} km/s` : 'Not recorded'} />
          </div>
        </div>
      ) : (
        <p className="text-sm text-zinc-400 mb-4">Click a fireball on the globe, or pick one of the largest below.</p>
      )}

      <h4 className="text-xs text-zinc-500 mb-1">Largest on record</h4>
      <ul className="divide-y divide-zinc-800/70">
        {largest.map((event) => (
          <li key={event.t}>
            <button
              onClick={() => onSelect(event)}
              aria-pressed={selected?.t === event.t}
              className={`w-full flex items-baseline justify-between gap-3 py-1.5 px-1 text-sm rounded transition-colors ${selected?.t === event.t ? 'bg-brass/10 text-brass' : 'text-zinc-300 hover:bg-zinc-800/60'}`}
            >
              <span>{fullDate(event.t)}</span>
              <span className="font-mono text-orange-400">{formatEnergy(event.kt)}</span>
            </button>
          </li>
        ))}
      </ul>
      {missing > 0 && <p className="text-xs text-zinc-500 mt-3">{missing} of {events.length.toLocaleString()} fireballs have no recorded location, so they are counted here but not drawn on the globe.</p>}
    </section>
  )
}
