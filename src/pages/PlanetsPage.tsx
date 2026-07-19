import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Pause, Play } from 'lucide-react'

// Same-origin path to the planetPositions Lambda (source: lambda/planet-positions/index.mjs),
// which serves ±6 months of daily heliocentric positions parsed from JPL Horizons.
// Ad blockers block direct fetches to *.lambda-url.on.aws, so the Lambda URL is never
// called from the browser: vite proxies this path in dev, an Amplify 200 rewrite in prod.
const PLANETS_API_URL = '/api/planets'

const DAY_MS = 86_400_000

const PLANETS = [
  { key: 'mercury', name: 'Mercury', color: '#a8a29e', au: 0.39, dot: 3 },
  { key: 'venus', name: 'Venus', color: '#fbbf24', au: 0.72, dot: 4.5 },
  { key: 'earth', name: 'Earth', color: '#38bdf8', au: 1.0, dot: 4.5 },
  { key: 'mars', name: 'Mars', color: '#f87171', au: 1.52, dot: 3.5 },
  { key: 'jupiter', name: 'Jupiter', color: '#fdba74', au: 5.2, dot: 8 },
  { key: 'saturn', name: 'Saturn', color: '#fde68a', au: 9.54, dot: 7 },
  { key: 'uranus', name: 'Uranus', color: '#7dd3fc', au: 19.19, dot: 5.5 },
  { key: 'neptune', name: 'Neptune', color: '#818cf8', au: 30.07, dot: 5.5 },
]

interface PlanetsPayload {
  generated: string
  startDate: string
  stepDays: number
  stale: boolean
  planets: Record<string, [number, number][]> // daily [x, y] in AU, heliocentric ecliptic
  moon?: [number, number][] // daily [x, y] in AU relative to Earth (geocentric)
}

interface PlanetPosition {
  distance: number // AU from the Sun
  longitude: number // heliocentric ecliptic longitude, degrees [0, 360)
}

async function fetchPositions(): Promise<PlanetsPayload> {
  const res = await fetch(PLANETS_API_URL)
  if (!res.ok) throw new Error('Failed to fetch planet positions')
  return res.json()
}

function positionAt(series: [number, number][], index: number): PlanetPosition {
  const [x, y] = series[Math.min(Math.max(index, 0), series.length - 1)]
  return {
    distance: Math.hypot(x, y),
    longitude: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360,
  }
}

// Largest group of planets within a windowDeg arc of ecliptic longitude.
function tightestCluster(longitudes: number[], windowDeg = 60) {
  const sorted = [...longitudes].sort((a, b) => a - b)
  const wrapped = [...sorted, ...sorted.map((l) => l + 360)]
  let best = { count: 1, spread: 0 }
  for (let i = 0; i < sorted.length; i++) {
    let j = i
    while (j + 1 < i + sorted.length && wrapped[j + 1] - wrapped[i] <= windowDeg) j++
    const count = j - i + 1
    if (count > best.count) best = { count, spread: Math.round(wrapped[j] - wrapped[i]) }
  }
  return best
}

const SIZE = 640
const CENTER = SIZE / 2
const MAX_R = 270
// Outermost orbit per view: Neptune for the full system, Mars for the inner planets
const VIEW_MAX_AU = { full: 30.07, inner: 1.52 } as const
type ViewMode = keyof typeof VIEW_MAX_AU

// Exaggerated Earth–Moon gap in px: to scale the Moon would sit inside Earth's dot
const MOON_ORBIT_PX = 20

// SVG y grows downward; negate so longitude increases counterclockwise (view from ecliptic north)
function polar(r: number, deg: number) {
  const theta = (deg * Math.PI) / 180
  return { x: CENTER + r * Math.cos(theta), y: CENTER - r * Math.sin(theta) }
}

const TICKS = Array.from({ length: 12 }, (_, i) => i * 30)

export default function PlanetsPage() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['planet-positions'],
    queryFn: fetchPositions,
    staleTime: Infinity,
  })

  const [view, setView] = useState<ViewMode>('full')
  const [selected, setSelected] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  // "Today" frozen at mount: Date.now() is impure during render, and a minutes-old value is fine here
  const [mountedAt] = useState(() => Date.now())

  const seriesLen = data?.planets.earth?.length ?? 0
  const todayIndex = data
    ? Math.min(
        Math.max(Math.round((mountedAt - Date.parse(data.startDate)) / DAY_MS / data.stepDays), 0),
        Math.max(seriesLen - 1, 0),
      )
    : 0
  const viewIndex = selected ?? todayIndex
  const viewDate = data ? new Date(Date.parse(data.startDate) + viewIndex * data.stepDays * DAY_MS) : null

  useEffect(() => {
    if (!playing || seriesLen === 0) return
    const msPerDay = 1000 / 20 // play speed: 20 days of motion per second
    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      const advance = Math.floor((now - last) / msPerDay)
      if (advance > 0) {
        last += advance * msPerDay
        setSelected((s) => ((s ?? todayIndex) + advance) % seriesLen)
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, seriesLen, todayIndex])

  const positions = new Map(
    data
      ? PLANETS.flatMap((p) => {
          const series = data.planets[p.key]
          return series?.length ? [[p.key, positionAt(series, viewIndex)] as const] : []
        })
      : [],
  )
  const cluster = positions.size ? tightestCluster([...positions.values()].map((p) => p.longitude)) : null

  const visiblePlanets = view === 'inner' ? PLANETS.filter((p) => p.au <= VIEW_MAX_AU.inner) : PLANETS
  const scale = (au: number) => Math.sqrt(au / VIEW_MAX_AU[view]) * MAX_R

  // Moon: true geocentric direction, exaggerated distance from Earth
  const earthPos = positions.get('earth')
  const moonVec = data?.moon?.[Math.min(viewIndex, (data.moon?.length ?? 1) - 1)]
  const moon =
    view === 'inner' && earthPos && moonVec
      ? (() => {
          const earthXY = polar(scale(earthPos.distance), earthPos.longitude)
          const dirDeg = ((Math.atan2(moonVec[1], moonVec[0]) * 180) / Math.PI + 360) % 360
          const rad = (dirDeg * Math.PI) / 180
          return {
            earthXY,
            x: earthXY.x + MOON_ORBIT_PX * Math.cos(rad),
            y: earthXY.y - MOON_ORBIT_PX * Math.sin(rad),
            distKm: Math.round(Math.hypot(moonVec[0], moonVec[1]) * 1.495978707e8),
            dirDeg,
          }
        })()
      : null

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold text-zinc-100">Planetary Orrery</h1>
        {data?.stale && (
          <span className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-1 rounded">
            Data may be delayed
          </span>
        )}
        {isError && (
          <span className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-1 rounded">
            Unable to fetch positions
          </span>
        )}
      </div>
      <p className="text-zinc-400 mb-6">
        Positions of the planets around the Sun, viewed from above the ecliptic — drag the timeline
        or press play to wind through ±6 months. Data from NASA JPL Horizons. Angles are exact;
        orbit distances are compressed to keep the inner planets visible. The 0° mark points to the
        vernal equinox (♈), the zero point of ecliptic longitude used in the table. The
        inner-planet view adds the Moon in its true direction from Earth, at an exaggerated
        distance for visibility.
      </p>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="flex gap-1 bg-zinc-950 border border-zinc-800 rounded-md p-0.5">
              {(['inner', 'full'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    view === v ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  {v === 'inner' ? 'Inner planets' : 'Full system'}
                </button>
              ))}
            </div>
            <button
              onClick={() => setPlaying((p) => !p)}
              disabled={!data}
              className="p-1.5 rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 transition-colors"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(seriesLen - 1, 0)}
              value={viewIndex}
              disabled={!data}
              onChange={(e) => {
                setPlaying(false)
                setSelected(Number(e.target.value))
              }}
              className="flex-1 min-w-32 accent-rose-500"
              aria-label="Date"
            />
            <span className="text-xs font-mono text-zinc-400 w-24 text-right">
              {viewDate
                ? viewDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—'}
            </span>
            <button
              onClick={() => {
                setPlaying(false)
                setSelected(null)
              }}
              className={`text-xs text-rose-400 hover:text-rose-300 transition-colors ${
                !data || viewIndex === todayIndex ? 'invisible' : ''
              }`}
            >
              Today
            </button>
          </div>
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-auto" role="img" aria-label="Solar system diagram">
            {TICKS.map((deg) => {
              const cardinal = deg % 90 === 0
              const inner = polar(cardinal ? 276 : 279, deg)
              const outer = polar(cardinal ? 290 : 287, deg)
              const label = polar(304, deg)
              return (
                <g key={`tick-${deg}`}>
                  <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={cardinal ? '#52525b' : '#3f3f46'} strokeWidth={1} />
                  {cardinal && (
                    <text x={label.x} y={label.y} fontSize={11} fill="#71717a" textAnchor="middle" dominantBaseline="central">
                      {deg === 0 ? '0° ♈' : `${deg}°`}
                    </text>
                  )}
                </g>
              )
            })}
            <line x1={CENTER} y1={CENTER} x2={CENTER + 276} y2={CENTER} stroke="#27272a" strokeWidth={1} strokeDasharray="3 5" />
            {visiblePlanets.map((p) => (
              <circle
                key={`orbit-${p.key}`}
                cx={CENTER}
                cy={CENTER}
                r={scale(p.au)}
                fill="none"
                stroke="#27272a"
                strokeWidth={1}
              />
            ))}
            <circle cx={CENTER} cy={CENTER} r={12} fill="#fbbf24" opacity={0.25} />
            <circle cx={CENTER} cy={CENTER} r={7} fill="#fbbf24" />
            {visiblePlanets.map((p) => {
              const pos = positions.get(p.key)
              if (!pos) return null
              const { x, y } = polar(scale(pos.distance), pos.longitude)
              return (
                <g key={p.key}>
                  <circle cx={x} cy={y} r={p.dot} fill={p.color}>
                    <title>{`${p.name} — ${pos.distance.toFixed(2)} AU, ${pos.longitude.toFixed(1)}°`}</title>
                  </circle>
                  <text x={x + p.dot + 4} y={y + 3} fontSize={11} fill="#a1a1aa">
                    {p.name}
                  </text>
                </g>
              )
            })}
            {moon && (
              <g>
                <circle cx={moon.earthXY.x} cy={moon.earthXY.y} r={MOON_ORBIT_PX} fill="none" stroke="#3f3f46" strokeWidth={1} strokeDasharray="2 3" />
                <circle cx={moon.x} cy={moon.y} r={2.5} fill="#d4d4d8">
                  <title>{`Moon — ${moon.distKm.toLocaleString()} km from Earth, ${moon.dirDeg.toFixed(1)}° (distance not to scale)`}</title>
                </circle>
                <text x={moon.x + 6} y={moon.y + 3} fontSize={9} fill="#71717a">
                  Moon
                </text>
              </g>
            )}
            {isPending && (
              <text x={CENTER} y={CENTER + 40} fontSize={13} fill="#71717a" textAnchor="middle">
                Loading positions…
              </text>
            )}
          </svg>
        </div>

        <div className="space-y-3">
          {cluster && cluster.count >= 3 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
              <p className="text-xs text-zinc-500 mb-1">Tightest grouping</p>
              <p className="text-sm text-zinc-100">
                {cluster.count} planets within <span className="font-mono">{cluster.spread}°</span>
              </p>
            </div>
          )}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-zinc-500 border-b border-zinc-800">
                  <th className="text-left font-normal px-4 py-2">Planet</th>
                  <th className="text-right font-normal px-4 py-2">Sun dist.</th>
                  <th className="text-right font-normal px-4 py-2">Longitude</th>
                </tr>
              </thead>
              <tbody>
                {PLANETS.map((p) => {
                  const pos = positions.get(p.key)
                  return (
                    <tr key={p.key} className="border-b border-zinc-800/50 last:border-0">
                      <td className="px-4 py-2 text-zinc-100">
                        <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: p.color }} />
                        {p.name}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-zinc-400">
                        {pos ? `${pos.distance.toFixed(2)} AU` : '—'}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-zinc-400">
                        {pos ? `${pos.longitude.toFixed(1)}°` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
