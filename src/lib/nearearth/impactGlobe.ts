import { clamp, latLonToVec, wrap180 } from '../aurora/astro'
import {
  DEFAULT_DIST, ease, lerpLon, MAX_DIST, MAX_ORBIT_LAT, MIN_DIST, orbitPose, projectPoint, viewTangents, type OrbitState,
} from '../aurora/camera'
import { createProgram, glBackingSize, PIXEL_BUDGET } from '../screenripper/gl'
import type { LocatedFireball, MarkerData } from './markers'
import EARTH_FRAG from './earth.frag.glsl?raw'
import MARKERS_FRAG from './markers.frag.glsl?raw'
import MARKERS_VERT from './markers.vert.glsl?raw'

export interface HoveredFireball {
  event: LocatedFireball
  /** Canvas-relative CSS pixels */
  x: number
  y: number
}

export const PLAY_SECONDS = 40
const INTRO_SECONDS = 14
const FLY_SECONDS = 1.2
/** How long a fireball's flash lasts on screen while playing */
const FLARE_SECONDS = 0.9
/** Flash width while still or scrubbing, as a fraction of the timeline */
const FLARE_RESTING = 0.004
const AUTO_SPIN_DEG_PER_S = 2.4
const INERTIA_DECAY = 3.2
const CLICK_SLOP_PX = 5
const PICK_RADIUS_PX = 16
const STEP_SECONDS = 0.8
const REDUCED_STEPS = 38

const TEX_DAY = 0
const DAY_URL = '/aurora/earth-day.webp'

/**
 * The fireball globe. Lives outside React like the Aurora Watch globe, reporting only discrete
 * changes through callbacks. It makes its own canvas because dispose() gives up the WebGL context,
 * and a canvas can only ever hold one.
 */
export class ImpactGlobe {
  readonly el: HTMLElement
  readonly canvas: HTMLCanvasElement
  failed = false

  onHover: (hovered: HoveredFireball | null) => void = () => {}
  onSelect: (event: LocatedFireball | null) => void = () => {}
  /** Every frame the timeline moves, so the scrubber can be written directly */
  onCursor: (fraction: number) => void = () => {}
  onPlayingChange: (playing: boolean) => void = () => {}
  onFailure: () => void = () => {}

  private gl: WebGL2RenderingContext | null = null
  private earth: WebGLProgram | null = null
  private points: WebGLProgram | null = null
  private earthVao: WebGLVertexArrayObject | null = null
  private pointsVao: WebGLVertexArrayObject | null = null
  private buffers: WebGLBuffer[] = []
  private textures: WebGLTexture[] = []
  private locations = new Map<string, WebGLUniformLocation | null>()
  private glLost = false
  private maxPoint = 64
  private dayImage: HTMLImageElement | null = null

  private ro: ResizeObserver
  private io: IntersectionObserver
  private motionQuery: MediaQueryList
  private reducedMotion: boolean
  private raf = 0
  private last = 0
  private time = 0
  private onScreen = true
  private dirty = true
  private disposed = false

  private markers: MarkerData | null = null
  private cursor = 1
  /** Timeline fractions per second while playing; 0 when still */
  private rate = 0
  private stepTimer = 0
  private range: [number, number] = [0, 1]
  private minEnergy = 0
  private selected: LocatedFireball | null = null

  private orbit: OrbitState = { lat: 22, lon: 30, dist: DEFAULT_DIST }
  private velLat = 0
  private velLon = 0
  private spinning: boolean
  private fly: { from: OrbitState; to: OrbitState; t: number } | null = null

  private pointers = new Map<number, { x: number; y: number }>()
  private drag: { startX: number; startY: number; moved: boolean; lastT: number } | null = null
  private pinchDist = 0
  private hoverAt: { x: number; y: number } | null = null
  private hoverDirty = false

  constructor(el: HTMLElement) {
    this.el = el
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'absolute inset-0 w-full h-full block outline-none'
    this.canvas.tabIndex = 0
    this.canvas.setAttribute('role', 'application')
    this.canvas.setAttribute('aria-label', 'Globe of recorded fireballs. Arrow keys rotate, plus and minus zoom. The largest events are listed below.')
    this.canvas.style.touchAction = 'none'
    this.canvas.style.cursor = 'grab'
    el.prepend(this.canvas)

    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    this.reducedMotion = this.motionQuery.matches
    this.spinning = !this.reducedMotion
    this.motionQuery.addEventListener('change', this.applyMotion)

    this.resize()
    this.ro = new ResizeObserver(this.resize)
    this.ro.observe(el)
    this.io = new IntersectionObserver((entries) => {
      this.onScreen = entries[entries.length - 1].isIntersecting
      this.dirty = true
    })
    this.io.observe(el)

    this.canvas.addEventListener('webglcontextlost', this.onContextLost)
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored)
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointercancel', this.onPointerUp)
    this.canvas.addEventListener('pointerleave', this.onPointerLeave)
    this.canvas.addEventListener('keydown', this.onKeyDown)
    // Not passive: Ctrl+wheel must be stopped from zooming the whole page
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false })

    this.gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false })
    if (!this.gl) {
      this.fail('WebGL2 is not available')
      return
    }
    try {
      this.initGl()
    } catch (err) {
      this.fail(err)
      return
    }
    void this.loadImages()
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.loop)
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.io.disconnect()
    this.motionQuery.removeEventListener('change', this.applyMotion)
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerUp)
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave)
    this.canvas.removeEventListener('keydown', this.onKeyDown)
    this.canvas.removeEventListener('wheel', this.onWheel)
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext()
    this.canvas.remove()
    this.onHover = () => {}
    this.onSelect = () => {}
    this.onCursor = () => {}
    this.onPlayingChange = () => {}
    this.onFailure = () => {}
  }

  // --- Commands from the page --------------------------------------------------

  setMarkers(markers: MarkerData) {
    const first = this.markers === null
    this.markers = markers
    this.uploadMarkers()
    if (first && !this.reducedMotion) this.startPlaying(0, INTRO_SECONDS)
    else this.onCursor(this.cursor)
    this.dirty = true
  }

  togglePlay() {
    if (this.rate > 0) {
      this.stopPlaying()
    } else {
      // Finished, or nothing left to play: start again from the beginning
      this.startPlaying(this.cursor >= 1 ? 0 : this.cursor, PLAY_SECONDS)
    }
  }

  setCursor(fraction: number) {
    this.stopPlaying()
    this.cursor = clamp(fraction, 0, 1)
    this.hoverDirty = true
    this.dirty = true
    this.onCursor(this.cursor)
  }

  /** Limit the globe to part of the timeline, for a year picked on the histogram */
  setRange(from: number, to: number) {
    // The page also calls this when the data first arrives, which must not cancel the intro
    if (from === this.range[0] && to === this.range[1]) return
    this.range = [from, to]
    this.stopPlaying()
    this.cursor = 1
    this.onCursor(1)
    this.hoverDirty = true
    this.dirty = true
  }

  setMinEnergy(level: number) {
    this.minEnergy = level
    this.hoverDirty = true
    this.dirty = true
  }

  setSelected(event: LocatedFireball | null) {
    this.selected = event
    this.dirty = true
  }

  flyTo(lat: number, lon: number, dist = this.orbit.dist) {
    this.spinning = false
    this.velLat = 0
    this.velLon = 0
    const to = { lat: clamp(lat, -MAX_ORBIT_LAT, MAX_ORBIT_LAT), lon: wrap180(lon), dist: clamp(dist, MIN_DIST, MAX_DIST) }
    if (this.reducedMotion) {
      this.orbit = to
      this.dirty = true
    } else {
      this.fly = { from: { ...this.orbit }, to, t: 0 }
    }
  }

  zoomBy(factor: number) {
    this.spinning = false
    this.fly = null
    this.orbit.dist = clamp(this.orbit.dist * factor, MIN_DIST, MAX_DIST)
    this.dirty = true
  }

  /** Development aid: a GPU reset, then restore after `ms` */
  debugLoseContext(ms = 1000) {
    const ext = this.gl?.getExtension('WEBGL_lose_context')
    if (!ext) return
    ext.loseContext()
    setTimeout(() => ext.restoreContext(), ms)
  }

  debugState() {
    return { cursor: this.cursor, playing: this.rate > 0, orbit: { ...this.orbit }, markers: this.markers?.events.length ?? 0, failed: this.failed, range: this.range }
  }

  // --- Playback ----------------------------------------------------------------

  private startPlaying(from: number, seconds: number) {
    this.cursor = from
    this.rate = 1 / seconds
    this.stepTimer = 0
    this.onPlayingChange(true)
    this.dirty = true
  }

  private stopPlaying() {
    if (this.rate === 0) return
    this.rate = 0
    this.onPlayingChange(false)
    this.dirty = true
  }

  private advance(dt: number) {
    if (this.rate === 0) return
    if (this.reducedMotion) {
      // No continuous motion: jump a year at a time
      this.stepTimer += dt
      if (this.stepTimer < STEP_SECONDS) return
      this.stepTimer = 0
      this.cursor = Math.min(1, this.cursor + 1 / REDUCED_STEPS)
    } else {
      this.cursor = Math.min(1, this.cursor + this.rate * dt)
    }
    this.onCursor(this.cursor)
    this.dirty = true
    if (this.cursor >= 1) this.stopPlaying()
  }

  // --- GL ----------------------------------------------------------------------

  private initGl() {
    const gl = this.gl
    if (!gl) return
    this.locations.clear()
    this.earth = createProgram(gl, EARTH_FRAG)
    this.points = createProgram(gl, MARKERS_FRAG, MARKERS_VERT)
    this.earthVao = gl.createVertexArray()
    this.pointsVao = gl.createVertexArray()
    this.buffers = [gl.createBuffer(), gl.createBuffer(), gl.createBuffer()]
    this.textures = [gl.createTexture()]
    this.maxPoint = (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array)[1]

    this.solidTexture(TEX_DAY, [10, 18, 36, 255])
    if (this.dayImage) this.uploadImage(TEX_DAY, this.dayImage)

    gl.blendFunc(gl.ONE, gl.ONE)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    this.uploadMarkers()
  }

  private solidTexture(slot: number, rgba: number[]) {
    const gl = this.gl
    if (!gl) return
    gl.activeTexture(gl.TEXTURE0 + slot)
    gl.bindTexture(gl.TEXTURE_2D, this.textures[slot])
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, Uint8Array.from(rgba))
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  private uploadImage(slot: number, image: HTMLImageElement) {
    const gl = this.gl
    if (!gl || this.glLost) return
    gl.activeTexture(gl.TEXTURE0 + slot)
    gl.bindTexture(gl.TEXTURE_2D, this.textures[slot])
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    this.dirty = true
  }

  private async loadImages() {
    const load = async (url: string) => {
      const image = new Image()
      image.src = url
      await image.decode()
      return image
    }
    try {
      this.dayImage = await load(DAY_URL)
      if (this.disposed) return
      this.uploadImage(TEX_DAY, this.dayImage)
    } catch (err) {
      console.warn('Near Earth: could not load the Earth maps', err)
    }
  }

  private uploadMarkers() {
    const gl = this.gl
    if (!gl || this.glLost || !this.markers || !this.pointsVao) return
    gl.bindVertexArray(this.pointsVao)
    const attribute = (index: number, data: Float32Array, size: number) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[index])
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
      gl.enableVertexAttribArray(index)
      gl.vertexAttribPointer(index, size, gl.FLOAT, false, 0, 0)
    }
    attribute(0, this.markers.positions, 3)
    attribute(1, this.markers.times, 1)
    attribute(2, this.markers.energies, 1)
    gl.bindVertexArray(null)
  }

  private fail(reason: unknown) {
    console.error('Near Earth: the globe could not start', reason)
    this.failed = true
    this.canvas.style.display = 'none'
    queueMicrotask(() => this.onFailure())
  }

  private onContextLost = (ev: Event) => {
    ev.preventDefault()
    this.glLost = true
    this.earth = null
    this.points = null
  }

  private onContextRestored = () => {
    this.glLost = false
    try {
      this.initGl()
      this.dirty = true
    } catch (err) {
      this.fail(err)
    }
  }

  private applyMotion = () => {
    this.reducedMotion = this.motionQuery.matches
    if (this.reducedMotion) this.spinning = false
    this.dirty = true
  }

  private resize = () => {
    const w = this.el.clientWidth
    const h = this.el.clientHeight
    const dpr = window.devicePixelRatio || 1
    const size = glBackingSize(w, h, dpr, PIXEL_BUDGET)
    if (this.canvas.width !== size.w) this.canvas.width = size.w
    if (this.canvas.height !== size.h) this.canvas.height = size.h
    this.gl?.viewport(0, 0, size.w, size.h)
    this.dirty = true
  }

  // --- Frame -------------------------------------------------------------------

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min((now - this.last) / 1000, 0.25)
    this.last = now
    if (!this.onScreen || !this.gl || this.glLost || !this.earth || !this.points) return

    this.advance(dt)
    this.updateCamera(dt)
    if (!this.reducedMotion) this.time += dt
    if (this.hoverDirty) this.reportHover()

    // A selection ring keeps pulsing, and a turning globe needs every frame
    const animating = !this.reducedMotion && (this.spinning || this.selected !== null)
    if (!animating && !this.dirty) return
    this.dirty = false
    this.draw()
  }

  private updateCamera(dt: number) {
    if (this.fly) {
      const f = this.fly
      f.t = Math.min(1, f.t + dt / FLY_SECONDS)
      const e = ease(f.t)
      this.orbit.lat = f.from.lat + (f.to.lat - f.from.lat) * e
      this.orbit.lon = lerpLon(f.from.lon, f.to.lon, e)
      this.orbit.dist = f.from.dist + (f.to.dist - f.from.dist) * e
      if (f.t >= 1) this.fly = null
      this.dirty = true
    } else if (!this.drag) {
      if (this.spinning) this.orbit.lon = wrap180(this.orbit.lon - AUTO_SPIN_DEG_PER_S * dt)
      if (this.velLat !== 0 || this.velLon !== 0) {
        this.orbit.lat = clamp(this.orbit.lat + this.velLat * dt, -MAX_ORBIT_LAT, MAX_ORBIT_LAT)
        this.orbit.lon = wrap180(this.orbit.lon + this.velLon * dt)
        const decay = Math.exp(-INERTIA_DECAY * dt)
        this.velLat *= decay
        this.velLon *= decay
        if (Math.abs(this.velLat) < 0.05 && Math.abs(this.velLon) < 0.05) {
          this.velLat = 0
          this.velLon = 0
        }
        this.dirty = true
      }
    }
  }

  private uniform(program: WebGLProgram, prefix: string, name: string) {
    const key = `${prefix}:${name}`
    if (!this.locations.has(key) && this.gl) this.locations.set(key, this.gl.getUniformLocation(program, name))
    return this.locations.get(key) ?? null
  }

  private draw() {
    const gl = this.gl
    if (!gl || !this.earth || !this.points) return
    const pose = orbitPose(this.orbit.lat, this.orbit.lon, this.orbit.dist)
    const w = this.canvas.width
    const h = this.canvas.height
    const [tx, ty] = viewTangents(pose.fov, w / Math.max(1, h))

    const camera = (program: WebGLProgram, prefix: string) => {
      gl.uniform2f(this.uniform(program, prefix, 'uTan'), tx, ty)
      gl.uniform3fv(this.uniform(program, prefix, 'uCamPos'), pose.pos)
      gl.uniform3fv(this.uniform(program, prefix, 'uRight'), pose.right)
      gl.uniform3fv(this.uniform(program, prefix, 'uUp'), pose.up)
      gl.uniform3fv(this.uniform(program, prefix, 'uForward'), pose.forward)
    }

    gl.disable(gl.BLEND)
    gl.useProgram(this.earth)
    gl.bindVertexArray(this.earthVao)
    camera(this.earth, 'e')
    const eu = (name: string) => this.uniform(this.earth as WebGLProgram, 'e', name)
    gl.uniform2f(eu('uResolution'), w, h)
    gl.uniform1f(eu('uTexHeight'), 1800)
    gl.uniform1i(eu('uDay'), TEX_DAY)
    gl.uniform1f(eu('uTime'), this.time)
    gl.uniform1f(eu('uPinOn'), this.selected ? 1 : 0)
    gl.uniform3fv(eu('uPin'), this.selected ? latLonToVec(this.selected.lat, this.selected.lon) : [0, 1, 0])
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    if (!this.markers || this.markers.events.length === 0) return
    gl.enable(gl.BLEND)
    gl.useProgram(this.points)
    gl.bindVertexArray(this.pointsVao)
    camera(this.points, 'p')
    const pu = (name: string) => this.uniform(this.points as WebGLProgram, 'p', name)
    const moving = this.rate > 0 && !this.reducedMotion
    gl.uniform1f(pu('uCursor'), this.cursor)
    gl.uniform1f(pu('uFlareWidth'), moving ? this.rate * FLARE_SECONDS : FLARE_RESTING)
    gl.uniform1f(pu('uMinEnergy'), this.minEnergy)
    gl.uniform2f(pu('uRange'), this.range[0], this.range[1])
    // Markers grow a little as you zoom in, and match the drawing buffer's pixel density
    gl.uniform1f(pu('uPixelScale'), (h / 700) * Math.sqrt(DEFAULT_DIST / this.orbit.dist))
    gl.uniform1f(pu('uMaxPoint'), this.maxPoint)
    gl.drawArrays(gl.POINTS, 0, this.markers.events.length)
  }

  // --- Picking and input -------------------------------------------------------

  private nearestFireball(clientX: number, clientY: number): HoveredFireball | null {
    const markers = this.markers
    if (!markers) return null
    const rect = this.canvas.getBoundingClientRect()
    const aspect = rect.width / Math.max(1, rect.height)
    const pose = orbitPose(this.orbit.lat, this.orbit.lon, this.orbit.dist)
    const x = clientX - rect.left
    const y = clientY - rect.top
    let best: HoveredFireball | null = null
    let bestDist = PICK_RADIUS_PX
    markers.events.forEach((event, i) => {
      const t = markers.times[i]
      if (t > this.cursor || t < this.range[0] || t > this.range[1] || markers.energies[i] < this.minEnergy) return
      const p: [number, number, number] = [markers.positions[i * 3], markers.positions[i * 3 + 1], markers.positions[i * 3 + 2]]
      if (p[0] * pose.pos[0] + p[1] * pose.pos[1] + p[2] * pose.pos[2] <= 1) return
      const screen = projectPoint(pose, p, aspect)
      if (!screen) return
      const sx = ((screen[0] + 1) / 2) * rect.width
      const sy = ((1 - screen[1]) / 2) * rect.height
      const dist = Math.hypot(sx - x, sy - y)
      if (dist < bestDist) {
        bestDist = dist
        best = { event, x: sx, y: sy }
      }
    })
    return best
  }

  private reportHover() {
    this.hoverDirty = false
    if (!this.hoverAt) {
      this.onHover(null)
      return
    }
    const hovered = this.nearestFireball(this.hoverAt.x, this.hoverAt.y)
    this.canvas.style.cursor = this.drag ? 'grabbing' : hovered ? 'pointer' : 'grab'
    this.onHover(hovered)
  }

  private currentPinchDistance() {
    const [a, b] = [...this.pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  private onPointerDown = (ev: PointerEvent) => {
    this.canvas.setPointerCapture(ev.pointerId)
    this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
    this.fly = null
    this.spinning = false
    this.velLat = 0
    this.velLon = 0
    if (this.pointers.size === 1) {
      this.drag = { startX: ev.clientX, startY: ev.clientY, moved: false, lastT: performance.now() }
      this.canvas.style.cursor = 'grabbing'
    } else if (this.pointers.size === 2) {
      this.pinchDist = this.currentPinchDistance()
      if (this.drag) this.drag.moved = true
    }
  }

  private onPointerMove = (ev: PointerEvent) => {
    const known = this.pointers.get(ev.pointerId)
    if (!known) {
      this.hoverAt = { x: ev.clientX, y: ev.clientY }
      this.hoverDirty = true
      return
    }
    const dx = ev.clientX - known.x
    const dy = ev.clientY - known.y
    known.x = ev.clientX
    known.y = ev.clientY

    if (this.pointers.size === 2) {
      const dist = this.currentPinchDistance()
      if (this.pinchDist > 0) {
        this.orbit.dist = clamp(this.orbit.dist * (this.pinchDist / dist), MIN_DIST, MAX_DIST)
        this.dirty = true
      }
      this.pinchDist = dist
      return
    }
    if (!this.drag) return
    if (Math.hypot(ev.clientX - this.drag.startX, ev.clientY - this.drag.startY) > CLICK_SLOP_PX) this.drag.moved = true
    if (!this.drag.moved) return

    const degPerPx = (120 / Math.max(1, this.canvas.clientHeight)) * (this.orbit.dist - 0.85) / 2
    const dLon = -dx * degPerPx
    const dLat = dy * degPerPx
    this.orbit.lon = wrap180(this.orbit.lon + dLon)
    this.orbit.lat = clamp(this.orbit.lat + dLat, -MAX_ORBIT_LAT, MAX_ORBIT_LAT)
    const now = performance.now()
    const elapsed = Math.max(0.001, (now - this.drag.lastT) / 1000)
    this.drag.lastT = now
    this.velLon = this.velLon * 0.6 + (dLon / elapsed) * 0.4
    this.velLat = this.velLat * 0.6 + (dLat / elapsed) * 0.4
    this.dirty = true
  }

  private onPointerUp = (ev: PointerEvent) => {
    this.pointers.delete(ev.pointerId)
    if (this.pointers.size > 0) return
    const drag = this.drag
    this.drag = null
    this.canvas.style.cursor = 'grab'
    if (!drag) return
    if (drag.moved) {
      // A drag that stopped before letting go should not fling the globe
      if (performance.now() - drag.lastT > 80) {
        this.velLat = 0
        this.velLon = 0
      }
      return
    }
    this.velLat = 0
    this.velLon = 0
    if (ev.type !== 'pointerup') return
    this.onSelect(this.nearestFireball(ev.clientX, ev.clientY)?.event ?? null)
  }

  private onPointerLeave = () => {
    this.hoverAt = null
    this.hoverDirty = true
  }

  private onWheel = (ev: WheelEvent) => {
    // A plain wheel keeps scrolling the page
    if (!ev.ctrlKey) return
    ev.preventDefault()
    this.zoomBy(Math.exp(ev.deltaY * 0.004))
  }

  private onKeyDown = (ev: KeyboardEvent) => {
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return
    const step = 6
    let handled = true
    if (ev.key === 'ArrowLeft') this.orbit.lon = wrap180(this.orbit.lon - step)
    else if (ev.key === 'ArrowRight') this.orbit.lon = wrap180(this.orbit.lon + step)
    else if (ev.key === 'ArrowUp') this.orbit.lat = clamp(this.orbit.lat + step, -MAX_ORBIT_LAT, MAX_ORBIT_LAT)
    else if (ev.key === 'ArrowDown') this.orbit.lat = clamp(this.orbit.lat - step, -MAX_ORBIT_LAT, MAX_ORBIT_LAT)
    else if (ev.key === '+' || ev.key === '=') this.zoomBy(0.88)
    else if (ev.key === '-' || ev.key === '_') this.zoomBy(1 / 0.88)
    else handled = false
    if (handled) {
      ev.preventDefault()
      this.spinning = false
      this.dirty = true
    }
  }
}
