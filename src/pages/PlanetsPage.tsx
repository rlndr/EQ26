import { useQuery } from '@tanstack/react-query'

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
// Compressed radial scale: sqrt keeps the inner planets legible while angles stay exact.
const scaleAu = (au: number) => (Math.sqrt(au) / Math.sqrt(30.07)) * MAX_R

// SVG y grows downward; negate so longitude increases counterclockwise (view from ecliptic north)
function polar(r: number, deg: number) {
  const theta = (deg * Math.PI) / 180
  return { x: CENTER + r * Math.cos(theta), y: CENTER - r * Math.sin(theta) }
}

function planetXY(distance: number, longitude: number) {
  return polar(scaleAu(distance), longitude)
}

const TICKS = Array.from({ length: 12 }, (_, i) => i * 30)

export default function PlanetsPage() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['planet-positions'],
    queryFn: fetchPositions,
    staleTime: Infinity,
  })

  const dayIndex = data ? Math.round((Date.now() - Date.parse(data.startDate)) / DAY_MS / data.stepDays) : 0
  const positions = new Map(
    data
      ? PLANETS.flatMap((p) => {
          const series = data.planets[p.key]
          return series?.length ? [[p.key, positionAt(series, dayIndex)] as const] : []
        })
      : [],
  )
  const cluster = positions.size ? tightestCluster([...positions.values()].map((p) => p.longitude)) : null

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
        Today's positions of the planets around the Sun, viewed from above the ecliptic. Data from
        NASA JPL Horizons. Angles are exact; orbit distances are compressed to keep the inner
        planets visible. The 0° mark points to the vernal equinox (♈), the zero point of ecliptic
        longitude used in the table.
      </p>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
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
            {PLANETS.map((p) => (
              <circle
                key={`orbit-${p.key}`}
                cx={CENTER}
                cy={CENTER}
                r={scaleAu(p.au)}
                fill="none"
                stroke="#27272a"
                strokeWidth={1}
              />
            ))}
            <circle cx={CENTER} cy={CENTER} r={12} fill="#fbbf24" opacity={0.25} />
            <circle cx={CENTER} cy={CENTER} r={7} fill="#fbbf24" />
            {PLANETS.map((p) => {
              const pos = positions.get(p.key)
              if (!pos) return null
              const { x, y } = planetXY(pos.distance, pos.longitude)
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
