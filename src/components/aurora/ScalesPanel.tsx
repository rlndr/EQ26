import { useQuery } from '@tanstack/react-query'
import { scalesQuery } from '../../lib/aurora/feeds'
import { G_COLORS } from '../../lib/aurora/format'
import type { ScaleDay } from '../../lib/aurora/parse'

const dayLabel = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function Tile({ letter, name, level, text }: { letter: string; name: string; level: number | null; text: string | null }) {
  const value = level ?? 0
  const color = G_COLORS[Math.min(5, value)]
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-3">
      <p className="text-xs text-zinc-500 mb-1">{name}</p>
      <p className="font-mono text-2xl font-semibold" style={{ color }}>{letter}{value}</p>
      <p className="text-xs text-zinc-400 capitalize mt-0.5">{text ?? 'none'}</p>
    </div>
  )
}

const percent = (p: number | null) => (p === null ? '—' : `${p}%`)

function OutlookRow({ day }: { day: ScaleDay }) {
  return (
    <tr className="border-t border-zinc-800/70">
      <td className="py-1.5 text-zinc-400">{dayLabel(day.date)}</td>
      <td className="py-1.5 font-mono" style={{ color: G_COLORS[Math.min(5, day.g ?? 0)] }}>G{day.g ?? 0}</td>
      <td className="py-1.5 font-mono text-zinc-300">{percent(day.rMinorProb)} / {percent(day.rMajorProb)}</td>
      <td className="py-1.5 font-mono text-zinc-300">{percent(day.sProb)}</td>
    </tr>
  )
}

export default function ScalesPanel() {
  const { data, isError } = useQuery(scalesQuery)

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h2 className="text-xs uppercase tracking-[0.15em] text-zinc-500 mb-3">NOAA space weather scales</h2>
      {isError && !data && <p className="text-sm text-rose-400">Could not load the scales from NOAA.</p>}
      {!data && !isError && <p className="text-sm text-zinc-500">Loading…</p>}
      {data && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Tile letter="G" name="Geomagnetic" level={data.today.g} text={data.today.gText} />
            <Tile letter="S" name="Radiation" level={data.today.s} text={data.today.sText} />
            <Tile letter="R" name="Radio" level={data.today.r} text={data.today.rText} />
          </div>
          <table className="w-full text-xs mt-4">
            <thead>
              <tr className="text-left text-zinc-500">
                <th className="font-normal pb-1">Outlook</th>
                <th className="font-normal pb-1">Storm</th>
                <th className="font-normal pb-1" title="Chance of R1–R2 and R3 or stronger radio blackouts">Radio R1–2 / R3+</th>
                <th className="font-normal pb-1" title="Chance of an S1 or stronger radiation storm">Radiation</th>
              </tr>
            </thead>
            <tbody>
              {data.outlook.map((day, i) => <OutlookRow key={`${day.date}-${i}`} day={day} />)}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
