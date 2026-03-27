import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { MAGNITUDE_BANDS, type MagnitudeBand } from '../lib/process'

interface MagnitudeChartProps {
  byBand: Record<MagnitudeBand, number>
}

const BAND_COLORS: Record<MagnitudeBand, string> = {
  'M5.x': '#f59e0b', // amber-500
  'M6.x': '#f97316', // orange-500
  'M7.x': '#ef4444', // red-500
  'M8+': '#a855f7',  // purple-500
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; payload: { band: string } }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const { band } = payload[0].payload
  const count = payload[0].value
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm">
      <div className="text-zinc-300 font-medium">{band}</div>
      <div className="text-zinc-100 font-semibold">{count} event{count !== 1 ? 's' : ''}</div>
    </div>
  )
}

export default function MagnitudeChart({ byBand }: MagnitudeChartProps) {
  const chartData = MAGNITUDE_BANDS.map((band) => ({
    band,
    count: byBand[band] ?? 0,
  }))

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3">
      <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
        Events by Magnitude Band
      </h2>
      <div className="flex-1" style={{ minHeight: 220 }}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis
              dataKey="band"
              tick={{ fill: '#a1a1aa', fontSize: 12 }}
              axisLine={{ stroke: '#3f3f46' }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: '#a1a1aa', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={64}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.band}
                  fill={BAND_COLORS[entry.band as MagnitudeBand]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Legend */}
      <div className="flex gap-4 flex-wrap">
        {MAGNITUDE_BANDS.map((band) => (
          <div key={band} className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: BAND_COLORS[band] }}
            />
            {band}
          </div>
        ))}
      </div>
    </div>
  )
}
