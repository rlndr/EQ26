import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { kpForecastQuery, windHistoryQuery, xrayQuery } from '../../lib/aurora/feeds'
import { bucketSeries, G_COLORS, maxOf, mean, shortDayTime } from '../../lib/aurora/format'
import { flareClass, KP_BIN_MS, kpToG, type KpRow, type WindSample, type XrayPoint } from '../../lib/aurora/parse'

type Tab = 'kp' | 'wind' | 'xray'

const TABS: { id: Tab; label: string }[] = [
  { id: 'kp', label: 'Kp index' },
  { id: 'wind', label: 'Solar wind' },
  { id: 'xray', label: 'X-ray flux' },
]

const AXIS_TICK = { fill: '#a1a1aa', fontSize: 11 }
const FIVE_MINUTES = 5 * 60_000
const HISTORY_MS = 72 * 3600_000

const hourTick = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const dayTick = (t: number) =>
  new Date(t).toLocaleDateString([], { weekday: 'short', hour: '2-digit' })

function ChartTip({ active, label, lines }: { active?: boolean; label?: number; lines: string[] }) {
  if (!active || label === undefined) return null
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-xs">
      <div className="text-zinc-400 mb-0.5">{shortDayTime(label)}</div>
      {lines.map((l) => <div key={l} className="text-zinc-100 font-mono">{l}</div>)}
    </div>
  )
}

const Message = ({ children }: { children: string }) => (
  <p className="text-sm text-zinc-500 h-[260px] flex items-center justify-center text-center">{children}</p>
)

const KIND_OPACITY = { observed: 1, estimated: 0.75, predicted: 0.45 }

function KpTab({ now, previewT, onPreview }: { now: number; previewT: number | null; onPreview: (row: KpRow) => void }) {
  const { data, isError } = useQuery(kpForecastQuery)
  const rows = useMemo(() => data?.filter((r) => r.t + KP_BIN_MS >= now - HISTORY_MS) ?? [], [data, now])
  const current = rows.find((r) => now >= r.t && now < r.t + KP_BIN_MS)

  if (isError && !data) return <Message>Could not load Kp from NOAA.</Message>
  if (!data) return <Message>Loading…</Message>

  return (
    <>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: -24, bottom: 0 }} barCategoryGap={1}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis dataKey="t" tickFormatter={dayTick} tick={AXIS_TICK} axisLine={{ stroke: '#3f3f46' }} tickLine={false} minTickGap={48} />
          <YAxis domain={[0, 9]} ticks={[0, 3, 5, 7, 9]} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            content={({ active, label, payload }) => {
              const row = payload?.[0]?.payload as KpRow | undefined
              const lines = row ? [`Kp ${row.kp.toFixed(2)} (${row.kind})`, ...(row.scale ? [row.scale] : [])] : []
              return <ChartTip active={active} label={label as number | undefined} lines={lines} />
            }}
          />
          {current && <ReferenceLine x={current.t} stroke="#d8b553" strokeDasharray="3 3" />}
          <Bar dataKey="kp" isAnimationActive={false}>
            {rows.map((row) => (
              <Cell
                key={row.t}
                fill={row.t === previewT ? '#d8b553' : row.kp >= 4.5 ? G_COLORS[kpToG(row.kp)] : '#34d399'}
                fillOpacity={row.t === previewT ? 1 : KIND_OPACITY[row.kind]}
                cursor={row.kind === 'predicted' ? 'pointer' : undefined}
                onClick={row.kind === 'predicted' ? () => onPreview(row) : undefined}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-zinc-500 mt-2">
        Solid bars are observed and faded bars are forecast. Click a forecast bar to preview that Kp on the globe.
      </p>
    </>
  )
}

function WindChart({ rows, dataKey, unit, color, domain, zero, syncId, height }: {
  rows: WindSample[]; dataKey: 'speed' | 'density' | 'bz'; unit: string; color: string
  domain?: [number | 'auto', number | 'auto']; zero?: boolean; syncId: string; height: number
}) {
  return (
    <div>
      <p className="text-xs text-zinc-500 mb-1">{dataKey === 'bz' ? 'Bz (north +, south −)' : dataKey === 'speed' ? 'Speed' : 'Density'}, {unit}</p>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} syncId={syncId} margin={{ top: 2, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={hourTick} tick={dataKey === 'bz' ? AXIS_TICK : false} axisLine={{ stroke: '#3f3f46' }} tickLine={false} minTickGap={56} height={dataKey === 'bz' ? 24 : 2} />
          <YAxis domain={domain ?? ['auto', 'auto']} tick={AXIS_TICK} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => String(Math.round(v))} />
          <Tooltip
            content={({ active, label, payload }) => {
              const v = payload?.[0]?.value as number | null | undefined
              return <ChartTip active={active} label={label as number | undefined} lines={[v === null || v === undefined ? 'no data' : `${v.toFixed(1)} ${unit}`]} />
            }}
          />
          {zero && <ReferenceLine y={0} stroke="#52525b" />}
          <Line dataKey={dataKey} stroke={color} dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function WindTab() {
  const { data, isError } = useQuery(windHistoryQuery(true))
  const rows = useMemo(() => bucketSeries(data ?? [], FIVE_MINUTES, (group, t): WindSample => ({
    t,
    speed: mean(group.map((r) => r.speed)),
    density: mean(group.map((r) => r.density)),
    bt: mean(group.map((r) => r.bt)),
    bz: mean(group.map((r) => r.bz)),
  })), [data])

  if (isError && !data) return <Message>Could not load solar wind history from NOAA.</Message>
  if (!data) return <Message>Loading the last 24 hours…</Message>

  return (
    <div className="space-y-2">
      <WindChart rows={rows} dataKey="speed" unit="km/s" color="#d8b553" syncId="aurora-wind" height={84} />
      <WindChart rows={rows} dataKey="density" unit="p/cm³" color="#38bdf8" syncId="aurora-wind" height={84} domain={[0, 'auto']} />
      <WindChart rows={rows} dataKey="bz" unit="nT" color="#f472b6" syncId="aurora-wind" height={106} zero />
    </div>
  )
}

const FLARE_TICKS = [1e-8, 1e-7, 1e-6, 1e-5, 1e-4]
const FLARE_LETTERS = new Map(FLARE_TICKS.map((t, i) => [t, 'ABCMX'[i]]))

function XrayTab() {
  const { data, isError } = useQuery(xrayQuery(true))
  // Peak rather than average per bucket: a short flare must survive the thinning
  const rows = useMemo(() => bucketSeries(data ?? [], FIVE_MINUTES, (group, t): XrayPoint => ({
    t,
    flux: maxOf(group.map((r) => r.flux)),
  })), [data])

  if (isError && !data) return <Message>Could not load X-ray flux from NOAA.</Message>
  if (!data) return <Message>Loading the last 24 hours…</Message>

  return (
    <>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={rows} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={hourTick} tick={AXIS_TICK} axisLine={{ stroke: '#3f3f46' }} tickLine={false} minTickGap={56} />
          <YAxis
            scale="log"
            domain={[1e-9, 1e-3]}
            allowDataOverflow
            ticks={FLARE_TICKS}
            tickFormatter={(v: number) => FLARE_LETTERS.get(v) ?? ''}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={({ active, label, payload }) => {
              const v = payload?.[0]?.value as number | null | undefined
              return <ChartTip active={active} label={label as number | undefined} lines={[v ? `${flareClass(v)}  (${v.toExponential(1)} W/m²)` : 'no data']} />
            }}
          />
          {FLARE_TICKS.map((y) => <ReferenceLine key={y} y={y} stroke="#3f3f46" strokeDasharray="2 4" />)}
          <Line dataKey="flux" stroke="#f97316" dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-xs text-zinc-500 mt-2">GOES 0.1–0.8 nm. Each flare class, from A to X, is ten times stronger than the last.</p>
    </>
  )
}

export default function ChartsTabs({ now, previewT, onPreviewKp }: {
  now: number
  previewT: number | null
  onPreviewKp: (row: KpRow) => void
}) {
  const [tab, setTab] = useState<Tab>('kp')

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div role="tablist" aria-label="Space weather charts" className="flex flex-wrap gap-2 mb-4">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`px-3 py-1 rounded border text-sm transition-colors ${
              tab === id ? 'border-brass bg-brass/10 text-brass' : 'border-zinc-700 text-zinc-400 hover:text-brass'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'kp' && <KpTab now={now} previewT={previewT} onPreview={onPreviewKp} />}
      {tab === 'wind' && <WindTab />}
      {tab === 'xray' && <XrayTab />}
    </section>
  )
}
