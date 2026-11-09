import { useMemo, useState } from 'react'
import { useWidth } from './useWidth'
import type { Flyby } from '../../lib/nearearth/parse'
import { auToLd, formatLength, formatSizeEstimate, GEOSTATIONARY_LD, SEARCH_LIMIT_LD, sizeFromH } from '../../lib/nearearth/scale'

const HEIGHT = 320
const MARGIN = { top: 14, right: 12, bottom: 26, left: 46 }
const LOG_LOW = Math.log10(0.07)
const LOG_HIGH = Math.log10(32)
const DAY = 86_400_000

const clampLog = (ld: number) => Math.min(LOG_HIGH, Math.max(LOG_LOW, Math.log10(Math.max(ld, 1e-4))))

const REFERENCES = [
  { ld: GEOSTATIONARY_LD, label: 'Geostationary satellites' },
  { ld: 1, label: 'The Moon' },
  { ld: SEARCH_LIMIT_LD, label: 'Search limit' },
]

const AXIS_LDS = [0.1, 1, 10]

function pointRadius(h: number | null) {
  if (h === null) return 3
  return Math.max(2.5, Math.min(9, 2.5 + 2.2 * Math.log10(sizeFromH(h).centralM / 5)))
}

const dayLabel = (t: number) => new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' })

interface Props {
  flybys: Flyby[]
  now: number
  selected: string | null
  onSelect: (flyby: Flyby) => void
}

export default function PassChart({ flybys, now, selected, onSelect }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hovered, setHovered] = useState<Flyby | null>(null)

  const domain = useMemo(() => {
    if (flybys.length === 0) return [now - 7 * DAY, now + 60 * DAY] as const
    return [Math.min(...flybys.map((f) => f.t)) - DAY, Math.max(...flybys.map((f) => f.t)) + DAY] as const
  }, [flybys, now])

  const innerW = Math.max(1, width - MARGIN.left - MARGIN.right)
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom
  const x = (t: number) => MARGIN.left + ((t - domain[0]) / (domain[1] - domain[0])) * innerW
  const y = (ld: number) => MARGIN.top + (1 - (clampLog(ld) - LOG_LOW) / (LOG_HIGH - LOG_LOW)) * innerH

  const ticks = useMemo(() => {
    const out: number[] = []
    const start = new Date(domain[0])
    start.setUTCHours(0, 0, 0, 0)
    const stepDays = width < 560 ? 21 : 10
    for (let t = start.getTime() + stepDays * DAY; t < domain[1]; t += stepDays * DAY) out.push(t)
    return out
  }, [domain, width])

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h3 className="text-xs uppercase tracking-[0.15em] text-zinc-500 mb-3">Close passes, last 7 days and next 60</h3>
      <div ref={ref} className="relative">
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label="Chart of asteroid close passes by date and distance. The same objects are listed in the table below.">
            {AXIS_LDS.map((ld) => (
              <g key={ld}>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(ld)} y2={y(ld)} stroke="#27272a" strokeDasharray="3 3" />
                <text x={MARGIN.left - 6} y={y(ld) + 4} textAnchor="end" fill="#a1a1aa" fontSize={11}>{ld} LD</text>
              </g>
            ))}
            {REFERENCES.map((r) => (
              <g key={r.label}>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(r.ld)} y2={y(r.ld)} stroke="#71717a" strokeWidth={1} />
                <text x={width - MARGIN.right - 4} y={y(r.ld) - 4} textAnchor="end" fill="#a1a1aa" fontSize={11}>{r.label}</text>
              </g>
            ))}
            {ticks.map((t) => (
              <text key={t} x={x(t)} y={HEIGHT - 8} textAnchor="middle" fill="#a1a1aa" fontSize={11}>{dayLabel(t)}</text>
            ))}
            <line x1={x(now)} x2={x(now)} y1={MARGIN.top} y2={MARGIN.top + innerH} stroke="#d8b553" strokeDasharray="3 3" />
            <text x={x(now) + 4} y={MARGIN.top + 10} fill="#d8b553" fontSize={11}>Today</text>

            {flybys.map((f) => {
              const cx = x(f.t)
              const cy = y(auToLd(f.distAu))
              const r = pointRadius(f.h)
              const isSelected = selected === f.des
              const past = f.t < now
              return (
                <g key={`${f.des}-${f.t}`} opacity={past && !isSelected ? 0.45 : 1}>
                  <line x1={cx} x2={cx} y1={y(auToLd(f.maxAu))} y2={y(auToLd(f.minAu))} stroke={isSelected ? '#d8b553' : '#38bdf8'} strokeOpacity={0.45} strokeWidth={1.2} />
                  <circle cx={cx} cy={cy} r={r} fill={isSelected ? '#d8b553' : '#38bdf8'} fillOpacity={0.85} />
                  {f.onRisk && <circle cx={cx} cy={cy} r={r + 2.5} fill="none" stroke="#f472b6" strokeWidth={1.3} />}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={Math.max(r + 3, 10)}
                    fill="transparent"
                    className="cursor-pointer"
                    onPointerEnter={() => setHovered(f)}
                    onPointerLeave={() => setHovered(null)}
                    onClick={() => onSelect(f)}
                  />
                </g>
              )
            })}
          </svg>
        )}
        {hovered && (
          <div
            className="absolute z-10 pointer-events-none bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-xs"
            style={{ left: Math.min(x(hovered.t) + 12, Math.max(0, width - 220)), top: Math.max(0, y(auToLd(hovered.distAu)) - 34) }}
          >
            <div className="text-zinc-100">{hovered.name}</div>
            <div className="text-zinc-400">{dayLabel(hovered.t)}, {auToLd(hovered.distAu).toFixed(1)} LD</div>
            <div className="text-zinc-400">{hovered.h !== null ? `~${formatLength(sizeFromH(hovered.h).centralM)}` : formatSizeEstimate(null)}</div>
          </div>
        )}
      </div>
      <p className="text-xs text-zinc-500 mt-2">Each bar is the range the object could pass within. Larger dots are larger objects. A rose ring means it is also on the risk list below.</p>
    </section>
  )
}
