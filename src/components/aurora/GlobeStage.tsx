import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { polarForecastImage } from '../../lib/aurora/feeds'
import { formatLatLon } from '../../lib/aurora/format'
import { Globe, type GlobeMode } from '../../lib/aurora/globe'
import type { LatLon } from '../../lib/aurora/astro'

interface Props {
  globeRef: RefObject<Globe | null>
  onPick: (at: LatLon) => void
  onModeChange: (mode: GlobeMode) => void
  onReady: (globe: Globe) => void
  /** The compass is written directly on each frame while on the ground */
  onHeading: (heading: number) => void
  onFailure: () => void
  children?: ReactNode
}

/** Hosts the globe and everything drawn over it; falls back to NOAA's own maps without WebGL2 */
export default function GlobeStage({ globeRef, onPick, onModeChange, onReady, onHeading, onFailure, children }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const hoverRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  // Latest callbacks, so the globe is built once and never torn down for a re-render
  const callbacks = useRef({ onPick, onModeChange, onReady, onHeading, onFailure })
  useEffect(() => {
    callbacks.current = { onPick, onModeChange, onReady, onHeading, onFailure }
  })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const globe = new Globe(host)
    globeRef.current = globe

    globe.onPick = (at) => callbacks.current.onPick(at)
    globe.onModeChange = (mode) => callbacks.current.onModeChange(mode)
    globe.onHeading = (heading) => callbacks.current.onHeading(heading)
    globe.onFailure = () => {
      setFailed(true)
      callbacks.current.onFailure()
    }
    globe.onHover = (info) => {
      const el = hoverRef.current
      if (!el) return
      if (!info) {
        el.style.opacity = '0'
        return
      }
      el.style.opacity = '1'
      el.textContent = `${formatLatLon(info.lat, info.lon)}  ·  aurora ${Math.round(info.percent)}%`
    }
    if (!globe.failed) callbacks.current.onReady(globe)

    const devWindow = window as unknown as { aurora?: Globe }
    if (import.meta.env.DEV) devWindow.aurora = globe

    return () => {
      if (import.meta.env.DEV) delete devWindow.aurora
      globe.dispose()
      globeRef.current = null
    }
  }, [globeRef])

  return (
    <div ref={hostRef} className="relative isolate overflow-hidden bg-black h-[60vh] sm:h-[75vh] min-h-[440px] max-h-[860px]">
      {failed && (
        <div className="absolute inset-0 flex flex-col sm:flex-row items-center justify-center gap-4 p-4 pt-24">
          <img src={polarForecastImage('northern')} alt="NOAA aurora forecast for the northern hemisphere" className="max-h-[42%] sm:max-h-[80%] min-w-0 object-contain rounded-lg" />
          <img src={polarForecastImage('southern')} alt="NOAA aurora forecast for the southern hemisphere" className="max-h-[42%] sm:max-h-[80%] min-w-0 object-contain rounded-lg" />
        </div>
      )}
      <div ref={hoverRef} className="absolute left-1/2 -translate-x-1/2 bottom-16 z-10 px-2 py-1 rounded bg-black/60 font-mono text-xs text-zinc-200 whitespace-pre pointer-events-none transition-opacity opacity-0" />
      {children}
    </div>
  )
}
