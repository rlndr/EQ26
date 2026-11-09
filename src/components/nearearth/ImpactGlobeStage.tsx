import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Minus, Pause, Play, Plus } from 'lucide-react'
import { formatLatLon } from '../../lib/aurora/format'
import { formatEnergy } from '../../lib/nearearth/energy'
import { ImpactGlobe } from '../../lib/nearearth/impactGlobe'
import { energyLevel, fractionToMs, type LocatedFireball, type MarkerData } from '../../lib/nearearth/markers'

const ENERGY_FILTERS = [
  { label: 'All', kt: 0 },
  { label: '1 kt+', kt: 1 },
  { label: '10 kt+', kt: 10 },
]

const overlayButton = 'inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded border border-zinc-700 bg-black/50 backdrop-blur-sm text-xs text-zinc-200 hover:text-brass hover:border-brass transition-colors'

const yearLabel = (ms: number) => String(new Date(ms).getUTCFullYear())
const dateLabel = (ms: number) => new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** Without WebGL2: the same events as dots on a flat map, still selectable */
function FlatMap({ markers, minKt, onSelect, selected }: {
  markers: MarkerData | null; minKt: number; onSelect: (e: LocatedFireball) => void; selected: LocatedFireball | null
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pt-20 pb-20 px-4">
      <div className="relative w-full max-w-5xl aspect-[2/1] max-h-full">
        {/* The day map: city lights would be mistaken for fireballs */}
        <img src="/aurora/earth-day.webp" alt="" className="absolute inset-0 w-full h-full rounded-lg opacity-50" />
        {/* preserveAspectRatio none: the dots must stretch exactly as the image does, or they drift off it */}
        <svg viewBox="-180 -90 360 180" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" role="group" aria-label="Map of recorded fireballs">
          {markers?.events.filter((e) => e.kt >= minKt).map((e) => (
            <circle
              key={e.t}
              cx={e.lon}
              cy={-e.lat}
              r={0.7 + 2.6 * energyLevel(e.kt) * energyLevel(e.kt)}
              fill={selected?.t === e.t ? '#d8b553' : '#f97316'}
              fillOpacity={0.8}
              className="cursor-pointer"
              onClick={() => onSelect(e)}
            />
          ))}
        </svg>
      </div>
    </div>
  )
}

interface Props {
  globeRef: RefObject<ImpactGlobe | null>
  markers: MarkerData | null
  selected: LocatedFireball | null
  selectedYear: number | null
  onSelect: (event: LocatedFireball | null) => void
  children?: ReactNode
}

export default function ImpactGlobeStage({ globeRef, markers, selected, selectedYear, onSelect, children }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const rangeRef = useRef<HTMLInputElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const markersRef = useRef(markers)
  const selectRef = useRef(onSelect)
  const [failed, setFailed] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [minKt, setMinKt] = useState(0)

  useEffect(() => {
    selectRef.current = onSelect
  })

  useEffect(() => {
    markersRef.current = markers
    if (markers) globeRef.current?.setMarkers(markers)
  }, [markers, globeRef])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const globe = new ImpactGlobe(host)
    globeRef.current = globe

    globe.onSelect = (event) => selectRef.current(event)
    globe.onFailure = () => setFailed(true)
    globe.onPlayingChange = setPlaying
    // Both run far too often for React state, so they write straight to the elements
    globe.onCursor = (fraction) => {
      if (rangeRef.current) rangeRef.current.value = String(fraction)
      const m = markersRef.current
      if (labelRef.current && m) labelRef.current.textContent = yearLabel(fractionToMs(fraction, m.startMs, m.endMs))
    }
    globe.onHover = (hovered) => {
      const tip = tipRef.current
      if (!tip) return
      if (!hovered) {
        tip.style.opacity = '0'
        return
      }
      tip.style.opacity = '1'
      tip.style.transform = `translate(${hovered.x + 14}px, ${hovered.y - 12}px)`
      tip.textContent = `${dateLabel(hovered.event.t)}  ·  ${formatEnergy(hovered.event.kt)}  ·  ${formatLatLon(hovered.event.lat, hovered.event.lon)}`
    }
    if (!globe.failed && markersRef.current) globe.setMarkers(markersRef.current)

    const devWindow = window as unknown as { nearEarth?: ImpactGlobe }
    if (import.meta.env.DEV) devWindow.nearEarth = globe
    return () => {
      if (import.meta.env.DEV) delete devWindow.nearEarth
      globe.dispose()
      globeRef.current = null
    }
  }, [globeRef])

  useEffect(() => {
    globeRef.current?.setSelected(selected)
  }, [selected, globeRef])

  useEffect(() => {
    globeRef.current?.setMinEnergy(minKt === 0 ? 0 : energyLevel(minKt))
  }, [minKt, globeRef])

  return (
    <div ref={hostRef} className="relative isolate overflow-hidden bg-black h-[62vh] sm:h-[72vh] min-h-[460px] max-h-[820px]">
      {failed && <FlatMap markers={markers} minKt={minKt} onSelect={onSelect} selected={selected} />}
      <div ref={tipRef} className="absolute left-0 top-0 z-10 px-2 py-1 rounded bg-black/70 font-mono text-xs text-zinc-100 whitespace-pre pointer-events-none opacity-0" />
      {children}

      <div className="absolute inset-x-0 bottom-0 z-10 pointer-events-none bg-gradient-to-t from-black/70 to-transparent">
        <div className="max-w-6xl mx-auto px-4 pb-4 pt-8 pointer-events-auto">
          {!failed && (
            <div className="flex items-center gap-3 mb-2">
              <button onClick={() => globeRef.current?.togglePlay()} aria-label={playing ? 'Pause' : 'Play the timeline'} className={overlayButton}>
                {playing ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <input
                ref={rangeRef}
                type="range"
                min={0}
                max={1}
                step={0.0005}
                defaultValue={1}
                onChange={(ev) => globeRef.current?.setCursor(Number(ev.target.value))}
                aria-label="Timeline of fireballs"
                className="flex-1 min-w-0 accent-[#f97316]"
              />
              <span ref={labelRef} className="font-mono text-sm text-zinc-100 w-10 text-right" />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5" role="group" aria-label="Minimum energy">
              {ENERGY_FILTERS.map((f) => (
                <button key={f.kt} onClick={() => setMinKt(f.kt)} aria-pressed={minKt === f.kt} className={minKt === f.kt ? 'px-2.5 py-1 rounded border border-brass bg-brass/20 text-xs text-brass backdrop-blur-sm' : overlayButton}>
                  {f.label}
                </button>
              ))}
              {selectedYear !== null && <span className="text-xs text-brass ml-1">Showing {selectedYear}</span>}
            </div>
            {!failed && (
              <div className="flex items-center gap-1.5">
                <button aria-label="Zoom in" className={overlayButton} onClick={() => globeRef.current?.zoomBy(0.8)}><Plus size={13} /></button>
                <button aria-label="Zoom out" className={overlayButton} onClick={() => globeRef.current?.zoomBy(1.25)}><Minus size={13} /></button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
