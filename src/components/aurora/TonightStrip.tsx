import { BAND_STYLE, clockAtOffset } from '../../lib/aurora/format'
import type { TonightCell } from '../../lib/aurora/visibility'

/** Night sky colour for the darkness row: deep blue when dark, pale when the Sun is up */
function skyColor(sunAlt: number) {
  if (sunAlt > 0) return '#7dd3fc'
  if (sunAlt > -6) return '#b45309'
  if (sunAlt > -12) return '#3b4a7a'
  if (sunAlt > -18) return '#1e2548'
  return '#0b1024'
}

interface Props {
  cells: TonightCell[]
  utcOffsetSeconds: number
  timezone: string
  previewT: number | null
  onPreview: (cell: TonightCell) => void
}

export default function TonightStrip({ cells, utcOffsetSeconds, timezone, previewT, onPreview }: Props) {
  return (
    <div>
      <p className="text-xs text-zinc-500 mb-1.5">Next 12 hours{timezone ? ` (${timezone})` : ''}. Pick an hour to preview it on the globe.</p>
      <div className="overflow-x-auto -mx-1 px-1 pb-1">
        <div className="grid grid-cols-12 gap-1 min-w-[520px]">
          {cells.map((cell) => {
            const active = previewT === cell.t
            const canPreview = cell.kp !== null
            return (
              <button
                key={cell.t}
                onClick={() => onPreview(cell)}
                disabled={!canPreview}
                aria-pressed={active}
                title={cell.score ? `${cell.score.band}, Kp ${cell.kp?.toFixed(1)}` : 'No Kp forecast for this hour'}
                className={`rounded border px-0.5 py-1 text-center transition-colors disabled:cursor-not-allowed ${
                  active ? 'border-brass bg-brass/10' : 'border-zinc-800 hover:border-zinc-600'
                }`}
              >
                <span className="block font-mono text-[11px] text-zinc-400">{clockAtOffset(cell.t, utcOffsetSeconds).slice(0, 2)}</span>
                <span className="block h-2 rounded-sm mt-1" style={{ backgroundColor: skyColor(cell.sunAlt) }} />
                <span className="block font-mono text-[10px] text-zinc-500 mt-1">{cell.cloud === null ? '—' : `${Math.round(cell.cloud)}%`}</span>
                <span className="block h-1 rounded-full mt-1" style={{ backgroundColor: cell.score ? BAND_STYLE[cell.score.band].fill : '#27272a' }} />
              </button>
            )
          })}
        </div>
      </div>
      <p className="text-xs text-zinc-600 mt-1">Bars show darkness, cloud, then chance. Hours ahead use the 3-hourly Kp forecast and a simplified oval.</p>
    </div>
  )
}
