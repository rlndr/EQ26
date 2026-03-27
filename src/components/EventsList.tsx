import { ExternalLink, X } from 'lucide-react'
import { getMagnitudeBand, parseRegion, isSafeUrl } from '../lib/api'
import type { EarthquakeFeature } from '../lib/api'

interface EventsListProps {
  features: EarthquakeFeature[]
  selectedRegion: string | null
  onClearFilter: () => void
}

const BADGE_STYLES: Record<string, string> = {
  'M5.x': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'M6.x': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'M7.x': 'bg-red-500/20 text-red-400 border-red-500/30',
  'M8+': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = months[d.getUTCMonth()]
  const day = d.getUTCDate()
  const year = d.getUTCFullYear()
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${month} ${day}, ${year} ${hh}:${mm} UTC`
}

export default function EventsList({ features, selectedRegion, onClearFilter }: EventsListProps) {
  const visible = selectedRegion
    ? features.filter((f) => parseRegion(f.properties.place) === selectedRegion)
    : features

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
            {selectedRegion ? 'Filtered Events' : 'All Events'}
          </h2>
          {selectedRegion && (
            <span className="flex items-center gap-1 text-xs bg-zinc-700 text-zinc-200 rounded px-2 py-0.5">
              {selectedRegion}
              <button onClick={onClearFilter} className="ml-1 text-zinc-400 hover:text-zinc-100 transition-colors">
                <X size={11} />
              </button>
            </span>
          )}
        </div>
        <span className="text-xs text-zinc-600">
          {visible.length}{selectedRegion ? ` of ${features.length}` : ''} events — sorted by magnitude
        </span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: '480px' }}>
        {visible.length === 0 ? (
          <div className="py-12 text-center text-zinc-600 text-sm">
            {selectedRegion ? `No events found for ${selectedRegion}` : 'No events recorded for this period'}
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800/60">
            {visible.map((feature, idx) => {
              const { mag, place, time, url } = feature.properties
              const band = getMagnitudeBand(mag)
              const badgeClass = BADGE_STYLES[band] ?? BADGE_STYLES['M5.x']
              const safeUrl = isSafeUrl(url) ? url : null
              const inner = (
                <>
                  <span className={`shrink-0 inline-flex items-center justify-center rounded border text-xs font-bold tabular-nums px-2 py-0.5 min-w-[52px] ${badgeClass}`}>
                    M {mag != null ? mag.toFixed(1) : '?'}
                  </span>
                  <span className="flex-1 text-sm text-zinc-200 truncate min-w-0">
                    {place || 'Unknown location'}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500 tabular-nums whitespace-nowrap">
                    {formatDate(time)}
                  </span>
                  {safeUrl && (
                    <ExternalLink size={12} className="shrink-0 text-zinc-700 group-hover:text-zinc-400 transition-colors" />
                  )}
                </>
              )
              return (
                <li key={idx} className="group">
                  {safeUrl ? (
                    <a
                      href={safeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/50 transition-colors"
                    >
                      {inner}
                    </a>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      {inner}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
