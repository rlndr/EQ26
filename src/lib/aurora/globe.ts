import { clamp, latLonToVec, moonIllumination, subLunarPoint, subSolarPoint, wrap180, type LatLon } from './astro'
import {
  DEFAULT_DIST, ease, flightPose, groundPose, lerpLon, localAxes, MAX_DIST, MAX_ORBIT_LAT, MIN_DIST, orbitPose, pickSurface, viewTangents,
  type GroundState, type OrbitState, type Pose,
} from './camera'
import { POLE_AXIS, POLE_U1, POLE_U2 } from './geomag'
import { brightnessField, GRID_CELLS, GRID_H, GRID_W, lowestLitLatitude, newField, sampleField, strongestInDarkness, type AuroraField } from './grid'
import { makeNoiseTexture } from './noise'
import { createProgram, glBackingSize, PIXEL_BUDGET } from '../screenripper/gl'
import FRAG from './globe.frag.glsl?raw'

export interface HoverInfo extends LatLon {
  percent: number
}

export type GlobeMode = 'orbit' | 'descending' | 'ground' | 'ascending'

/** Quality tiers, tried in order: fewer ray-march steps first, then a smaller drawing buffer */
const TIERS = [
  { steps: 34, pixels: 1 },
  { steps: 26, pixels: 0.8 },
  { steps: 18, pixels: 0.6 },
  { steps: 12, pixels: 0.42 },
  { steps: 9, pixels: 0.28 },
]
/** Average frame time over a sample that triggers dropping a tier */
const SLOW_FRAME_S = 0.03
const SAMPLE_FRAMES = 30
const SAMPLE_SECONDS = 1.2
const AWAY_GAP_S = 1.5
const GROUND_STEP_FACTOR = 1.5

const DESCENT_SECONDS = 3.6
const ASCENT_SECONDS = 2.6
const FLY_SECONDS = 1.3
const FIELD_FADE_SECONDS = 3
/** Earth appears to turn eastward, about one revolution every two minutes */
const AUTO_SPIN_DEG_PER_S = 3
const INERTIA_DECAY = 3.2
const CLICK_SLOP_PX = 5
const TEX_DAY = 0
const TEX_NIGHT = 1
const TEX_NOISE = 2
const TEX_AURORA_A = 3
const TEX_AURORA_B = 4
const NOISE_SIZE = 256
const SHELL_EXAGGERATION = 2.5

const DAY_URL = '/aurora/earth-day.webp'
const NIGHT_URL = '/aurora/earth-night.webp'

interface PointerInfo {
  x: number
  y: number
}

/**
 * The WebGL globe. Like ScreenRipper's Stage it lives outside React: the animation loop, camera and
 * pointer handling never touch React state, and only discrete changes are reported back through
 * the `on...` callbacks.
 *
 * It creates its own canvas. A canvas can hold only one WebGL context for life, and dispose() gives
 * that context up, so a fresh mount (StrictMode mounts everything twice in development) must not
 * find itself holding a dead one.
 */
export class Globe {
  readonly el: HTMLElement
  readonly canvas: HTMLCanvasElement

  mode: GlobeMode = 'orbit'
  /** Set when WebGL2 is missing or the shader will not build; the page then shows its fallback */
  failed = false

  onHover: (info: HoverInfo | null) => void = () => {}
  onPick: (at: LatLon) => void = () => {}
  onModeChange: (mode: GlobeMode) => void = () => {}
  onFailure: () => void = () => {}
  /** Called every frame while on the ground, with the compass heading */
  onHeading: (heading: number) => void = () => {}

  private gl: WebGL2RenderingContext | null = null
  private glLost = false
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private textures: WebGLTexture[] = []
  private locations = new Map<string, WebGLUniformLocation | null>()
  private ro: ResizeObserver
  private io: IntersectionObserver
  private motionQuery: MediaQueryList
  private reducedMotion = false
  private raf = 0
  private last = 0
  private onScreen = true
  private dirty = true
  private time = 0

  private orbit: OrbitState = { lat: 58, lon: 10, dist: DEFAULT_DIST }
  private velLat = 0
  private velLon = 0
  private spinning = true
  private touched = false
  private fly: { from: OrbitState; to: OrbitState; t: number } | null = null
  private ground: GroundState = { lat: 0, lon: 0, heading: 0, pitch: 12 }
  /** Orbit to go back to on leaving the ground, and to descend from */
  private flightFrom: OrbitState = { ...this.orbit }
  private flightS = 0
  private pin: LatLon | null = null
  private headingTarget: number | null = null

  private field: AuroraField = newField()
  private brightnessBytes = new Uint8Array(GRID_CELLS)
  private mixAmount = 1
  private mixRate = 0
  private auroraBackSlot = TEX_AURORA_A
  private minLit = 90
  private previousMinLit = 90
  private aimed = false

  private previewTarget: number | null = null
  /** Eased offset from the real clock, so previewing another hour sweeps the Sun rather than jumping */
  private timeOffset = 0

  private pointers = new Map<number, PointerInfo>()
  private drag: { startX: number; startY: number; moved: boolean; lastT: number } | null = null
  private pinchDist = 0
  private hoverAt: PointerInfo | null = null
  private hoverDirty = false

  private tier = 0
  private budgetFactor = 1
  private sampleSum = 0
  private sampleCount = 0

  private dayImage: HTMLImageElement | null = null
  private nightImage: HTMLImageElement | null = null
  private disposed = false

  constructor(el: HTMLElement) {
    this.el = el
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'absolute inset-0 w-full h-full block outline-none'
    this.canvas.tabIndex = 0
    this.canvas.setAttribute('role', 'application')
    this.canvas.setAttribute('aria-label', 'Rotating globe showing the current aurora forecast. Arrow keys rotate, plus and minus zoom.')
    this.canvas.style.touchAction = 'none'
    this.canvas.style.cursor = 'grab'
    el.prepend(this.canvas)

    // Phones get a head start down the quality ladder and a smaller pixel budget
    if (window.matchMedia('(pointer: coarse)').matches) {
      this.tier = 1
      this.budgetFactor = 0.5
    }

    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    this.motionQuery.addEventListener('change', this.applyMotion)
    this.reducedMotion = this.motionQuery.matches
    if (this.reducedMotion) this.spinning = false

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
    // Browsers cap live WebGL contexts, and SPA navigation would otherwise leave old ones waiting on GC
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext()
    this.canvas.remove()
    this.onHover = () => {}
    this.onPick = () => {}
    this.onModeChange = () => {}
    this.onFailure = () => {}
    this.onHeading = () => {}
  }

  // --- Commands from the page --------------------------------------------------

  /** New aurora data. `fadeSeconds` of 0 applies it at once, for dragging a slider. */
  setField(field: AuroraField, fadeSeconds = FIELD_FADE_SECONDS) {
    this.field = field
    brightnessField(field, this.brightnessBytes)
    this.previousMinLit = this.mixAmount < 1 ? Math.min(this.minLit, this.previousMinLit) : this.minLit
    this.minLit = lowestLitLatitude(field)
    this.uploadAurora(fadeSeconds)
    this.hoverDirty = true
    this.dirty = true
    if (!this.aimed && !this.touched) this.aimAtStrongest(false)
  }

  setPin(at: LatLon | null) {
    this.pin = at
    this.dirty = true
  }

  /** Show the sky at another moment, or null for now */
  setPreviewTime(ms: number | null) {
    this.previewTarget = ms
    this.dirty = true
  }

  flyTo(lat: number, lon: number, dist = this.orbit.dist) {
    this.stopSpinning()
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

  /** Swing round to the brightest aurora currently in darkness */
  aimAtStrongest(animate = true) {
    const spot = strongestInDarkness(this.field, subSolarPoint(this.now()))
    if (!spot) return
    this.aimed = true
    const lat = Math.sign(spot.lat || 1) * clamp(Math.abs(spot.lat), 50, 72)
    if (animate) {
      this.flyTo(lat, spot.lon, DEFAULT_DIST)
    } else {
      this.orbit = { lat, lon: spot.lon + 20, dist: DEFAULT_DIST }
      this.dirty = true
    }
  }

  zoomBy(factor: number) {
    if (this.mode !== 'orbit') return
    this.stopSpinning()
    this.fly = null
    this.orbit.dist = clamp(this.orbit.dist * factor, MIN_DIST, MAX_DIST)
    this.dirty = true
  }

  /** Drop from orbit to stand at a location, looking along `heading` */
  enterGround(lat: number, lon: number, heading: number) {
    if (this.mode !== 'orbit') return
    this.stopSpinning()
    this.fly = null
    this.velLat = 0
    this.velLon = 0
    this.flightFrom = { ...this.orbit }
    this.ground = { lat, lon, heading, pitch: 24 }
    this.flightS = 0
    this.setMode('descending')
  }

  exitGround() {
    if (this.mode !== 'ground') return
    this.headingTarget = null
    this.setMode('ascending')
  }

  /** Standing somewhere else without going back up */
  moveGround(lat: number, lon: number, heading: number) {
    if (this.mode !== 'ground') return
    this.ground = { lat, lon, heading, pitch: this.ground.pitch }
    this.headingTarget = null
    this.dirty = true
  }

  /** Turn to face a compass bearing while on the ground */
  lookToward(heading: number) {
    if (this.mode !== 'ground') return
    if (this.reducedMotion) {
      this.ground.heading = heading
      this.dirty = true
    } else {
      this.headingTarget = heading
    }
  }

  /** Development aid: a GPU reset, then restore after `ms` */
  debugLoseContext(ms = 1000) {
    const ext = this.gl?.getExtension('WEBGL_lose_context')
    if (!ext) return
    ext.loseContext()
    setTimeout(() => ext.restoreContext(), ms)
  }

  /** Development aid: current camera and quality settings */
  debugState() {
    return { mode: this.mode, orbit: { ...this.orbit }, ground: { ...this.ground }, tier: this.tier, steps: TIERS[this.tier].steps, w: this.canvas.width, h: this.canvas.height, failed: this.failed }
  }

  // --- GL setup ----------------------------------------------------------------

  private initGl() {
    const gl = this.gl
    if (!gl) return
    this.locations.clear()
    this.program = createProgram(gl, FRAG)
    this.vao = gl.createVertexArray()
    this.textures = [gl.createTexture(), gl.createTexture(), gl.createTexture(), gl.createTexture(), gl.createTexture()]

    // Placeholders until the Earth maps arrive, so the sphere shows as a dark ball rather than an error
    this.solidTexture(TEX_DAY, [8, 14, 30, 255])
    this.solidTexture(TEX_NIGHT, [0, 0, 0, 255])

    gl.activeTexture(gl.TEXTURE0 + TEX_NOISE)
    gl.bindTexture(gl.TEXTURE_2D, this.textures[TEX_NOISE])
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, NOISE_SIZE, NOISE_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, makeNoiseTexture(NOISE_SIZE))
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    for (const slot of [TEX_AURORA_A, TEX_AURORA_B]) {
      gl.activeTexture(gl.TEXTURE0 + slot)
      gl.bindTexture(gl.TEXTURE_2D, this.textures[slot])
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, GRID_W, GRID_H, 0, gl.RED, gl.UNSIGNED_BYTE, this.brightnessBytes)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    }
    this.auroraBackSlot = TEX_AURORA_A
    this.mixAmount = 1
    this.mixRate = 0

    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    if (this.dayImage) this.uploadImage(TEX_DAY, this.dayImage)
    if (this.nightImage) this.uploadImage(TEX_NIGHT, this.nightImage)
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
      // Night first: it is smaller, and the night side is where the aurora is
      this.nightImage = await load(NIGHT_URL)
      if (this.disposed) return
      this.uploadImage(TEX_NIGHT, this.nightImage)
      this.dayImage = await load(DAY_URL)
      if (this.disposed) return
      this.uploadImage(TEX_DAY, this.dayImage)
    } catch (err) {
      // The globe still works as a dark ball with the aurora on it
      console.warn('Aurora Watch: could not load the Earth maps', err)
    }
  }

  private uploadAurora(fadeSeconds: number) {
    const gl = this.gl
    if (!gl || this.glLost || this.textures.length === 0) return
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    if (fadeSeconds > 0 && !this.reducedMotion) {
      // The slot behind becomes the destination; the one being shown becomes the fade's start
      this.auroraBackSlot = this.auroraBackSlot === TEX_AURORA_A ? TEX_AURORA_B : TEX_AURORA_A
      this.mixAmount = 0
      this.mixRate = 1 / fadeSeconds
    } else {
      this.mixAmount = 1
      this.mixRate = 0
    }
    const destination = this.auroraBackSlot === TEX_AURORA_A ? TEX_AURORA_B : TEX_AURORA_A
    if (fadeSeconds > 0 && !this.reducedMotion) {
      gl.activeTexture(gl.TEXTURE0 + destination)
      gl.bindTexture(gl.TEXTURE_2D, this.textures[destination])
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, GRID_W, GRID_H, 0, gl.RED, gl.UNSIGNED_BYTE, this.brightnessBytes)
    } else {
      for (const slot of [TEX_AURORA_A, TEX_AURORA_B]) {
        gl.activeTexture(gl.TEXTURE0 + slot)
        gl.bindTexture(gl.TEXTURE_2D, this.textures[slot])
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, GRID_W, GRID_H, 0, gl.RED, gl.UNSIGNED_BYTE, this.brightnessBytes)
      }
    }
  }

  private fail(reason: unknown) {
    console.error('Aurora Watch: the globe could not start', reason)
    this.failed = true
    this.canvas.style.display = 'none'
    // After the constructor returns, so the page has had a chance to attach the callback
    queueMicrotask(() => this.onFailure())
  }

  private onContextLost = (ev: Event) => {
    ev.preventDefault()
    this.glLost = true
    this.program = null
  }

  private onContextRestored = () => {
    this.glLost = false
    try {
      this.initGl()
      this.uploadAurora(0)
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

  // --- Frame -------------------------------------------------------------------

  private now() {
    return Date.now() + this.timeOffset
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop)
    const rawDt = (now - this.last) / 1000
    this.last = now
    const dt = Math.min(rawDt, 0.25)

    if (!this.onScreen || !this.gl || this.glLost || !this.program) return
    this.update(dt)
    if (this.hoverDirty) this.reportHover()

    // With reduced motion the scene is a still picture, so it is only redrawn when something changes
    if (this.reducedMotion && !this.dirty) return
    this.dirty = false
    this.draw()
    this.governQuality(rawDt)
  }

  private update(dt: number) {
    if (!this.reducedMotion) this.time += dt

    if (this.mixRate > 0) {
      this.mixAmount = Math.min(1, this.mixAmount + this.mixRate * dt)
      if (this.mixAmount >= 1) this.mixRate = 0
      this.dirty = true
    }

    // Sweep the Sun toward a previewed hour instead of cutting to it
    const targetOffset = this.previewTarget === null ? 0 : this.previewTarget - Date.now()
    const gap = targetOffset - this.timeOffset
    if (Math.abs(gap) > 1000) {
      this.timeOffset = this.reducedMotion ? targetOffset : this.timeOffset + gap * Math.min(1, dt * 3.5)
      this.dirty = true
    } else {
      this.timeOffset = targetOffset
    }

    if (this.mode === 'ground' && this.headingTarget !== null && !this.drag) {
      const turn = wrap180(this.headingTarget - this.ground.heading)
      if (Math.abs(turn) < 0.2) {
        this.ground.heading = this.headingTarget
        this.headingTarget = null
      } else {
        this.ground.heading = (this.ground.heading + turn * Math.min(1, dt * 3.5) + 360) % 360
      }
      this.dirty = true
    }

    if (this.mode === 'orbit') this.updateOrbit(dt)
    else if (this.mode === 'descending') this.advanceFlight(dt / DESCENT_SECONDS)
    else if (this.mode === 'ascending') this.advanceFlight(-dt / ASCENT_SECONDS)
  }

  private updateOrbit(dt: number) {
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

  private advanceFlight(ds: number) {
    this.flightS = this.reducedMotion ? (ds > 0 ? 1 : 0) : clamp(this.flightS + ds, 0, 1)
    this.dirty = true
    if (this.mode === 'descending' && this.flightS >= 1) this.setMode('ground')
    if (this.mode === 'ascending' && this.flightS <= 0) {
      this.orbit = { ...this.flightFrom }
      this.setMode('orbit')
    }
  }

  private setMode(mode: GlobeMode) {
    this.mode = mode
    this.canvas.style.cursor = mode === 'orbit' || mode === 'ground' ? 'grab' : 'default'
    this.hoverAt = null
    this.onHover(null)
    this.onModeChange(mode)
    this.dirty = true
  }

  private pose(): Pose {
    switch (this.mode) {
      case 'orbit':
        return orbitPose(this.orbit.lat, this.orbit.lon, this.orbit.dist)
      case 'ground':
        return groundPose(this.ground.lat, this.ground.lon, this.ground.heading, this.ground.pitch)
      default:
        return flightPose(this.flightFrom, this.ground, this.flightS)
    }
  }

  private uniform(name: string) {
    if (!this.locations.has(name) && this.gl && this.program) {
      this.locations.set(name, this.gl.getUniformLocation(this.program, name))
    }
    return this.locations.get(name) ?? null
  }

  private draw() {
    const gl = this.gl
    if (!gl || !this.program) return
    const u = (name: string) => this.uniform(name)
    gl.useProgram(this.program)
    gl.bindVertexArray(this.vao)

    const pose = this.pose()
    const w = this.canvas.width
    const h = this.canvas.height
    const [tx, ty] = viewTangents(pose.fov, w / Math.max(1, h))
    const ms = this.now()
    const sun = subSolarPoint(ms)
    const moon = subLunarPoint(ms)
    const s = this.mode === 'orbit' ? 0 : this.mode === 'ground' ? 1 : this.flightS
    const groundAmount = clamp((s - 0.72) / 0.26, 0, 1)
    const axes = localAxes(this.ground.lat, this.ground.lon)

    gl.uniform2f(u('uResolution'), w, h)
    gl.uniform1f(u('uTime'), this.time)
    gl.uniform2f(u('uTan'), tx, ty)
    gl.uniform3fv(u('uCamPos'), pose.pos)
    gl.uniform3fv(u('uRight'), pose.right)
    gl.uniform3fv(u('uUp'), pose.up)
    gl.uniform3fv(u('uForward'), pose.forward)
    gl.uniform3fv(u('uSun'), latLonToVec(sun.lat, sun.lon))
    gl.uniform3fv(u('uMoon'), latLonToVec(moon.lat, moon.lon))
    gl.uniform1f(u('uMoonIllum'), moonIllumination(ms))
    gl.uniform1f(u('uTexHeight'), 1800)
    gl.uniform1f(u('uMix'), this.mixAmount)
    gl.uniform1f(u('uShellScale'), SHELL_EXAGGERATION + (1 - SHELL_EXAGGERATION) * ease(s))
    const lowest = Math.min(this.minLit, this.mixAmount < 1 ? this.previousMinLit : this.minLit)
    gl.uniform1f(u('uMinSinLat'), Math.sin(Math.max(0, lowest - 2) * (Math.PI / 180)))
    const tierSteps = TIERS[this.tier].steps
    gl.uniform1i(u('uSteps'), groundAmount > 0 ? Math.round(tierSteps * GROUND_STEP_FACTOR) : tierSteps)
    gl.uniform3fv(u('uPole'), POLE_AXIS)
    gl.uniform3fv(u('uPoleU1'), POLE_U1)
    gl.uniform3fv(u('uPoleU2'), POLE_U2)
    gl.uniform1f(u('uGround'), groundAmount)
    gl.uniform3fv(u('uGroundUp'), axes.up)
    gl.uniform3fv(u('uGroundNorth'), axes.north)
    gl.uniform3fv(u('uGroundEast'), axes.east)
    gl.uniform1f(u('uPinOn'), this.pin ? 1 : 0)
    gl.uniform3fv(u('uPin'), this.pin ? latLonToVec(this.pin.lat, this.pin.lon) : [0, 1, 0])

    const front = this.auroraBackSlot === TEX_AURORA_A ? TEX_AURORA_B : TEX_AURORA_A
    gl.uniform1i(u('uDay'), TEX_DAY)
    gl.uniform1i(u('uNight'), TEX_NIGHT)
    gl.uniform1i(u('uNoise'), TEX_NOISE)
    gl.uniform1i(u('uAuroraA'), this.auroraBackSlot)
    gl.uniform1i(u('uAuroraB'), front)

    gl.drawArrays(gl.TRIANGLES, 0, 3)
    if (this.mode === 'ground') this.onHeading(this.ground.heading)
  }

  /** Steps down when frames run slow, and never back up: going back would only oscillate */
  private governQuality(rawDt: number) {
    // Long gaps are the tab being away, not the GPU struggling
    if (rawDt > AWAY_GAP_S) return
    this.sampleSum += rawDt
    this.sampleCount++
    // On a very slow GPU thirty frames could take a minute, so a sample also ends on elapsed time
    const enoughTime = this.sampleSum > SAMPLE_SECONDS && this.sampleCount >= 3
    if (this.sampleCount < SAMPLE_FRAMES && !enoughTime) return
    const average = this.sampleSum / this.sampleCount
    this.sampleSum = 0
    this.sampleCount = 0
    if (average > SLOW_FRAME_S && this.tier < TIERS.length - 1) {
      this.tier++
      this.resize()
    }
  }

  private resize = () => {
    const w = this.el.clientWidth
    const h = this.el.clientHeight
    const dpr = window.devicePixelRatio || 1
    const budget = PIXEL_BUDGET * TIERS[this.tier].pixels * this.budgetFactor
    const size = glBackingSize(w, h, dpr, budget)
    if (this.canvas.width !== size.w) this.canvas.width = size.w
    if (this.canvas.height !== size.h) this.canvas.height = size.h
    this.gl?.viewport(0, 0, size.w, size.h)
    this.dirty = true
  }

  // --- Input -------------------------------------------------------------------

  private stopSpinning() {
    this.spinning = false
    this.touched = true
  }

  private toNdc(p: PointerInfo) {
    const rect = this.canvas.getBoundingClientRect()
    return {
      x: ((p.x - rect.left) / rect.width) * 2 - 1,
      y: 1 - ((p.y - rect.top) / rect.height) * 2,
      aspect: rect.width / Math.max(1, rect.height),
    }
  }

  private reportHover() {
    this.hoverDirty = false
    if (!this.hoverAt || this.mode !== 'orbit') {
      this.onHover(null)
      return
    }
    const { x, y, aspect } = this.toNdc(this.hoverAt)
    const at = pickSurface(this.pose(), x, y, aspect)
    this.onHover(at ? { ...at, percent: sampleField(this.field, at.lat, at.lon) } : null)
  }

  private onPointerDown = (ev: PointerEvent) => {
    if (this.mode !== 'orbit' && this.mode !== 'ground') return
    this.canvas.setPointerCapture(ev.pointerId)
    this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
    this.fly = null
    this.headingTarget = null
    this.stopSpinning()
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

  private currentPinchDistance() {
    const [a, b] = [...this.pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
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
      if (this.pinchDist > 0 && this.mode === 'orbit') {
        this.orbit.dist = clamp(this.orbit.dist * (this.pinchDist / dist), MIN_DIST, MAX_DIST)
        this.dirty = true
      }
      this.pinchDist = dist
      return
    }
    if (!this.drag) return
    if (Math.hypot(ev.clientX - this.drag.startX, ev.clientY - this.drag.startY) > CLICK_SLOP_PX) this.drag.moved = true
    if (!this.drag.moved) return

    const height = Math.max(1, this.canvas.clientHeight)
    if (this.mode === 'orbit') {
      // Scaled so the surface tracks the cursor at any zoom
      const degPerPx = (120 / height) * (this.orbit.dist - 0.85) / 2
      const dLon = -dx * degPerPx
      const dLat = dy * degPerPx
      this.orbit.lon = wrap180(this.orbit.lon + dLon)
      this.orbit.lat = clamp(this.orbit.lat + dLat, -MAX_ORBIT_LAT, MAX_ORBIT_LAT)
      const now = performance.now()
      const elapsed = Math.max(0.001, (now - this.drag.lastT) / 1000)
      this.drag.lastT = now
      this.velLon = this.velLon * 0.6 + (dLon / elapsed) * 0.4
      this.velLat = this.velLat * 0.6 + (dLat / elapsed) * 0.4
    } else {
      const degPerPx = 72 / height
      this.ground.heading = (this.ground.heading - dx * degPerPx + 360) % 360
      this.ground.pitch = clamp(this.ground.pitch + dy * degPerPx, -4, 85)
    }
    this.dirty = true
  }

  private onPointerUp = (ev: PointerEvent) => {
    this.pointers.delete(ev.pointerId)
    if (this.pointers.size > 0) return
    const drag = this.drag
    this.drag = null
    this.canvas.style.cursor = this.mode === 'orbit' || this.mode === 'ground' ? 'grab' : 'default'
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
    if (ev.type !== 'pointerup' || this.mode !== 'orbit') return
    const { x, y, aspect } = this.toNdc({ x: ev.clientX, y: ev.clientY })
    const at = pickSurface(this.pose(), x, y, aspect)
    if (at) this.onPick(at)
  }

  private onPointerLeave = () => {
    this.hoverAt = null
    this.hoverDirty = true
  }

  private onWheel = (ev: WheelEvent) => {
    // A plain wheel keeps scrolling the page, as it does over the ISS map
    if (!ev.ctrlKey || this.mode !== 'orbit') return
    ev.preventDefault()
    this.zoomBy(Math.exp(ev.deltaY * 0.004))
  }

  private onKeyDown = (ev: KeyboardEvent) => {
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return
    const step = 6
    let handled = true
    if (this.mode === 'orbit') {
      this.stopSpinning()
      if (ev.key === 'ArrowLeft') this.orbit.lon = wrap180(this.orbit.lon - step)
      else if (ev.key === 'ArrowRight') this.orbit.lon = wrap180(this.orbit.lon + step)
      else if (ev.key === 'ArrowUp') this.orbit.lat = clamp(this.orbit.lat + step, -MAX_ORBIT_LAT, MAX_ORBIT_LAT)
      else if (ev.key === 'ArrowDown') this.orbit.lat = clamp(this.orbit.lat - step, -MAX_ORBIT_LAT, MAX_ORBIT_LAT)
      else if (ev.key === '+' || ev.key === '=') this.zoomBy(0.88)
      else if (ev.key === '-' || ev.key === '_') this.zoomBy(1 / 0.88)
      else handled = false
    } else if (this.mode === 'ground') {
      if (ev.key === 'ArrowLeft') this.ground.heading = (this.ground.heading - step + 360) % 360
      else if (ev.key === 'ArrowRight') this.ground.heading = (this.ground.heading + step) % 360
      else if (ev.key === 'ArrowUp') this.ground.pitch = clamp(this.ground.pitch + step, -4, 85)
      else if (ev.key === 'ArrowDown') this.ground.pitch = clamp(this.ground.pitch - step, -4, 85)
      else handled = false
    } else {
      handled = false
    }
    if (handled) {
      ev.preventDefault()
      this.dirty = true
    }
  }
}
