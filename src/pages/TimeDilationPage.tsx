import { useCallback, useEffect, useRef, useState } from 'react'
import { Heart, Pause, Play, RotateCcw } from 'lucide-react'
import {
  betaToSlider,
  DEFAULT_BETA,
  formatBeta,
  formatClockTime,
  lengthContraction,
  lorentzGamma,
  MIN_BETA_ULTRA,
  sliderToBeta,
  speedKms,
  speedMph,
  tickRate,
  VELOCITY_PRESETS,
} from '../lib/relativity/physics'
import {
  DESTINATIONS,
  formatDistanceLy,
  formatHumanDuration,
  solveJourney,
  type DurationUnit,
  type JourneyMode,
} from '../lib/relativity/journey'

const SIM_SPEEDS = [
  { label: '1× Real-Time', mult: 1 },
  { label: '10× Fast', mult: 10 },
  { label: '1 Min/s', mult: 60 },
  { label: '1 Hr/s', mult: 3600 },
] as const

function setHandAngle(lineEl: SVGLineElement | null, angleDeg: number, radius: number) {
  if (!lineEl) return
  const rad = ((angleDeg - 90) * Math.PI) / 180
  const x2 = 50 + radius * Math.cos(rad)
  const y2 = 50 + radius * Math.sin(rad)
  lineEl.setAttribute('x2', x2.toFixed(2))
  lineEl.setAttribute('y2', y2.toFixed(2))
}

export default function TimeDilationPage() {
  const [beta, setBeta] = useState<number>(DEFAULT_BETA)
  const [ultraRel, setUltraRel] = useState<boolean>(false)
  const [isPlaying, setIsPlaying] = useState<boolean>(true)
  const [simMultiplier, setSimMultiplier] = useState<number>(1)

  // Cosmic Journey Calculator state
  const [calcMode, setCalcMode] = useState<JourneyMode>('shipTime')
  const [calcValue, setCalcValue] = useState<string>('5')
  const [calcUnit, setCalcUnit] = useState<DurationUnit>('years')

  // Derived relativistic values
  const gamma = lorentzGamma(beta)
  const invGamma = tickRate(beta)
  const lenRatio = lengthContraction(beta)
  const sliderValue = betaToSlider(beta, ultraRel)

  const parsedCalcValue = Number.parseFloat(calcValue)
  const journey = solveJourney({
    mode: calcMode,
    value: Number.isFinite(parsedCalcValue) ? parsedCalcValue : 0,
    unit: calcUnit,
    beta,
  })

  // DOM & SVG refs for 60 fps clock updates without React re-renders
  const obsSecHandRef = useRef<SVGLineElement>(null)
  const obsMinHandRef = useRef<SVGLineElement>(null)
  const trvSecHandRef = useRef<SVGLineElement>(null)
  const trvMinHandRef = useRef<SVGLineElement>(null)
  const obsDigitalRef = useRef<HTMLDivElement>(null)
  const trvDigitalRef = useRef<HTMLDivElement>(null)
  const obsSubRef = useRef<HTMLDivElement>(null)
  const trvSubRef = useRef<HTMLDivElement>(null)
  const obsHeartRef = useRef<HTMLSpanElement>(null)
  const trvHeartRef = useRef<HTMLSpanElement>(null)

  // Canvas & container refs
  const travelerCardRef = useRef<HTMLDivElement>(null)
  const starfieldCanvasRef = useRef<HTMLCanvasElement>(null)
  const lightClockWrapRef = useRef<HTMLDivElement>(null)
  const lightClockCanvasRef = useRef<HTMLCanvasElement>(null)
  const lorentzWrapRef = useRef<HTMLDivElement>(null)
  const lorentzCanvasRef = useRef<HTMLCanvasElement>(null)

  // Mutable simulation state stepped in requestAnimationFrame
  const simRef = useRef({
    beta: DEFAULT_BETA,
    gamma: lorentzGamma(DEFAULT_BETA),
    isPlaying: true,
    simMultiplier: 1,
    elapsedObserverSec: 0,
    elapsedTravelerSec: 0,
    shipPhotonPhase: 0,
    obsPhotonPhase: 0,
    obsTravelProgress: 0.15,
    trailPoints: [] as { x: number; y: number }[],
    stars: [] as { x: number; y: number; size: number }[],
    starfieldSize: { w: 0, h: 0 },
    lightClockSize: { w: 0, h: 0 },
    lorentzSize: { w: 0, h: 0 },
  })

  // Render the SVG hands, digital stopwatches, and heartbeat scale
  const renderClocks = useCallback(() => {
    const { elapsedObserverSec, elapsedTravelerSec } = simRef.current

    const obsSecAngle = (elapsedObserverSec % 60) * 6
    const obsMinAngle = ((elapsedObserverSec / 60) % 60) * 6
    setHandAngle(obsSecHandRef.current, obsSecAngle, 38)
    setHandAngle(obsMinHandRef.current, obsMinAngle, 30)

    const trvSecAngle = (elapsedTravelerSec % 60) * 6
    const trvMinAngle = ((elapsedTravelerSec / 60) % 60) * 6
    setHandAngle(trvSecHandRef.current, trvSecAngle, 38)
    setHandAngle(trvMinHandRef.current, trvMinAngle, 30)

    if (obsDigitalRef.current) {
      obsDigitalRef.current.textContent = formatClockTime(elapsedObserverSec)
    }
    if (trvDigitalRef.current) {
      trvDigitalRef.current.textContent = formatClockTime(elapsedTravelerSec)
    }
    if (obsSubRef.current) {
      obsSubRef.current.textContent = `Total: ${elapsedObserverSec.toFixed(2)} s`
    }
    if (trvSubRef.current) {
      const lag = Math.max(0, elapsedObserverSec - elapsedTravelerSec)
      trvSubRef.current.textContent = `Total: ${elapsedTravelerSec.toFixed(2)} s (Lag: −${lag.toFixed(2)} s)`
    }

    const obsBeat = elapsedObserverSec % 1 < 0.15 ? 1.25 : 1.0
    const trvBeat = elapsedTravelerSec % 1 < 0.15 ? 1.25 : 1.0
    if (obsHeartRef.current) {
      obsHeartRef.current.style.transform = `scale(${obsBeat})`
    }
    if (trvHeartRef.current) {
      trvHeartRef.current.style.transform = `scale(${trvBeat})`
    }
  }, [])

  // Draw the Lorentz dilation curve (static on frame, redrawn when beta or canvas size changes)
  const drawLorentzCurve = useCallback((currentBeta: number) => {
    const canvas = lorentzCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { w, h } = simRef.current.lorentzSize
    if (w <= 0 || h <= 0) return

    ctx.clearRect(0, 0, w, h)

    const padL = 46
    const padR = 20
    const padT = 22
    const padB = 34
    const plotW = w - padL - padR
    const plotH = h - padT - padB
    if (plotW <= 10 || plotH <= 10) return

    const currentGamma = lorentzGamma(currentBeta)
    const maxGammaPlot =
      currentGamma <= 10
        ? 10
        : currentGamma <= 30
          ? 30
          : currentGamma <= 80
            ? 80
            : 250

    // Grid & axes
    ctx.strokeStyle = 'rgba(161, 161, 170, 0.14)'
    ctx.lineWidth = 1
    ctx.fillStyle = '#a1a1aa'
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'

    const yTicks =
      maxGammaPlot === 10
        ? [1, 2, 4, 6, 8, 10]
        : maxGammaPlot === 30
          ? [1, 5, 10, 15, 20, 30]
          : maxGammaPlot === 80
            ? [1, 20, 40, 60, 80]
            : [1, 50, 100, 150, 200, 250]

    for (const yt of yTicks) {
      const y = padT + plotH * (1 - (yt - 1) / (maxGammaPlot - 1))
      ctx.beginPath()
      ctx.moveTo(padL, y)
      ctx.lineTo(padL + plotW, y)
      ctx.stroke()
      ctx.fillText(`${yt}×`, 8, y + 4)
    }

    const xTicks = [0, 0.25, 0.5, 0.75, 1.0]
    for (const xt of xTicks) {
      const x = padL + xt * plotW
      ctx.fillText(`${xt.toFixed(2)}c`, x - 15, h - 10)
    }

    // Lorentz curve γ(β)
    const maxBetaSample = betaFromCap(maxGammaPlot)
    ctx.strokeStyle = '#d8b553'
    ctx.lineWidth = 2.25
    ctx.beginPath()
    const steps = 240
    for (let i = 0; i <= steps; i++) {
      const b = (i / steps) * maxBetaSample
      const g = Math.min(maxGammaPlot, lorentzGamma(b))
      const x = padL + b * plotW
      const y = padT + plotH * (1 - (g - 1) / (maxGammaPlot - 1))
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // Current velocity crosshair + glowing marker
    const clampedG = Math.min(maxGammaPlot, currentGamma)
    const markerX = padL + currentBeta * plotW
    const markerY = padT + plotH * (1 - (clampedG - 1) / (maxGammaPlot - 1))

    ctx.strokeStyle = 'rgba(244, 114, 182, 0.45)'
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(markerX, padT + plotH)
    ctx.lineTo(markerX, markerY)
    ctx.lineTo(padL, markerY)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = '#f472b6'
    ctx.shadowColor = '#f472b6'
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.arc(markerX, markerY, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
  }, [])

  // Keep simulation ref synced with React state
  useEffect(() => {
    simRef.current.beta = beta
    simRef.current.gamma = lorentzGamma(beta)
    drawLorentzCurve(beta)
  }, [beta, drawLorentzCurve])

  useEffect(() => {
    simRef.current.isPlaying = isPlaying
  }, [isPlaying])

  useEffect(() => {
    simRef.current.simMultiplier = simMultiplier
  }, [simMultiplier])

  // Setup ResizeObserver for all three canvases + main requestAnimationFrame loop
  useEffect(() => {
    const starCanvas = starfieldCanvasRef.current
    const starWrap = travelerCardRef.current
    const lightCanvas = lightClockCanvasRef.current
    const lightWrap = lightClockWrapRef.current
    const lorCanvas = lorentzCanvasRef.current
    const lorWrap = lorentzWrapRef.current

    if (!starCanvas || !starWrap || !lightCanvas || !lightWrap || !lorCanvas || !lorWrap) return

    if (simRef.current.stars.length === 0) {
      simRef.current.stars = Array.from({ length: 45 }, () => ({
        x: Math.random(),
        y: Math.random(),
        size: 1 + Math.random() * 1.8,
      }))
    }

    const syncCanvasSize = (
      canvas: HTMLCanvasElement,
      wrap: HTMLElement,
      target: { w: number; h: number }
    ) => {
      const dpr = window.devicePixelRatio || 1
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      target.w = w
      target.h = h
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
    }

    const resizeAll = () => {
      syncCanvasSize(starCanvas, starWrap, simRef.current.starfieldSize)
      syncCanvasSize(lightCanvas, lightWrap, simRef.current.lightClockSize)
      syncCanvasSize(lorCanvas, lorWrap, simRef.current.lorentzSize)
      drawLorentzCurve(simRef.current.beta)
    }

    resizeAll()
    const ro = new ResizeObserver(resizeAll)
    ro.observe(starWrap)
    ro.observe(lightWrap)
    ro.observe(lorWrap)

    const drawStarfield = (dt: number) => {
      const ctx = starCanvas.getContext('2d')
      if (!ctx) return
      const { w, h } = simRef.current.starfieldSize
      if (w <= 0 || h <= 0) return

      ctx.clearRect(0, 0, w, h)
      const b = simRef.current.beta
      const playing = simRef.current.isPlaying
      const speedPx = (15 + b * 420) * (playing ? 1 : 0)
      const streakLen = 2 + b * 45

      ctx.strokeStyle = 'rgba(244, 114, 182, 0.5)'
      ctx.fillStyle = '#e4e4e7'

      for (const s of simRef.current.stars) {
        s.x -= (speedPx * dt) / Math.max(w, 1)
        if (s.x < 0) {
          s.x = 1
          s.y = Math.random()
        }
        const px = s.x * w
        const py = s.y * h

        if (b > 0.08) {
          ctx.lineWidth = s.size
          ctx.beginPath()
          ctx.moveTo(px, py)
          ctx.lineTo(px + streakLen, py)
          ctx.stroke()
        } else {
          ctx.beginPath()
          ctx.arc(px, py, s.size, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    const drawLightClock = (dt: number) => {
      const ctx = lightCanvas.getContext('2d')
      if (!ctx) return
      const { w, h } = simRef.current.lightClockSize
      if (w <= 0 || h <= 0) return

      ctx.clearRect(0, 0, w, h)

      const splitX = w * 0.34
      ctx.strokeStyle = 'rgba(161, 161, 170, 0.18)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(splitX, 12)
      ctx.lineTo(splitX, h - 12)
      ctx.stroke()

      const b = simRef.current.beta
      const g = simRef.current.gamma
      const invG = 1 / g
      const bounceRate = 0.95

      if (simRef.current.isPlaying) {
        simRef.current.shipPhotonPhase = (simRef.current.shipPhotonPhase + dt * bounceRate) % 2
        simRef.current.obsPhotonPhase = (simRef.current.obsPhotonPhase + dt * bounceRate * invG) % 2
      }

      const shipPhase = simRef.current.shipPhotonPhase
      const shipBounceY = shipPhase <= 1 ? shipPhase : 2 - shipPhase

      const topY = 48
      const botY = h - 36
      const mirrorH = Math.max(20, botY - topY)

      // 1. Left: Ship rest frame (vertical bounce)
      ctx.fillStyle = '#a1a1aa'
      ctx.font = '600 11px Inter, system-ui, sans-serif'
      ctx.fillText('1. SHIP REST FRAME', 14, 24)

      const shipCenterX = splitX * 0.5
      const mirrorW = 48

      ctx.fillStyle = '#f472b6'
      ctx.fillRect(shipCenterX - mirrorW / 2, topY - 6, mirrorW, 6)
      ctx.fillRect(shipCenterX - mirrorW / 2, botY, mirrorW, 6)

      ctx.strokeStyle = 'rgba(216, 181, 83, 0.35)'
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(shipCenterX, topY)
      ctx.lineTo(shipCenterX, botY)
      ctx.stroke()
      ctx.setLineDash([])

      const pyShip = botY - shipBounceY * mirrorH
      ctx.fillStyle = '#d8b553'
      ctx.shadowColor = '#d8b553'
      ctx.shadowBlur = 12
      ctx.beginPath()
      ctx.arc(shipCenterX, pyShip, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0

      // 2. Right: Stationary observer frame (diagonal sawtooth path)
      ctx.fillStyle = '#a1a1aa'
      ctx.fillText(
        b === 0 ? '2. OBSERVER FRAME (AT REST)' : '2. OBSERVER FRAME (DIAGONAL PATH)',
        splitX + 16,
        24
      )

      const rightAreaW = Math.max(40, w - splitX - 36)
      const startX = splitX + 24
      const trackSpan = Math.max(20, rightAreaW - 24)

      const obsPhase = simRef.current.obsPhotonPhase
      const obsBounceY = obsPhase <= 1 ? obsPhase : 2 - obsPhase

      if (simRef.current.isPlaying && b > 0) {
        const horizRate = 0.32 * b
        const nextProgress = simRef.current.obsTravelProgress + dt * horizRate
        if (nextProgress >= 1) {
          simRef.current.obsTravelProgress = nextProgress % 1
          simRef.current.trailPoints.length = 0
        } else {
          simRef.current.obsTravelProgress = nextProgress
        }
      }

      const currX = startX + simRef.current.obsTravelProgress * trackSpan
      const currY = botY - obsBounceY * mirrorH

      if (simRef.current.isPlaying) {
        const trail = simRef.current.trailPoints
        trail.push({ x: currX, y: currY })
        if (trail.length > 100) trail.shift()
      }

      // Draw photon path trail
      const trail = simRef.current.trailPoints
      if (trail.length > 1) {
        ctx.strokeStyle = 'rgba(216, 181, 83, 0.65)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(trail[0].x, trail[0].y)
        for (let i = 1; i < trail.length; i++) {
          ctx.lineTo(trail[i].x, trail[i].y)
        }
        ctx.stroke()
      }

      // Lorentz-contracted mirrors moving across right pane
      const contractedW = Math.max(6, mirrorW * invG)
      ctx.fillStyle = '#38bdf8'
      ctx.fillRect(currX - contractedW / 2, topY - 6, contractedW, 6)
      ctx.fillRect(currX - contractedW / 2, botY, contractedW, 6)

      // Moving photon
      ctx.fillStyle = '#d8b553'
      ctx.shadowColor = '#d8b553'
      ctx.shadowBlur = 12
      ctx.beginPath()
      ctx.arc(currX, currY, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    }

    let rafId = 0
    let lastTime = performance.now()

    const animate = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000)
      lastTime = now

      if (simRef.current.isPlaying) {
        const dObs = dt * simRef.current.simMultiplier
        const dTrv = dObs / simRef.current.gamma
        simRef.current.elapsedObserverSec += dObs
        simRef.current.elapsedTravelerSec += dTrv
        renderClocks()
      }

      drawStarfield(dt)
      drawLightClock(dt)

      rafId = requestAnimationFrame(animate)
    }

    renderClocks()
    rafId = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
    }
  }, [drawLorentzCurve, renderClocks])

  const handleSliderChange = (rawSlider: number) => {
    const nextBeta = sliderToBeta(rawSlider, ultraRel)
    simRef.current.trailPoints.length = 0
    setBeta(nextBeta)
  }

  const handleUltraToggle = (checked: boolean) => {
    setUltraRel(checked)
    simRef.current.trailPoints.length = 0
    if (checked && beta < MIN_BETA_ULTRA) {
      setBeta(MIN_BETA_ULTRA)
    }
  }

  const handlePresetClick = (presetBeta: number) => {
    simRef.current.trailPoints.length = 0
    if (presetBeta < MIN_BETA_ULTRA && ultraRel) {
      setUltraRel(false)
    }
    setBeta(presetBeta)
  }

  const handleResetClocks = () => {
    simRef.current.elapsedObserverSec = 0
    simRef.current.elapsedTravelerSec = 0
    renderClocks()
  }

  const handleDestinationClick = (ly: number) => {
    setCalcMode('distance')
    setCalcValue(String(ly))
  }

  const betaText = formatBeta(beta)
  const gammaText = gamma < 100 ? `${gamma.toFixed(3)}×` : `${gamma.toFixed(1)}×`

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brass mb-2">Time Dilation Explorer</h1>
        <p className="text-zinc-400 max-w-3xl">
          Explore how moving close to the speed of light (<span className="font-mono text-zinc-300">c = 299,792 km/s</span>)
          slows the passage of time for a high-speed{' '}
          <span className="text-rose-400 font-medium">Traveler</span> relative to a stationary{' '}
          <span className="text-sky-400 font-medium">Observer</span> on Earth.
        </p>
      </div>

      {/* 1. Velocity Control & Live Relativistic Telemetry */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
        <div className="grid lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <h2 className="text-xs uppercase tracking-[0.15em] text-zinc-500">
                Traveler Velocity (v / c)
              </h2>
              <span className="font-mono tabular-nums text-2xl font-bold text-rose-400">
                {betaText}
              </span>
            </div>

            <div className="space-y-1.5">
              <input
                type="range"
                min={0}
                max={1000}
                step="any"
                value={sliderValue}
                onChange={(e) => handleSliderChange(Number.parseFloat(e.target.value))}
                aria-label="Velocity as fraction of speed of light"
                className="w-full accent-brass cursor-pointer"
              />
              <div className="flex justify-between font-mono text-[11px] text-zinc-500 px-0.5">
                {ultraRel ? (
                  <>
                    <span>0.9000c</span>
                    <span>0.9900c</span>
                    <span>0.9990c</span>
                    <span>0.9999c</span>
                    <span>0.99999c</span>
                  </>
                ) : (
                  <>
                    <span>0.00c (Rest)</span>
                    <span>0.25c</span>
                    <span>0.50c</span>
                    <span>0.75c</span>
                    <span>0.9999c</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
              <div className="flex flex-wrap gap-1.5">
                {VELOCITY_PRESETS.map((p) => {
                  const active = Math.abs(p.beta - beta) < 0.00005
                  return (
                    <button
                      key={p.label}
                      type="button"
                      title={p.title}
                      onClick={() => handlePresetClick(p.beta)}
                      className={`px-2.5 py-1 rounded text-xs font-mono transition-colors border ${
                        active
                          ? 'border-brass bg-brass/10 text-brass'
                          : 'border-zinc-700 text-zinc-400 hover:text-brass'
                      }`}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>

              <label
                title="Logarithmically zoom into velocities between 0.90c and 0.99999c"
                className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer select-none border border-zinc-800 bg-zinc-950/60 px-2.5 py-1 rounded"
              >
                <input
                  type="checkbox"
                  checked={ultraRel}
                  onChange={(e) => handleUltraToggle(e.target.checked)}
                  className="accent-brass cursor-pointer"
                />
                <span>Ultra-Relativistic Zoom</span>
              </label>
            </div>
          </div>

          <div className="lg:col-span-5 grid grid-cols-2 gap-3">
            <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-3.5">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                Lorentz Factor (γ)
              </div>
              <div className="font-mono tabular-nums text-xl font-bold text-brass mt-0.5">
                {gammaText}
              </div>
              <div className="font-mono text-[11px] text-zinc-500 mt-0.5">
                1 s on Ship = {gamma.toFixed(2)} s on Earth
              </div>
            </div>

            <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-3.5">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                Traveler Time Rate (1/γ)
              </div>
              <div className="font-mono tabular-nums text-xl font-bold text-zinc-100 mt-0.5">
                {(invGamma * 100).toFixed(2)}%
              </div>
              <div className="font-mono text-[11px] text-zinc-500 mt-0.5">
                of Earth observer clock rate
              </div>
            </div>

            <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-3.5">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                Speed in km/s
              </div>
              <div className="font-mono tabular-nums text-xl font-bold text-zinc-100 mt-0.5">
                {Math.round(speedKms(beta)).toLocaleString('en-US')} km/s
              </div>
              <div className="font-mono text-[11px] text-zinc-500 mt-0.5">
                {Math.round(speedMph(beta)).toLocaleString('en-US')} mph
              </div>
            </div>

            <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-3.5">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                Length Contraction (L/L₀)
              </div>
              <div className="font-mono tabular-nums text-xl font-bold text-zinc-100 mt-0.5">
                {(lenRatio * 100).toFixed(2)}%
              </div>
              <div className="font-mono text-[11px] text-zinc-500 mt-0.5">
                Ship length seen by observer
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Live Dual-Frame Clocks Stage */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-brass bg-brass/10 text-brass hover:bg-brass/20 transition-colors"
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              {isPlaying ? 'Pause Clocks' : 'Resume Clocks'}
            </button>
            <button
              type="button"
              onClick={handleResetClocks}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
            >
              <RotateCcw size={14} />
              Reset Elapsed Time
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span className="mr-1 text-zinc-500">Simulation Rate:</span>
            {SIM_SPEEDS.map((s) => (
              <button
                key={s.mult}
                type="button"
                onClick={() => setSimMultiplier(s.mult)}
                className={`px-2.5 py-1 rounded font-mono text-xs border transition-colors ${
                  simMultiplier === s.mult
                    ? 'border-brass bg-brass/10 text-brass'
                    : 'border-zinc-700 text-zinc-400 hover:text-brass'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Stationary Observer Card */}
          <div className="bg-zinc-950/70 border border-zinc-800 border-t-2 border-t-sky-400 rounded-lg p-4 flex flex-col justify-between gap-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 font-semibold text-zinc-100">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
                  Stationary Observer (Earth)
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  Reference Frame at Rest (v = 0)
                </div>
              </div>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                Tick Rate: 1.000×
              </span>
            </div>

            <div className="flex items-center gap-5 flex-wrap">
              <svg className="w-28 h-28 shrink-0" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="rgba(9, 9, 11, 0.9)"
                  stroke="rgba(56, 189, 248, 0.4)"
                  strokeWidth="2.5"
                />
                <g stroke="rgba(161, 161, 170, 0.45)" strokeWidth="1.5">
                  <line x1="50" y1="7" x2="50" y2="13" />
                  <line x1="93" y1="50" x2="87" y2="50" />
                  <line x1="50" y1="93" x2="50" y2="87" />
                  <line x1="7" y1="50" x2="13" y2="50" />
                </g>
                <line
                  ref={obsMinHandRef}
                  x1="50"
                  y1="50"
                  x2="50"
                  y2="20"
                  stroke="#93c5fd"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <line
                  ref={obsSecHandRef}
                  x1="50"
                  y1="50"
                  x2="50"
                  y2="12"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <circle cx="50" cy="50" r="3.5" fill="#38bdf8" />
              </svg>

              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                  Elapsed Observer Time (Δt)
                </div>
                <div
                  ref={obsDigitalRef}
                  className="font-mono tabular-nums text-3xl font-bold text-sky-400"
                >
                  00:00:00.00
                </div>
                <div ref={obsSubRef} className="font-mono tabular-nums text-xs text-zinc-500">
                  Total: 0.00 s
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-500 pt-3 border-t border-zinc-800/80">
              <span>Biological / Mechanical Rhythm</span>
              <span className="inline-flex items-center gap-1.5 font-mono text-zinc-300">
                <span ref={obsHeartRef} className="inline-flex transition-transform duration-75">
                  <Heart size={14} className="text-sky-400 fill-sky-400" />
                </span>
                <span>60.0 BPM</span>
              </span>
            </div>
          </div>

          {/* High-Speed Traveler Card */}
          <div
            ref={travelerCardRef}
            className="relative overflow-hidden bg-zinc-950/70 border border-zinc-800 border-t-2 border-t-rose-400 rounded-lg p-4 flex flex-col justify-between gap-4"
          >
            <canvas
              ref={starfieldCanvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none opacity-40"
            />

            <div className="relative z-10 flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 font-semibold text-zinc-100">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" />
                  High-Speed Traveler (Spaceship)
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  Moving Frame at {betaText}
                </div>
              </div>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-900/90 border border-zinc-800 text-zinc-300">
                Tick Rate: {invGamma.toFixed(3)}×
              </span>
            </div>

            <div className="relative z-10 flex items-center gap-5 flex-wrap">
              <svg className="w-28 h-28 shrink-0" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="rgba(9, 9, 11, 0.9)"
                  stroke="rgba(244, 114, 182, 0.4)"
                  strokeWidth="2.5"
                />
                <g stroke="rgba(161, 161, 170, 0.45)" strokeWidth="1.5">
                  <line x1="50" y1="7" x2="50" y2="13" />
                  <line x1="93" y1="50" x2="87" y2="50" />
                  <line x1="50" y1="93" x2="50" y2="87" />
                  <line x1="7" y1="50" x2="13" y2="50" />
                </g>
                <line
                  ref={trvMinHandRef}
                  x1="50"
                  y1="50"
                  x2="50"
                  y2="20"
                  stroke="#fbcfe8"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <line
                  ref={trvSecHandRef}
                  x1="50"
                  y1="50"
                  x2="50"
                  y2="12"
                  stroke="#f472b6"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <circle cx="50" cy="50" r="3.5" fill="#f472b6" />
              </svg>

              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                  Elapsed Ship Time (Δt&prime;)
                </div>
                <div
                  ref={trvDigitalRef}
                  className="font-mono tabular-nums text-3xl font-bold text-rose-400"
                >
                  00:00:00.00
                </div>
                <div ref={trvSubRef} className="font-mono tabular-nums text-xs text-zinc-500">
                  Total: 0.00 s (Lag: −0.00 s)
                </div>
              </div>
            </div>

            <div className="relative z-10 flex items-center justify-between text-xs text-zinc-500 pt-3 border-t border-zinc-800/80">
              <span>Apparent Rhythm from Earth</span>
              <span className="inline-flex items-center gap-1.5 font-mono text-zinc-300">
                <span ref={trvHeartRef} className="inline-flex transition-transform duration-75">
                  <Heart size={14} className="text-rose-400 fill-rose-400" />
                </span>
                <span>{(60 * invGamma).toFixed(1)} BPM</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Visual Intuition: Photon Light Clock & Lorentz Curve */}
      <div className="grid lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-xs uppercase tracking-[0.15em] text-zinc-500">
                Why Does Time Slow Down? — The Photon Light Clock
              </h2>
              <span className="font-mono text-xs text-brass">c = Constant</span>
            </div>
            <div
              ref={lightClockWrapRef}
              className="bg-zinc-950/80 border border-zinc-800 rounded-lg overflow-hidden h-64"
            >
              <canvas ref={lightClockCanvasRef} className="block w-full h-full" />
            </div>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed mt-3">
            Inside the ship (left), a light pulse bounces vertically between two mirrors. To the
            stationary observer (right), the ship moves horizontally while the photon traces a{' '}
            <strong className="text-zinc-200">longer diagonal path</strong>. Because the speed of
            light (<span className="font-mono">c</span>) is identical for all observers, a longer
            path means each bounce takes longer to complete in the Earth frame.
          </p>
        </section>

        <section className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-xs uppercase tracking-[0.15em] text-zinc-500">
                Lorentz Dilation Curve (γ vs v/c)
              </h2>
              <span className="font-mono text-xs text-brass">γ = {gamma.toFixed(2)}×</span>
            </div>
            <div
              ref={lorentzWrapRef}
              className="bg-zinc-950/80 border border-zinc-800 rounded-lg overflow-hidden h-64"
            >
              <canvas ref={lorentzCanvasRef} className="block w-full h-full" />
            </div>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed mt-3">
            At everyday speeds, <span className="font-mono text-zinc-300">γ ≈ 1.000</span> (nearly
            flat). Time dilation steepens rapidly past{' '}
            <strong className="text-zinc-200">0.80c</strong> and shoots toward infinity as{' '}
            <span className="font-mono text-zinc-300">v → c</span>, making the speed of light the
            ultimate cosmic speed limit.
          </p>
        </section>
      </div>

      {/* 4. Cosmic Journey & Twin Paradox Calculator */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-xs uppercase tracking-[0.15em] text-zinc-500">
            Cosmic Journey &amp; Twin Paradox Calculator
          </h2>
          <span className="text-xs text-zinc-400">
            At current speed:{' '}
            <strong className="font-mono text-rose-400">{betaText}</strong>
          </span>
        </div>

        <div className="grid lg:grid-cols-12 gap-5 items-stretch">
          <div className="lg:col-span-5 bg-zinc-950/70 border border-zinc-800 rounded-lg p-4 space-y-3.5">
            <div className="space-y-1">
              <label
                htmlFor="calcModeSelect"
                className="block text-[11px] uppercase tracking-wider text-zinc-500"
              >
                Specify Journey By
              </label>
              <select
                id="calcModeSelect"
                value={calcMode}
                onChange={(e) => setCalcMode(e.target.value as JourneyMode)}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:border-brass focus:outline-none"
              >
                <option value="shipTime">Time Experienced by Traveler (Ship Time Δt&prime;)</option>
                <option value="earthTime">Time Elapsed on Earth (Observer Time Δt)</option>
                <option value="distance">Destination Distance (Light-Years from Earth)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="calcValueInput"
                className="block text-[11px] uppercase tracking-wider text-zinc-500"
              >
                {calcMode === 'distance' ? 'Distance (Light-Years)' : 'Duration Value'}
              </label>
              <div className="flex gap-2">
                <input
                  id="calcValueInput"
                  type="number"
                  min={0.01}
                  step="any"
                  value={calcValue}
                  onChange={(e) => setCalcValue(e.target.value)}
                  className="flex-1 min-w-0 rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-sm text-zinc-100 focus:border-brass focus:outline-none"
                />
                {calcMode !== 'distance' ? (
                  <select
                    aria-label="Duration unit"
                    value={calcUnit}
                    onChange={(e) => setCalcUnit(e.target.value as DurationUnit)}
                    className="rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:border-brass focus:outline-none"
                  >
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                    <option value="years">Years</option>
                  </select>
                ) : (
                  <span className="inline-flex items-center px-2.5 font-mono text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 rounded">
                    ly
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                Famous Cosmic Destinations (One-Way Distance)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DESTINATIONS.map((dest) => {
                  const active =
                    calcMode === 'distance' && Math.abs(parsedCalcValue - dest.ly) < 0.001
                  return (
                    <button
                      key={dest.name}
                      type="button"
                      onClick={() => handleDestinationClick(dest.ly)}
                      className={`px-2 py-1 rounded font-mono text-[11px] transition-colors border ${
                        active
                          ? 'border-brass bg-brass/10 text-brass'
                          : 'border-zinc-700 text-zinc-400 hover:text-brass'
                      }`}
                    >
                      {dest.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 grid sm:grid-cols-3 gap-3">
            <div className="bg-zinc-950/70 border border-zinc-800 border-l-2 border-l-rose-400 rounded-lg p-4 flex flex-col justify-between">
              <span className="text-[11px] uppercase tracking-wider text-zinc-500">
                Traveler Experiences
              </span>
              <div className="font-mono tabular-nums text-2xl font-bold text-rose-400 my-2">
                {formatHumanDuration(journey.shipYears)}
              </div>
              <span className="font-mono text-[11px] text-zinc-500">
                Proper time aboard spacecraft
              </span>
            </div>

            <div className="bg-zinc-950/70 border border-zinc-800 border-l-2 border-l-sky-400 rounded-lg p-4 flex flex-col justify-between">
              <span className="text-[11px] uppercase tracking-wider text-zinc-500">
                Earth Observer Waits
              </span>
              <div className="font-mono tabular-nums text-2xl font-bold text-sky-400 my-2">
                {formatHumanDuration(journey.earthYears)}
              </div>
              <span className="font-mono text-[11px] text-zinc-500">
                Dilated time passed on Earth
              </span>
            </div>

            <div className="bg-zinc-950/70 border border-zinc-800 border-l-2 border-l-brass rounded-lg p-4 flex flex-col justify-between">
              <span className="text-[11px] uppercase tracking-wider text-zinc-500">
                Twin Age Difference
              </span>
              <div className="font-mono tabular-nums text-2xl font-bold text-brass my-2">
                {Number.isFinite(journey.diffYears)
                  ? `+${formatHumanDuration(journey.diffYears)}`
                  : '∞'}
              </div>
              <span className="font-mono text-[11px] text-zinc-500">
                Distance covered: {formatDistanceLy(journey.distanceLy)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg px-4 py-2.5 text-center font-mono text-xs text-zinc-500">
          Relativistic Formula:{' '}
          <span className="text-zinc-300">
            Δt<sub>observer</sub> = Δt<sub>traveler</sub> / √(1 − v²/c²)
          </span>
          <span className="mx-3 text-zinc-700">|</span>
          Current Calculation:{' '}
          <span className="text-brass">Δt = Δt&prime; × {gamma.toFixed(3)}</span>
        </div>
      </section>

      <p className="text-xs text-zinc-600 max-w-3xl">
        Calculations model special relativity at constant velocity in flat spacetime (inertial
        frames). A physical turnaround in the Twin Paradox or launch from Earth involves proper
        acceleration, and visual renderings illustrate geometric Lorentz contraction (
        <span className="font-mono">L = L₀ / γ</span>) without relativistic Doppler shift or optical
        Terrell rotation.
      </p>
    </div>
  )
}

function betaFromCap(maxGamma: number): number {
  return Math.sqrt(1 - 1 / (maxGamma * maxGamma))
}
