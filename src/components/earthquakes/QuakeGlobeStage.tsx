import { useEffect, useRef, useState } from 'react'
import { Minus, Pause, Play, Plus } from 'lucide-react'
import { getMagnitudeBand } from '../../lib/api'
import { dayLabel, magnitudeLevel, type LocatedQuake } from '../../lib/earthquakes/markers'
import { ImpactGlobe } from '../../lib/nearearth/impactGlobe'
import { fractionToMs, type MarkerData } from '../../lib/nearearth/markers'
import { BAND_COLORS, MAGNITUDE_BANDS, type MagnitudeBand } from '../../lib/process'

const overlayButton = 'inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded border border-zinc-700 bg-black/50 backdrop-blur-sm text-xs text-zinc-200 hover:text-brass hover:border-brass transition-colors disabled:opacity-40 disabled:pointer-events-none'

const bandColor = (mag: number) => BAND_COLORS[getMagnitudeBand(mag) as MagnitudeBand]

/** Without WebGL2: the month's quakes as dots on a flat map */
function FlatMap({ markers }: { markers: MarkerData<LocatedQuake> | null }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center px-4 pt-4 pb-14">
      <div className="relative w-full max-w-4xl aspect-[2/1] max-h-full">
        <img src="/aurora/earth-day.webp" alt="" className="absolute inset-0 w-full h-full rounded-lg opacity-50" />
        {/* preserveAspectRatio none: the dots must stretch exactly as the image does, or they drift off it */}
        <svg viewBox="-180 -90 360 180" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" role="group" aria-label="Map of this month's earthquakes">
          {/* Smallest first, so a large quake is not buried under its aftershocks */}
          {[...(markers?.events ?? [])].sort((a, b) => a.mag - b.mag).map((e, i) => (
            <circle
              key={i}
              cx={e.lon}
              cy={-e.lat}
              r={0.7 + 2.6 * magnitudeLevel(e.mag) * magnitudeLevel(e.mag)}
              fill={bandColor(e.mag)}
              fillOpacity={0.8}
            />
          ))}
        </svg>
      </div>
    </div>
  )
}

interface Props {
  /** The month's quakes, or null while it loads or after it failed to */
  markers: MarkerData<LocatedQuake> | null
}

export default function QuakeGlobeStage({ markers }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<ImpactGlobe<LocatedQuake> | null>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const rangeRef = useRef<HTMLInputElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const markersRef = useRef(markers)
  const [failed, setFailed] = useState(false)
  const [playing, setPlaying] = useState(false)

  // Each month replays from its 1st on the same globe, so the camera stays where it was
  useEffect(() => {
    markersRef.current = markers
    const globe = globeRef.current
    if (!globe || globe.failed) return
    if (markers) {
      globe.setMarkers(markers)
      globe.replay()
    } else {
      globe.clearMarkers()
      if (labelRef.current) labelRef.current.textContent = ''
    }
  }, [markers])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const globe = new ImpactGlobe<LocatedQuake>(host, {
      label: "Globe of this month's earthquakes. Arrow keys rotate, plus and minus zoom. Every event is listed below.",
      name: 'Earthquakes',
      palette: 'magnitude',
    })
    globeRef.current = globe

    globe.onFailure = () => setFailed(true)
    globe.onPlayingChange = setPlaying
    // Both run far too often for React state, so they write straight to the elements
    globe.onCursor = (fraction) => {
      if (rangeRef.current) rangeRef.current.value = String(fraction)
      const m = markersRef.current
      if (labelRef.current && m) labelRef.current.textContent = dayLabel(fractionToMs(fraction, m.startMs, m.endMs))
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
      tip.textContent = `${dayLabel(hovered.event.time)}  ·  M${hovered.event.mag.toFixed(1)}  ·  ${hovered.event.place}`
    }
    if (!globe.failed && markersRef.current) {
      globe.setMarkers(markersRef.current)
      globe.replay()
    }

    const devWindow = window as unknown as { quakeGlobe?: ImpactGlobe<LocatedQuake> }
    if (import.meta.env.DEV) devWindow.quakeGlobe = globe
    return () => {
      if (import.meta.env.DEV) delete devWindow.quakeGlobe
      globe.dispose()
      globeRef.current = null
    }
  }, [])

  return (
    <div ref={hostRef} className="relative isolate overflow-hidden bg-black rounded-lg border border-zinc-800 h-[55vh] min-h-[380px] max-h-[620px]">
      {failed && <FlatMap markers={markers} />}
      <div ref={tipRef} className="absolute left-0 top-0 z-10 px-2 py-1 rounded bg-black/70 font-mono text-xs text-zinc-100 whitespace-pre pointer-events-none opacity-0" />

      <div className="absolute inset-x-0 bottom-0 z-10 pointer-events-none bg-gradient-to-t from-black/70 to-transparent">
        <div className="px-4 pb-3 pt-8 pointer-events-auto">
          {!failed && (
            <div className="flex items-center gap-3 mb-2">
              <button onClick={() => globeRef.current?.togglePlay()} disabled={!markers} aria-label={playing ? 'Pause' : 'Play the timeline'} className={overlayButton}>
                {playing ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <input
                ref={rangeRef}
                type="range"
                min={0}
                max={1}
                step={0.0005}
                defaultValue={1}
                disabled={!markers}
                onChange={(ev) => globeRef.current?.setCursor(Number(ev.target.value))}
                aria-label="Timeline of earthquakes"
                className="flex-1 min-w-0 accent-[#f97316] disabled:opacity-40"
              />
              <span ref={labelRef} className="font-mono text-sm text-zinc-100 w-14 text-right" />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3" role="group" aria-label="Magnitude bands">
              {MAGNITUDE_BANDS.map((band) => (
                <span key={band} className="flex items-center gap-1.5 text-xs text-zinc-300">
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: BAND_COLORS[band] }} />
                  {band}
                </span>
              ))}
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
