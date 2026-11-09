import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Pause, Play } from 'lucide-react'
import { isNotFound, objectQuery, trackQuery } from '../../lib/nearearth/api'
import { FlybyStage, type DistanceMode } from '../../lib/nearearth/flybyStage'
import type { Flyby } from '../../lib/nearearth/parse'
import { auToLd, formatSizeEstimate, formatTimeUncertainty, kmToLd } from '../../lib/nearearth/scale'
import { scrollToSection } from '../../lib/nearearth/sections'

const fullDate = (t: number) => new Date(t).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 border-t border-zinc-800/70 text-sm">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-zinc-200 text-right">{value}</dd>
    </div>
  )
}

interface Props {
  flyby: Flyby | null
  onShowRisk: (des: string) => void
}

export default function FlybyView({ flyby, onShowRisk }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<FlybyStage | null>(null)
  const rangeRef = useRef<HTMLInputElement>(null)
  const readoutRef = useRef<HTMLSpanElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const [playing, setPlaying] = useState(false)
  const [mode, setMode] = useState<DistanceMode>('log')
  // JPL is only asked for a path once someone has scrolled this far
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true)
        observer.disconnect()
      }
    }, { rootMargin: '200px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const des = seen ? flyby?.des ?? null : null
  const track = useQuery(trackQuery(des))
  const detail = useQuery(objectQuery(des))

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return
    const stage = new FlybyStage(host, canvas)
    stageRef.current = stage
    stage.onPlayingChange = setPlaying
    stage.onTick = (tick) => {
      if (rangeRef.current) rangeRef.current.value = String(tick.fraction)
      if (readoutRef.current) {
        readoutRef.current.textContent = `${fullDate(tick.t)}  ·  ${kmToLd(tick.distanceKm).toFixed(2)} LD  ·  ${tick.speedKms.toFixed(1)} km/s`
      }
    }
    return () => {
      stage.dispose()
      stageRef.current = null
    }
  }, [])

  const name = flyby?.name ?? ''
  useEffect(() => {
    stageRef.current?.setTrack(track.data ?? null, name)
  }, [track.data, name])

  useEffect(() => {
    stageRef.current?.setMode(mode)
  }, [mode])

  const missing = track.isError && isNotFound(track.error)
  const failed = track.isError && !missing
  const hazard = detail.data?.hazardous

  return (
    <section ref={sectionRef} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div ref={hostRef} className="relative h-80 sm:h-[26rem] bg-[#050507]">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" role="img" aria-label={flyby ? `Diagram of ${flyby.name}'s path past Earth and the Moon` : 'Flyby diagram'} />
            {!flyby && <p className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500 p-6 text-center">Pick a pass to see its path.</p>}
            {flyby && track.isPending && seen && <p className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">Asking JPL for its path…</p>}
            {missing && <p className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500 p-6 text-center">JPL has no path for this object yet. Its details are still on the right.</p>}
            {failed && <p className="absolute inset-0 flex items-center justify-center text-sm text-rose-400 p-6 text-center">Could not load this object’s path from NASA JPL.</p>}
            <div className="absolute top-3 right-3 flex gap-1" role="group" aria-label="Distance scale">
              {(['log', 'linear'] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={`px-2 py-0.5 rounded border text-xs capitalize backdrop-blur-sm transition-colors ${mode === m ? 'border-brass bg-brass/20 text-brass' : 'border-zinc-700 bg-black/50 text-zinc-300 hover:text-brass'}`}>{m}</button>
              ))}
            </div>
          </div>
          <div className="px-4 py-2 flex items-center gap-3 border-t border-zinc-800">
            <button onClick={() => stageRef.current?.togglePlay()} disabled={!track.data} aria-label={playing ? 'Pause' : 'Play the flyby'} className="p-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-brass hover:border-brass transition-colors disabled:opacity-40">
              {playing ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <input ref={rangeRef} type="range" min={0} max={1} step={0.001} defaultValue={0} disabled={!track.data} onChange={(ev) => stageRef.current?.setFraction(Number(ev.target.value))} aria-label="Position along the flyby" className="flex-1 min-w-0 accent-[#38bdf8]" />
          </div>
          <p className="px-4 pb-3 font-mono text-xs text-zinc-400 min-h-[1.25rem]"><span ref={readoutRef} /></p>
        </div>

        <div className="p-4 border-t lg:border-t-0 lg:border-l border-zinc-800">
          {!flyby && <p className="text-sm text-zinc-500">Nothing selected.</p>}
          {flyby && (
            <>
              <h3 className="text-lg text-zinc-100">{flyby.name}</h3>
              <p className="text-xs text-zinc-500 mb-3">{detail.data?.orbitClass ? `${detail.data.orbitClass} asteroid` : 'Asteroid'}{hazard === true ? ', classed as potentially hazardous' : ''}</p>
              <dl>
                <Fact label="Closest" value={fullDate(flyby.t)} />
                <Fact label="Distance" value={`${auToLd(flyby.distAu).toFixed(2)} LD`} />
                <Fact label="Could be" value={`${auToLd(flyby.minAu).toFixed(2)}–${auToLd(flyby.maxAu).toFixed(2)} LD`} />
                <Fact label="Time known to" value={formatTimeUncertainty(flyby.timeSigma)} />
                <Fact label="Speed" value={flyby.speedKms !== null ? `${flyby.speedKms.toFixed(1)} km/s` : 'Unknown'} />
                <Fact label="Size" value={formatSizeEstimate(flyby.h)} />
              </dl>
              {flyby.onRisk && (
                <button onClick={() => { onShowRisk(flyby.des); scrollToSection('future') }} className="mt-3 text-sm text-rose-400 hover:underline text-left">
                  Also on the risk list. See why
                </button>
              )}
              <p className="text-xs text-zinc-500 mt-3">The path shown is the best-fit orbit. The “could be” range shows how far that may be off.</p>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
