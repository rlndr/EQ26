import { Activity, Zap, Globe, MapPin } from 'lucide-react'
import type { ProcessedData } from '../lib/process'

interface SummaryCardsProps {
  data: ProcessedData
  totalEvents: number
}

interface CardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  accent?: string
}

function Card({ icon, label, value, sub, accent }: CardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2 text-zinc-500 text-xs uppercase tracking-wider font-medium">
        <span className={accent ?? 'text-zinc-500'}>{icon}</span>
        {label}
      </div>
      <div className="text-2xl font-semibold text-zinc-100 truncate">{value}</div>
      {sub && <div className="text-xs text-zinc-500 truncate">{sub}</div>}
    </div>
  )
}

export default function SummaryCards({ data, totalEvents }: SummaryCardsProps) {
  const { maxMag, maxMagPlace, regionCount } = data

  const magColor =
    maxMag >= 8.0
      ? 'text-purple-400'
      : maxMag >= 7.0
        ? 'text-red-400'
        : maxMag >= 6.0
          ? 'text-orange-400'
          : 'text-amber-400'

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card
        icon={<Activity size={14} />}
        label="Total Events"
        value={totalEvents.toLocaleString()}
        sub="M5.0+ earthquakes"
        accent="text-zinc-400"
      />
      <Card
        icon={<Zap size={14} />}
        label="Max Magnitude"
        value={maxMag > 0 ? `M ${maxMag.toFixed(1)}` : 'N/A'}
        sub={maxMag > 0 ? undefined : 'No events'}
        accent={magColor}
      />
      <Card
        icon={<Globe size={14} />}
        label="Regions Affected"
        value={regionCount}
        sub="distinct countries / regions"
        accent="text-blue-400"
      />
      <Card
        icon={<MapPin size={14} />}
        label="Strongest Event"
        value={maxMag > 0 ? `M ${maxMag.toFixed(1)}` : 'N/A'}
        sub={maxMag > 0 ? maxMagPlace : 'No events this month'}
        accent="text-rose-400"
      />
    </div>
  )
}
