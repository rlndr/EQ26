import type { FlybyTrack, Vec3Km } from './parse'
import { LUNAR_DISTANCE_KM } from './scale'

export type DistanceMode = 'log' | 'linear'

const EARTH_RADIUS_KM = 6371
const PLAY_SECONDS = 16
const LOG_RINGS_LD = [1, 5, 20]

/** Radius on the diagram. Log squeezes distance; direction is left alone in both modes. */
export function compressRadius(km: number, mode: DistanceMode) {
  return mode === 'log' ? Math.log10(1 + km / EARTH_RADIUS_KM) : km
}

export function compressVector(p: Vec3Km, mode: DistanceMode): Vec3Km {
  const r = Math.hypot(p[0], p[1], p[2])
  if (r === 0) return [0, 0, 0]
  const scale = compressRadius(r, mode) / r
  return [p[0] * scale, p[1] * scale, p[2] * scale]
}

export const closestIndex = (path: Vec3Km[]) => {
  let best = 0
  let bestR = Infinity
  path.forEach((p, i) => {
    const r = Math.hypot(p[0], p[1], p[2])
    if (r < bestR) {
      bestR = r
      best = i
    }
  })
  return best
}

export function samplePath(path: Vec3Km[], at: number): Vec3Km {
  const last = path.length - 1
  const clamped = Math.min(last, Math.max(0, at))
  const i = Math.floor(clamped)
  const j = Math.min(last, i + 1)
  const f = clamped - i
  return [
    path[i][0] + (path[j][0] - path[i][0]) * f,
    path[i][1] + (path[j][1] - path[i][1]) * f,
    path[i][2] + (path[j][2] - path[i][2]) * f,
  ]
}

/** Speed relative to Earth from neighbouring samples, km/s */
export function speedAt(path: Vec3Km[], at: number, stepHours: number) {
  const i = Math.min(path.length - 2, Math.max(0, Math.floor(at)))
  if (i < 0 || path.length < 2) return 0
  const a = path[i]
  const b = path[i + 1]
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / (stepHours * 3600)
}

export interface FlybyTick {
  fraction: number
  t: number
  distanceKm: number
  speedKms: number
}

/**
 * The flyby diagram: Earth at the centre, the Moon's real path, and the object's real path, all from
 * JPL Horizons. Orthographic, drawn on Canvas 2D. Lives outside React like the globe.
 */
export class FlybyStage {
  readonly el: HTMLElement
  readonly canvas: HTMLCanvasElement
  onTick: (tick: FlybyTick) => void = () => {}
  onPlayingChange: (playing: boolean) => void = () => {}

  private ctx: CanvasRenderingContext2D | null
  private ro: ResizeObserver
  private io: IntersectionObserver
  private motionQuery: MediaQueryList
  private reducedMotion: boolean
  private raf = 0
  private last = 0
  private onScreen = true
  private dirty = true
  private width = 1
  private height = 1

  private track: FlybyTrack | null = null
  private label = ''
  private closest = 0
  private at = 0
  private playing = false
  private mode: DistanceMode = 'log'
  private yaw = -0.7
  private tilt = 0.55
  private dragging: { x: number; y: number } | null = null

  constructor(el: HTMLElement, canvas: HTMLCanvasElement) {
    this.el = el
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false })
    canvas.style.touchAction = 'none'
    canvas.style.cursor = 'grab'
    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    this.reducedMotion = this.motionQuery.matches
    this.motionQuery.addEventListener('change', this.applyMotion)
    this.resize()
    this.ro = new ResizeObserver(this.resize)
    this.ro.observe(el)
    this.io = new IntersectionObserver((entries) => {
      this.onScreen = entries[entries.length - 1].isIntersecting
      this.dirty = true
    })
    this.io.observe(el)
    canvas.addEventListener('pointerdown', this.onDown)
    canvas.addEventListener('pointermove', this.onMove)
    canvas.addEventListener('pointerup', this.onUp)
    canvas.addEventListener('pointercancel', this.onUp)
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.loop)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.io.disconnect()
    this.motionQuery.removeEventListener('change', this.applyMotion)
    this.canvas.removeEventListener('pointerdown', this.onDown)
    this.canvas.removeEventListener('pointermove', this.onMove)
    this.canvas.removeEventListener('pointerup', this.onUp)
    this.canvas.removeEventListener('pointercancel', this.onUp)
    this.onTick = () => {}
    this.onPlayingChange = () => {}
  }

  setTrack(track: FlybyTrack | null, label: string) {
    this.track = track
    this.label = label
    this.closest = track ? closestIndex(track.object) : 0
    this.setPlaying(false)
    if (track && !this.reducedMotion) {
      this.at = 0
      this.setPlaying(true)
    } else {
      this.at = this.closest
    }
    this.dirty = true
    this.tick()
  }

  setMode(mode: DistanceMode) {
    this.mode = mode
    this.dirty = true
  }

  togglePlay() {
    if (!this.track) return
    if (this.playing) {
      this.setPlaying(false)
      return
    }
    if (this.at >= this.track.object.length - 1) this.at = 0
    this.setPlaying(true)
  }

  setFraction(fraction: number) {
    if (!this.track) return
    this.setPlaying(false)
    this.at = fraction * (this.track.object.length - 1)
    this.dirty = true
    this.tick()
  }

  private setPlaying(playing: boolean) {
    if (this.playing === playing) return
    this.playing = playing
    this.onPlayingChange(playing)
  }

  private tick() {
    const track = this.track
    if (!track) return
    const last = track.object.length - 1
    const p = samplePath(track.object, this.at)
    this.onTick({
      fraction: last > 0 ? this.at / last : 0,
      t: track.startMs + this.at * track.stepHours * 3_600_000,
      distanceKm: Math.hypot(p[0], p[1], p[2]),
      speedKms: speedAt(track.object, this.at, track.stepHours),
    })
  }

  private applyMotion = () => {
    this.reducedMotion = this.motionQuery.matches
    if (this.reducedMotion) this.setPlaying(false)
    this.dirty = true
  }

  private resize = () => {
    const w = Math.max(1, this.el.clientWidth)
    const h = Math.max(1, this.el.clientHeight)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.width = w
    this.height = h
    const bw = Math.round(w * dpr)
    const bh = Math.round(h * dpr)
    if (this.canvas.width !== bw) this.canvas.width = bw
    if (this.canvas.height !== bh) this.canvas.height = bh
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.dirty = true
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min((now - this.last) / 1000, 0.1)
    this.last = now
    if (!this.onScreen || !this.ctx) return
    if (this.playing && this.track) {
      const last = this.track.object.length - 1
      this.at = Math.min(last, this.at + (last / PLAY_SECONDS) * dt)
      if (this.at >= last) this.setPlaying(false)
      this.tick()
      this.dirty = true
    }
    if (!this.dirty) return
    this.dirty = false
    this.draw(this.ctx)
  }

  /** The scale that fits what matters for this object in the current mode */
  private extent(track: FlybyTrack) {
    if (this.mode === 'log') {
      return Math.max(...track.object.map((p) => compressRadius(Math.hypot(p[0], p[1], p[2]), 'log')))
    }
    const closestKm = Math.hypot(...track.object[this.closest])
    return Math.max(LUNAR_DISTANCE_KM * 1.3, closestKm * 1.5)
  }

  private project(p: Vec3Km, scale: number): [number, number] {
    const [x, y, z] = compressVector(p, this.mode)
    const cos = Math.cos(this.yaw)
    const sin = Math.sin(this.yaw)
    const rx = x * cos - y * sin
    const ry = x * sin + y * cos
    const sy = z * Math.cos(this.tilt) - ry * Math.sin(this.tilt)
    return [this.width / 2 + rx * scale, this.height / 2 - sy * scale]
  }

  private strokePath(ctx: CanvasRenderingContext2D, path: Vec3Km[], scale: number, from: number, to: number) {
    ctx.beginPath()
    const end = Math.min(path.length - 1, Math.ceil(to))
    for (let i = from; i <= end; i++) {
      const [x, y] = this.project(i > to ? samplePath(path, to) : path[i], scale)
      if (i === from) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  private draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#050507'
    ctx.fillRect(0, 0, this.width, this.height)
    const track = this.track
    if (!track) return

    const scale = (Math.min(this.width, this.height) / 2) * 0.9 / this.extent(track)
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'left'

    // Reference rings in the ecliptic plane, in lunar distances
    for (const ld of this.mode === 'log' ? LOG_RINGS_LD : [1]) {
      const r = ld * LUNAR_DISTANCE_KM
      ctx.strokeStyle = 'rgba(161,161,170,0.22)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 0; i <= 72; i++) {
        const a = (i / 72) * Math.PI * 2
        const [x, y] = this.project([Math.cos(a) * r, Math.sin(a) * r, 0], scale)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      const [lx, ly] = this.project([r, 0, 0], scale)
      ctx.fillStyle = 'rgba(161,161,170,0.7)'
      ctx.fillText(`${ld} LD`, lx + 4, ly)
    }

    if (track.moon.length > 1) {
      ctx.strokeStyle = 'rgba(212,212,216,0.55)'
      ctx.lineWidth = 1.2
      this.strokePath(ctx, track.moon, scale, 0, track.moon.length - 1)
      const moon = this.project(samplePath(track.moon, this.at), scale)
      ctx.fillStyle = '#e4e4e7'
      ctx.beginPath()
      ctx.arc(moon[0], moon[1], 3.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#a1a1aa'
      ctx.fillText('Moon', moon[0] + 7, moon[1] + 4)
    }

    // Earth is drawn to the diagram's scale, with a floor so it stays visible when linear
    const earthR = Math.max(4.5, compressRadius(EARTH_RADIUS_KM, this.mode) * scale)
    const [ex, ey] = [this.width / 2, this.height / 2]
    const body = ctx.createRadialGradient(ex - earthR * 0.3, ey - earthR * 0.3, earthR * 0.1, ex, ey, earthR)
    body.addColorStop(0, '#7dd3fc')
    body.addColorStop(1, '#1d4ed8')
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.arc(ex, ey, earthR, 0, Math.PI * 2)
    ctx.fill()

    // The whole path faint, the part already travelled bright
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(56,189,248,0.28)'
    ctx.lineWidth = 1.2
    this.strokePath(ctx, track.object, scale, 0, track.object.length - 1)
    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 2
    this.strokePath(ctx, track.object, scale, 0, this.at)

    const near = this.project(track.object[this.closest], scale)
    ctx.strokeStyle = '#d8b553'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.arc(near[0], near[1], 6, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#d8b553'
    // To the left, because the Moon's label sits to the right of the Moon and they can meet
    ctx.textAlign = 'right'
    ctx.fillText('Closest', near[0] - 9, near[1] - 6)
    ctx.textAlign = 'left'

    const here = this.project(samplePath(track.object, this.at), scale)
    const glow = ctx.createRadialGradient(here[0], here[1], 0, here[0], here[1], 13)
    glow.addColorStop(0, 'rgba(255,255,255,0.95)')
    glow.addColorStop(0.3, 'rgba(56,189,248,0.7)')
    glow.addColorStop(1, 'rgba(56,189,248,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(here[0], here[1], 13, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#e4e4e7'
    ctx.fillText(this.label, here[0] + 12, here[1] + 4)
  }

  private onDown = (ev: PointerEvent) => {
    this.canvas.setPointerCapture(ev.pointerId)
    this.dragging = { x: ev.clientX, y: ev.clientY }
    this.canvas.style.cursor = 'grabbing'
  }

  private onMove = (ev: PointerEvent) => {
    if (!this.dragging) return
    this.yaw += (ev.clientX - this.dragging.x) * 0.008
    this.tilt = Math.max(-1.45, Math.min(1.45, this.tilt + (ev.clientY - this.dragging.y) * 0.008))
    this.dragging = { x: ev.clientX, y: ev.clientY }
    this.dirty = true
  }

  private onUp = () => {
    this.dragging = null
    this.canvas.style.cursor = 'grab'
  }
}
