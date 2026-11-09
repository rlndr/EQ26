import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ArrowUp, Compass, Crosshair, Minus, Plus, Rocket } from 'lucide-react'
import AlertBar from '../components/aurora/AlertBar'
import ChartsTabs from '../components/aurora/ChartsTabs'
import Definitions from '../components/aurora/Definitions'
import GlobeStage from '../components/aurora/GlobeStage'
import ScalesPanel from '../components/aurora/ScalesPanel'
import SolarWindStrip from '../components/aurora/SolarWindStrip'
import StormControls from '../components/aurora/StormControls'
import TonightStrip from '../components/aurora/TonightStrip'
import ViewingPanel, { type Spot } from '../components/aurora/ViewingPanel'
import { moonState, subSolarPoint, sunAltitude, type LatLon } from '../lib/aurora/astro'
import { auroraQuery, cloudsQuery, kpForecastQuery, propagatedWindQuery, roundCoord } from '../lib/aurora/feeds'
import { formatLatLon, G_COLORS, timeAgo } from '../lib/aurora/format'
import type { Globe, GlobeMode } from '../lib/aurora/globe'
import { newField, scanView, type AuroraField } from '../lib/aurora/grid'
import { cloudAt, kpAt, kpToG, latestComplete, type KpRow } from '../lib/aurora/parse'
import { fillStorm, stormFromKp, type StormPreset, type StormSetting } from '../lib/aurora/stormModel'
import { auroraFactor, buildTonight, cloudFactor, darknessFactorText, moonFactor, visibilityScore, type TonightCell } from '../lib/aurora/visibility'

/** Modelled aurora in place of NOAA's live grid; `t` set means previewing that hour */
interface Simulation {
  label: string
  setting: StormSetting
  t: number | null
  presetId: string | null
  /** Where the Kp slider should sit */
  kp: number
}

const WIND_STALE_MS = 15 * 60_000

function spotFromUrl(params: URLSearchParams): Spot | null {
  const lat = Number(params.get('lat'))
  const lon = Number(params.get('lon'))
  if (!params.has('lat') || !params.has('lon') || !Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon, name: formatLatLon(lat, lon) }
}

function Readout({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-right">
      <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-400">{label}</p>
      <p className="font-mono text-sm text-zinc-100" style={color ? { color } : undefined}>{value}</p>
    </div>
  )
}

/** Compass bearing to the brightest aurora in view, or toward the nearest oval or pole if none is */
function brightestBearing(field: AuroraField | null, spot: Spot) {
  const scan = field ? scanView(field, spot) : null
  return scan?.best?.bearingDeg ?? scan?.nearest?.bearingDeg ?? (spot.lat >= 0 ? 0 : 180)
}

const COMPASS_PX_PER_DEG = 2.4
const COMPASS_WIDTH = 300
const COMPASS_MARKS = Array.from({ length: 25 }, (_, i) => -360 + i * 45)
const COMPASS_NAMES: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }
const compassX = (deg: number) => (deg + 360) * COMPASS_PX_PER_DEG

const overlayButton = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-zinc-700 bg-black/50 backdrop-blur-sm text-xs text-zinc-200 hover:text-brass hover:border-brass transition-colors'

export default function AuroraPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [now, setNow] = useState(() => Date.now())
  const globeRef = useRef<Globe | null>(null)
  const [spot, setSpot] = useState<Spot | null>(() => spotFromUrl(searchParams))
  const [simulation, setSimulation] = useState<Simulation | null>(null)
  const [mode, setMode] = useState<GlobeMode>('orbit')
  const [shared, setShared] = useState(false)
  const [globeFailed, setGlobeFailed] = useState(false)
  /** Seconds the next change of aurora data should cross-fade over */
  const nextFade = useRef(3)
  const compassRef = useRef<HTMLDivElement>(null)

  const { data: aurora, isError: auroraError } = useQuery(auroraQuery)
  const { data: kpRows } = useQuery(kpForecastQuery)
  const { data: propagated } = useQuery(propagatedWindQuery)
  const clouds = useQuery(cloudsQuery(spot?.lat ?? null, spot?.lon ?? null))

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // What the globe and the verdict are showing: NOAA's grid, or the model when one is active
  const activeField = useMemo<AuroraField | null>(() => {
    if (!simulation) return aurora?.field ?? null
    return fillStorm(newField(), simulation.setting, subSolarPoint(simulation.t ?? now))
  }, [simulation, aurora, now])

  const latestField = useRef(activeField)

  useEffect(() => {
    latestField.current = activeField
    if (activeField) globeRef.current?.setField(activeField, nextFade.current)
    nextFade.current = 3
  }, [activeField])

  useEffect(() => {
    globeRef.current?.setPreviewTime(simulation?.t ?? null)
  }, [simulation])

  useEffect(() => {
    globeRef.current?.setPin(spot)
  }, [spot])

  const onReady = useCallback((globe: Globe) => {
    if (latestField.current) globe.setField(latestField.current, 0)
    const fromUrl = spotFromUrl(new URLSearchParams(window.location.search))
    if (fromUrl) {
      globe.setPin(fromUrl)
      globe.flyTo(fromUrl.lat, fromUrl.lon)
    }
  }, [])

  const onPick = useCallback((at: LatLon) => {
    setSpot({ ...at, name: formatLatLon(at.lat, at.lon) })
    setShared(false)
  }, [])

  const choose = useCallback((next: Spot) => {
    setSpot(next)
    setShared(false)
    const globe = globeRef.current
    if (globe?.mode === 'ground') globe.moveGround(next.lat, next.lon, brightestBearing(latestField.current, next))
    else globe?.flyTo(next.lat, next.lon)
  }, [])

  // Written straight to the element: this runs every frame while on the ground
  const onHeading = useCallback((heading: number) => {
    const el = compassRef.current
    if (el) el.style.transform = `translateX(${COMPASS_WIDTH / 2 - compassX(heading)}px)`
  }, [])

  const evalTime = simulation?.t ?? now
  const scan = useMemo(() => (spot && activeField ? scanView(activeField, spot) : null), [spot, activeField])

  const cloud = cloudAt(clouds.data, evalTime)
  const verdict = useMemo(() => {
    if (!spot || !scan) return null
    const sunAlt = sunAltitude(spot.lat, spot.lon, evalTime)
    const moon = moonState(spot.lat, spot.lon, evalTime)
    return {
      score: visibilityScore({ pView: scan.pView, sunAlt, cloud, moonAlt: moon.altDeg, moonIllum: moon.illumination }),
      factors: [
        auroraFactor(scan),
        darknessFactorText(sunAlt),
        cloudFactor(cloud, clouds.isLoading),
        moonFactor(moon.altDeg, moon.illumination),
      ],
    }
  }, [spot, scan, evalTime, cloud, clouds.isLoading])

  // Twelve full scans of the grid, so only redone when the hour or its inputs change
  const hourKey = Math.floor(now / 3600_000)
  const tonight = useMemo(() => {
    if (!spot) return []
    return buildTonight(hourKey * 3600_000, spot, clouds.data, kpRows)
  }, [spot, hourKey, clouds.data, kpRows])

  const preview = useCallback((t: number, kp: number) => {
    setSimulation((current) => (current?.t === t ? null : { label: `Preview: Kp ${kp.toFixed(1)}`, setting: stormFromKp(kp), t, presetId: null, kp }))
  }, [])
  const previewCell = useCallback((cell: TonightCell) => {
    if (cell.kp !== null) preview(cell.t, cell.kp)
  }, [preview])
  const previewKpRow = useCallback((row: KpRow) => preview(row.t, row.kp), [preview])

  const applyPreset = useCallback((preset: StormPreset) => {
    nextFade.current = 1.5
    setSimulation((current) => (current?.presetId === preset.id ? null : {
      label: `${preset.label} (${preset.detail})`, setting: preset.setting, t: null, presetId: preset.id, kp: preset.kp ?? 9,
    }))
  }, [])

  const applyKp = useCallback((kp: number) => {
    // Dragging: fading would lag behind the hand
    nextFade.current = 0
    setSimulation({ label: `Kp ${kp.toFixed(1)}`, setting: stormFromKp(kp), t: null, presetId: null, kp })
  }, [])

  const windNow = propagated ? latestComplete(propagated) : null
  const windStale = windNow ? now - windNow.t > WIND_STALE_MS : false
  const kpNow = kpRows ? kpAt(kpRows, now) : null
  const gLevel = kpNow ? kpToG(kpNow.kp) : 0

  const share = () => {
    if (!spot) return
    const params = { lat: String(roundCoord(spot.lat)), lon: String(roundCoord(spot.lon)) }
    setSearchParams(params, { replace: true })
    const url = `${window.location.origin}${window.location.pathname}?${new URLSearchParams(params)}`
    navigator.clipboard?.writeText(url).then(() => setShared(true)).catch(() => {})
  }

  const lookUp = () => {
    if (!spot) return
    globeRef.current?.enterGround(spot.lat, spot.lon, brightestBearing(activeField, spot))
  }

  const orbiting = mode === 'orbit'
  const grounded = mode === 'ground'
  const bearing = spot ? brightestBearing(activeField, spot) : 0

  return (
    <div>
      <GlobeStage globeRef={globeRef} onPick={onPick} onModeChange={setMode} onReady={onReady} onHeading={onHeading} onFailure={() => setGlobeFailed(true)}>
        <div className="absolute inset-x-0 top-0 z-10 pointer-events-none bg-gradient-to-b from-black/70 to-transparent">
          <div className="max-w-6xl mx-auto px-4 pt-5 pb-10 flex flex-wrap justify-between gap-x-6 gap-y-3">
            <div>
              <h1 className="text-3xl font-bold text-brass">Aurora Watch</h1>
              {orbiting && <p className="text-sm text-zinc-300 max-w-sm hidden sm:block">{globeFailed ? 'NOAA\'s latest aurora forecast. This browser can\'t draw the 3D globe, so these are NOAA\'s own maps.' : 'Tonight\'s aurora, live from NOAA\'s forecast. Drag the globe, or click anywhere to see if you could see it from there.'}</p>}
              {simulation && <p className="mt-1 inline-block text-xs px-2 py-0.5 rounded bg-amber-400/15 border border-amber-400/40 text-amber-300">Simulated, not a forecast</p>}
            </div>
            <div className="flex gap-4 sm:gap-5">
              <Readout label="Storm level" value={kpNow ? (gLevel > 0 ? `G${gLevel}` : 'None') : '—'} color={kpNow ? G_COLORS[gLevel] : undefined} />
              <Readout label="Kp" value={kpNow ? kpNow.kp.toFixed(1) : '—'} />
              <Readout label="Wind" value={windNow?.speed != null ? `${Math.round(windNow.speed)} km/s` : '—'} />
              <Readout label="Bz" value={windNow?.bz != null ? `${windNow.bz > 0 ? '+' : ''}${windNow.bz.toFixed(1)} nT` : '—'} />
            </div>
          </div>
        </div>

        {orbiting && !globeFailed && (
          <div className="absolute inset-x-0 bottom-0 z-10 pointer-events-none">
            <div className="max-w-6xl mx-auto px-4 pb-4 flex flex-wrap items-end justify-between gap-2">
              <div className="flex flex-wrap gap-1.5 pointer-events-auto">
                <button className={overlayButton} onClick={() => globeRef.current?.flyTo(72, 0)}><Compass size={13} /> North</button>
                <button className={overlayButton} onClick={() => globeRef.current?.flyTo(-72, 0)}><Compass size={13} /> South</button>
                <button className={overlayButton} onClick={() => globeRef.current?.aimAtStrongest()}><Crosshair size={13} /> Strongest now</button>
              </div>
              <div className="flex items-center gap-1.5 pointer-events-auto">
                {spot && <button className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-brass bg-brass/20 backdrop-blur-sm text-xs text-brass hover:bg-brass/30 transition-colors" onClick={lookUp}>Look up from {spot.name}</button>}
                <button aria-label="Zoom in" className={overlayButton} onClick={() => globeRef.current?.zoomBy(0.8)}><Plus size={13} /></button>
                <button aria-label="Zoom out" className={overlayButton} onClick={() => globeRef.current?.zoomBy(1.25)}><Minus size={13} /></button>
              </div>
            </div>
          </div>
        )}

        {grounded && spot && (
          <div className="absolute inset-x-0 bottom-0 z-10 pointer-events-none">
            <div className="flex flex-col items-center gap-2 px-4 pb-4">
              <div className="relative overflow-hidden h-8 rounded border border-zinc-700 bg-black/50 backdrop-blur-sm" style={{ width: COMPASS_WIDTH, maxWidth: '100%' }}>
                <div ref={compassRef} className="absolute inset-y-0 left-0">
                  {COMPASS_MARKS.map((deg) => {
                    const name = COMPASS_NAMES[((deg % 360) + 360) % 360]
                    return (
                      <span key={deg} className={`absolute top-1.5 -translate-x-1/2 font-mono text-xs ${name.length === 1 ? 'text-zinc-100' : 'text-zinc-500'}`} style={{ left: compassX(deg) }}>{name}</span>
                    )
                  })}
                  {[-360, 0, 360].map((turn) => (
                    <span key={turn} className="absolute bottom-0 -translate-x-1/2 w-0 h-0 border-x-[5px] border-x-transparent border-b-[6px] border-b-emerald-400" style={{ left: compassX(bearing + turn) }} />
                  ))}
                </div>
                <span className="absolute left-1/2 top-0 h-full w-px bg-brass" />
              </div>
              <div className="flex flex-wrap justify-center gap-1.5 pointer-events-auto">
                <button className={overlayButton} onClick={() => globeRef.current?.lookToward(bearing)}><Crosshair size={13} /> Face the brightest aurora</button>
                <button className={overlayButton} onClick={() => globeRef.current?.exitGround()}><Rocket size={13} /> Back to orbit</button>
              </div>
            </div>
          </div>
        )}

        {grounded && spot && (
          <p className="absolute left-1/2 -translate-x-1/2 top-20 z-10 text-xs text-zinc-300 bg-black/40 rounded px-2 py-1 pointer-events-none inline-flex items-center gap-1.5 whitespace-nowrap">
            <ArrowUp size={12} /> Looking up from {spot.name}. Drag to look around.
          </p>
        )}
      </GlobeStage>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {simulation ? (
            <span className="inline-flex items-center gap-2 text-xs px-2 py-1 rounded bg-amber-400/10 border border-amber-400/30 text-amber-300">
              Simulated, not a forecast: {simulation.label}
              <button className="underline hover:text-amber-100" onClick={() => setSimulation(null)}>Back to live</button>
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 text-xs px-2 py-1 rounded bg-emerald-400/10 border border-emerald-400/30 text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Live{aurora ? `, updated ${timeAgo(aurora.observedAt, now)}` : ''}
            </span>
          )}
          {auroraError && !aurora && <span className="text-xs text-rose-400">Could not load the forecast from NOAA.</span>}
          {windStale && <span className="text-xs px-2 py-1 rounded bg-amber-400/10 border border-amber-400/20 text-amber-400">Solar wind data is delayed, so NOAA&apos;s model is falling back on Kp</span>}
          <div className="flex-1 min-w-[240px]"><AlertBar now={now} /></div>
        </div>

        <StormControls
          activePreset={simulation?.presetId ?? null}
          kp={simulation?.kp ?? kpNow?.kp ?? 2}
          onPreset={applyPreset}
          onKp={applyKp}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
          <ViewingPanel
            spot={spot}
            onChoose={choose}
            band={verdict?.score.band ?? null}
            factors={verdict?.factors ?? []}
            simulated={simulation !== null}
            onLookUp={lookUp}
            canLookUp={orbiting}
            globeAvailable={!globeFailed}
            onShare={share}
            shared={shared}
          >
            {tonight.length > 0 && (
              <TonightStrip
                cells={tonight}
                utcOffsetSeconds={clouds.data?.utcOffsetSeconds ?? 0}
                timezone={clouds.data ? clouds.data.timezone : 'UTC'}
                previewT={simulation?.t ?? null}
                onPreview={previewCell}
              />
            )}
          </ViewingPanel>
          <ScalesPanel />
        </div>

        <SolarWindStrip />
        <ChartsTabs now={now} previewT={simulation?.t ?? null} onPreviewKp={previewKpRow} />

        <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-400 space-y-3">
          <h2 className="text-xs uppercase tracking-[0.15em] text-zinc-500">How it works</h2>
          <p>Where the aurora is, and how strong, comes from NOAA&apos;s OVATION forecast, which looks 30 to 90 minutes ahead. That forecast is a probability of seeing aurora, so turning it into glow is an artistic choice. It covers a grid of 1° cells, about 111 km across, so the individual folds and rays are drawn procedurally. Colours are camera-like: faint aurora often looks grey-green to the eye.</p>
          <p>The Storm Time Machine and the hours-ahead preview use a simplified oval built on a rule of thumb, and the Carrington preset is an estimate from historical accounts. The Sun-to-Earth strip is schematic and not to scale. The viewing verdict doesn&apos;t know about terrain, light pollution or how open your northern sky is.</p>
          <Definitions />
          <p className="text-xs text-zinc-500">
            Data: <a className="underline hover:text-brass" href="https://www.swpc.noaa.gov/" target="_blank" rel="noreferrer">NOAA Space Weather Prediction Center</a>. Cloud cover and place search: <a className="underline hover:text-brass" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> (CC BY 4.0), which receives your chosen location rounded to about 11 km. Earth imagery: NASA Blue Marble and Black Marble.
          </p>
        </section>
      </div>
    </div>
  )
}
