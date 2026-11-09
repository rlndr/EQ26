import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { propagatedWindQuery, suviImageUrl, SUVI_WAVELENGTHS, windHistoryQuery, type SuviWavelength } from '../../lib/aurora/feeds'
import { clockTime, shortDayTime, timeAgo } from '../../lib/aurora/format'
import { REGION_NOTES, standoffRadii, type WindRegion } from '../../lib/aurora/magnetosphere'
import { latestComplete } from '../../lib/aurora/parse'
import { SolarWindStrip as Strip } from '../../lib/aurora/solarWind'

const WAVELENGTH_NOTES: Record<SuviWavelength, string> = {
  '304': 'Chromosphere, about 50,000 K',
  '171': 'Quiet corona, about 600,000 K',
  '195': 'Corona, about 1 million K',
  '131': 'Flaring plasma, about 10 million K',
  '094': 'Hot flaring regions, about 6 million K',
  '284': 'Active regions, about 2 million K',
}

const REGIONS: WindRegion[] = ['sun', 'wind', 'l1', 'shield', 'earth']

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-zinc-950/40 border border-zinc-800 rounded-lg px-3 py-2">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`font-mono text-sm ${tone ?? 'text-zinc-100'}`}>{value}</p>
    </div>
  )
}

export default function SolarWindStrip() {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stripRef = useRef<Strip | null>(null)
  const [wavelength, setWavelength] = useState<SuviWavelength>('304')
  const [hovered, setHovered] = useState<WindRegion | null>(null)
  const [selected, setSelected] = useState<WindRegion>('wind')
  const [replay, setReplay] = useState(false)
  const [replayIndex, setReplayIndex] = useState<number | null>(null)
  const [tick, setTick] = useState(() => Date.now())

  const { data: propagated, isError } = useQuery(propagatedWindQuery)
  const { data: history, isError: historyError } = useQuery(windHistoryQuery(replay))

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return
    const strip = new Strip(host, canvas)
    stripRef.current = strip
    strip.onRegion = setHovered
    return () => {
      strip.dispose()
      stripRef.current = null
    }
  }, [])

  useEffect(() => {
    stripRef.current?.setSunImage(suviImageUrl(wavelength))
  }, [wavelength])

  const live = useMemo(() => (propagated ? latestComplete(propagated) : null), [propagated])
  const replaySamples = useMemo(() => history?.filter((s) => s.speed !== null && s.density !== null && s.bz !== null) ?? [], [history])
  const lastIndex = replaySamples.length - 1
  const index = replayIndex === null ? lastIndex : Math.min(replayIndex, lastIndex)
  const scrubbed = replay && lastIndex >= 0 ? replaySamples[index] : null

  const shown = scrubbed ?? live

  useEffect(() => {
    if (shown && shown.speed !== null && shown.density !== null && shown.bz !== null) {
      stripRef.current?.setWind({ speed: shown.speed, density: shown.density, bz: shown.bz })
    }
  }, [shown])

  const standoff = shown && shown.speed !== null && shown.density !== null ? standoffRadii(shown.density, shown.speed) : null
  const bz = shown?.bz ?? null
  const note = REGION_NOTES[hovered ?? selected]
  const minutesAway = live ? Math.round((live.arrivesAt - tick) / 60_000) : null

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="p-4 pb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs uppercase tracking-[0.15em] text-zinc-500">Sun to Earth</h2>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Solar image wavelength">
          {SUVI_WAVELENGTHS.map((w) => (
            <button
              key={w}
              onClick={() => setWavelength(w)}
              title={WAVELENGTH_NOTES[w]}
              aria-pressed={wavelength === w}
              className={`px-1.5 py-0.5 rounded border font-mono text-[11px] transition-colors ${
                wavelength === w ? 'border-brass bg-brass/10 text-brass' : 'border-zinc-700 text-zinc-500 hover:text-brass'
              }`}
            >
              {w} Å
            </button>
          ))}
        </div>
      </div>

      <div ref={hostRef} className="relative h-56 sm:h-64">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-label="Animated diagram of the solar wind flowing from the Sun to Earth" role="img" />
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Speed" value={shown?.speed != null ? `${Math.round(shown.speed)} km/s` : '—'} />
          <Stat label="Density" value={shown?.density != null ? `${shown.density.toFixed(1)} p/cm³` : '—'} />
          <Stat label="Bz" value={bz !== null ? `${bz > 0 ? '+' : ''}${bz.toFixed(1)} nT ${bz < -1 ? 'south' : bz > 1 ? 'north' : ''}` : '—'} tone={bz !== null && bz < -1 ? 'text-rose-400' : bz !== null && bz > 1 ? 'text-sky-400' : undefined} />
          <Stat label="Shield distance" value={standoff !== null ? `${standoff.toFixed(1)} Earth radii` : '—'} />
        </div>

        {isError && !propagated && <p className="text-sm text-rose-400">Could not load the solar wind from NOAA.</p>}

        <p className="text-sm text-zinc-300" aria-live="off">
          {scrubbed
            ? <>Replaying the wind measured {shortDayTime(scrubbed.t)}.</>
            : live && minutesAway !== null && (
              minutesAway > 0
                ? <>The wind measured {timeAgo(live.t, tick)} reaches Earth at <span className="font-mono text-brass">{clockTime(live.arrivesAt)}</span>, in about {minutesAway} min.</>
                : <>The latest wind reading reached Earth {timeAgo(live.arrivesAt, tick)}.</>
            )}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {!replay && (
            <button onClick={() => setReplay(true)} className="px-3 py-1 rounded border border-zinc-700 text-sm text-zinc-400 hover:text-brass hover:border-brass transition-colors">
              Replay the last 24 hours
            </button>
          )}
          {replay && (
            <>
              <button onClick={() => { setReplay(false); setReplayIndex(null) }} className="px-3 py-1 rounded border border-brass bg-brass/10 text-sm text-brass">
                Back to live
              </button>
              {historyError && !history && <span className="text-xs text-rose-400">Could not load the history.</span>}
              {!history && !historyError && <span className="text-xs text-zinc-500">Loading…</span>}
              {lastIndex > 0 && (
                <input
                  type="range"
                  min={0}
                  max={lastIndex}
                  value={index}
                  onChange={(ev) => setReplayIndex(Number(ev.target.value))}
                  aria-label="Time within the last 24 hours"
                  className="flex-1 min-w-[160px] accent-[#d8b553]"
                />
              )}
            </>
          )}
        </div>

        <div>
          <div className="flex flex-wrap gap-1.5 mb-2" role="group" aria-label="Explain part of the diagram">
            {REGIONS.map((r) => (
              <button
                key={r}
                onClick={() => setSelected(r)}
                aria-pressed={selected === r}
                className={`px-2 py-0.5 rounded border text-xs transition-colors ${
                  (hovered ?? selected) === r ? 'border-brass bg-brass/10 text-brass' : 'border-zinc-700 text-zinc-400 hover:text-brass'
                }`}
              >
                {REGION_NOTES[r].title}
              </button>
            ))}
          </div>
          <p className="text-sm text-zinc-400 min-h-[2.5rem]">{note.note}</p>
        </div>
      </div>
    </section>
  )
}
