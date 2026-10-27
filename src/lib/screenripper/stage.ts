import { Director, FADE_SECONDS, REDUCED_MOTION_SCALE } from './director'
import { glBackingSize } from './gl'
import { EFFECTS } from './registry'
import type { Effect } from './types'
import { WakeLockKeeper } from './wakelock'

/** In fullscreen, the cursor hides after this long without the mouse moving */
const CURSOR_IDLE_MS = 2000

/**
 * Everything on the ScreenRipper stage that changes faster than React should: the two canvases,
 * their sizing, the animation loop, the active effect and fullscreen. Like Arkanoid's Engine it
 * lives outside React and reports only discrete changes through `onChange`.
 *
 * There are two canvases because a canvas cannot change context type: once it has handed out a
 * 2D context it can never give a WebGL one, and the reverse. Vector patterns draw on one, shader
 * patterns on the other, and only the active one is shown.
 *
 * Timing decisions (what shows, when it fades, when it cycles) belong to Director; this class
 * applies them to the DOM.
 *
 * An effect that throws (a shader that will not compile, a bug in a frame) is dropped and its
 * message put in `error` for the page to show, rather than leaving a silent black screen.
 *
 * In fullscreen only, it also holds a screen wake lock and hides an idle cursor. Keeping a
 * screen awake just because the page is open in a tab would be rude.
 */
export class Stage {
  readonly el: HTMLElement
  readonly layer: HTMLElement
  readonly canvas2d: HTMLCanvasElement
  readonly canvasGl: HTMLCanvasElement
  readonly director = new Director(EFFECTS.length)

  /** Stage size in CSS pixels */
  width = 0
  height = 0
  fullscreen = false
  /** Why the current pattern is not drawing, for the page to show; null when all is well */
  error: string | null = null
  /** The system asks for reduced motion, so patterns run at REDUCED_MOTION_SCALE */
  reducedMotion = false

  onChange: () => void = () => {}

  private ro: ResizeObserver
  private ctx2d: CanvasRenderingContext2D | null = null
  private gl: WebGL2RenderingContext | null = null
  private effect: Effect | null = null
  private raf = 0
  private last = 0
  private faded = true
  private glLost = false
  /** Last opacity written to the active canvas, so the style is touched only on a change */
  private canvasOpacity = 1
  private wakeLock = new WakeLockKeeper()
  private cursorTimer = 0
  private motionQuery: MediaQueryList

  /** `layer` wraps both canvases and is what fades, so a fade works the same for 2D and GL */
  constructor(el: HTMLElement, layer: HTMLElement, canvas2d: HTMLCanvasElement, canvasGl: HTMLCanvasElement) {
    this.el = el
    this.layer = layer
    this.canvas2d = canvas2d
    this.canvasGl = canvasGl

    layer.style.opacity = '0'
    layer.style.transition = `opacity ${FADE_SECONDS}s linear`
    // Flush the opacity of 0 now; otherwise the browser never sees it and the first fade-in is skipped
    void layer.offsetWidth

    this.resize()
    this.ro = new ResizeObserver(this.resize)
    this.ro.observe(el)
    document.addEventListener('fullscreenchange', this.onFullscreenChange)
    canvasGl.addEventListener('webglcontextlost', this.onContextLost)
    canvasGl.addEventListener('webglcontextrestored', this.onContextRestored)
    document.addEventListener('visibilitychange', this.syncWakeLock)
    el.addEventListener('pointermove', this.pokeCursor)

    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    this.motionQuery.addEventListener('change', this.onMotionChange)
    this.applyMotion()

    this.last = performance.now()
    this.raf = requestAnimationFrame(this.loop)
  }

  get current() {
    return this.director.current
  }

  get paused() {
    return this.director.paused
  }

  select(index: number) {
    this.director.select(index)
  }

  /** Any keypress restarts the 60-second count */
  input() {
    this.director.input()
  }

  togglePause() {
    this.director.togglePause()
    this.onChange()
  }

  /**
   * Fullscreen goes on the stage element, not the document, so only the stage fills the screen.
   * The site header, footer and page text are not inside it, so they are not shown.
   */
  toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      // Refused without a user gesture or under a permissions policy; the stage stays windowed
      this.el.requestFullscreen().catch(() => {})
    }
  }

  /**
   * Development aid: drop the WebGL context as a GPU reset would, then restore it after `ms`.
   * Exposed on `window.screenripper` in dev builds only.
   */
  debugLoseContext(ms = 1000) {
    const ext = this.gl?.getExtension('WEBGL_lose_context')
    if (!ext) return console.warn('ScreenRipper: no WebGL context yet; show a shader pattern first')
    ext.loseContext()
    setTimeout(() => ext.restoreContext(), ms)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    document.removeEventListener('fullscreenchange', this.onFullscreenChange)
    // Removed before loseContext below, which would otherwise fire them
    this.canvasGl.removeEventListener('webglcontextlost', this.onContextLost)
    this.canvasGl.removeEventListener('webglcontextrestored', this.onContextRestored)
    document.removeEventListener('visibilitychange', this.syncWakeLock)
    this.el.removeEventListener('pointermove', this.pokeCursor)
    this.motionQuery.removeEventListener('change', this.onMotionChange)
    clearTimeout(this.cursorTimer)
    this.wakeLock.set(false)
    this.effect?.dispose()
    this.effect = null
    // Browsers cap live WebGL contexts (~16 in Chrome), and SPA navigation back and forth would
    // otherwise leave old ones waiting on garbage collection
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext()
    this.onChange = () => {}
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop)
    const dt = (now - this.last) / 1000
    this.last = now

    const d = this.director
    const swap = d.tick(dt)
    if (swap !== null) this.show(swap)

    if (!d.paused || swap !== null) this.draw(d.frameDt)
    this.applyOpacity()

    // Write the style only on a change, not every frame
    if (d.fading !== this.faded) {
      this.faded = d.fading
      this.layer.style.opacity = d.fading ? '0' : '1'
    }
  }

  /** Swap in a fresh instance of the effect at `index`, while the layer is faded out */
  private show(index: number) {
    this.effect?.dispose()
    this.effect = null
    this.error = null

    const entry = EFFECTS[index]
    try {
      const effect = entry.create()
      const isGl = effect.kind === 'gl'
      this.canvas2d.style.display = isGl ? 'none' : ''
      this.canvasGl.style.display = isGl ? '' : 'none'
      // A previous effect may have left its canvas faded
      this.canvas2d.style.opacity = ''
      this.canvasGl.style.opacity = ''
      this.canvasOpacity = 1

      if (effect.kind === '2d') {
        const ctx = this.get2d()
        if (!ctx) throw new Error('This browser could not create a 2D canvas.')
        this.apply2dTransform(ctx)
        effect.init(ctx, this.width, this.height)
        this.effect = effect
      } else {
        const gl = this.getGl()
        if (!gl) {
          throw new Error('WebGL2 is not available in this browser, so the shader patterns (8–0) cannot run.')
        }
        // While lost, wait: onContextRestored shows the current pattern again
        if (!this.glLost) {
          gl.viewport(0, 0, this.canvasGl.width, this.canvasGl.height)
          effect.init(gl, this.canvasGl.width, this.canvasGl.height)
          this.effect = effect
        }
      }
    } catch (err) {
      this.fail(entry.name, err)
      return
    }
    this.onChange()
  }

  private draw(dt: number) {
    if (!this.effect) return
    try {
      this.effect.frame(this.director.effectTime, dt)
    } catch (err) {
      // The loop has already queued the next frame, so without this a bug would throw 60 times a second
      this.fail(EFFECTS[this.director.current].name, err)
    }
  }

  private applyOpacity() {
    const opacity = this.effect?.opacity ?? 1
    if (opacity === this.canvasOpacity) return
    this.canvasOpacity = opacity
    const canvas = this.effect?.kind === 'gl' ? this.canvasGl : this.canvas2d
    canvas.style.opacity = String(opacity)
  }

  private fail(name: string, err: unknown) {
    console.error(`ScreenRipper: ${name}`, err)
    try {
      this.effect?.dispose()
    } catch {
      // Already failing; the original error is the one worth reporting
    }
    this.effect = null
    this.error = `${name}\n${err instanceof Error ? err.message : String(err)}`
    this.onChange()
  }

  private get2d() {
    // Opaque: the stage is black underneath anyway, and the browser can skip alpha blending
    this.ctx2d ??= this.canvas2d.getContext('2d', { alpha: false })
    return this.ctx2d
  }

  private getGl() {
    this.gl ??= this.canvasGl.getContext('webgl2', { alpha: false, antialias: false })
    return this.gl
  }

  // Effects draw in CSS pixels; this maps them onto the devicePixelRatio-sized backing store
  private apply2dTransform(ctx: CanvasRenderingContext2D) {
    const sx = this.canvas2d.width / Math.max(1, this.width)
    const sy = this.canvas2d.height / Math.max(1, this.height)
    ctx.setTransform(sx, 0, 0, sy, 0, 0)
  }

  /**
   * The 2D backing store is CSS size × devicePixelRatio so lines are not soft on a retina
   * display. The GL one is the same but capped at the pixel budget; CSS stretches it to fit.
   */
  private resize = () => {
    const w = this.el.clientWidth
    const h = this.el.clientHeight
    const dpr = window.devicePixelRatio || 1
    this.width = w
    this.height = h
    setSize(this.canvas2d, Math.max(1, Math.round(w * dpr)), Math.max(1, Math.round(h * dpr)))
    const gl = glBackingSize(w, h, dpr)
    setSize(this.canvasGl, gl.w, gl.h)

    const effect = this.effect
    if (!effect) return
    if (effect.kind === '2d' && this.ctx2d) {
      // Resizing the backing store resets context state, so the transform is reapplied
      this.apply2dTransform(this.ctx2d)
      effect.resize(w, h)
    } else if (effect.kind === 'gl' && this.gl) {
      this.gl.viewport(0, 0, gl.w, gl.h)
      effect.resize(gl.w, gl.h)
    }
    // A paused effect would otherwise sit on a cleared canvas until resumed
    if (this.director.paused) this.draw(0)
  }

  /**
   * A GPU reset, driver update or sleep/wake can take the context away. preventDefault tells
   * the browser we want it back; everything the effect made on the GPU is gone with it.
   */
  private onContextLost = (ev: Event) => {
    ev.preventDefault()
    this.glLost = true
    if (this.effect?.kind === 'gl') this.effect = null // its programs went with the context
  }

  /**
   * Same context object, but empty, so the pattern is built again from scratch: a brief blink.
   * effectTime carries on, so a pattern that is a function of time resumes where it was. During
   * a fade there is nothing to do: the swap at the end of it builds the next pattern anyway.
   */
  private onContextRestored = () => {
    this.glLost = false
    const d = this.director
    if (d.current < 0 || d.fading || EFFECTS[d.current].kind !== 'gl') return
    this.show(d.current)
    if (d.paused) this.draw(0)
  }

  // Also fires when the browser exits fullscreen on Esc, which never goes through toggleFullscreen
  private onFullscreenChange = () => {
    const fullscreen = document.fullscreenElement === this.el
    if (fullscreen === this.fullscreen) return
    this.fullscreen = fullscreen
    this.syncWakeLock()
    // Entering starts the idle countdown even if the mouse never moves; leaving shows it again
    this.pokeCursor()
    this.onChange()
  }

  // The browser drops the lock whenever the tab is hidden, so this runs on visibility too
  private syncWakeLock = () => {
    this.wakeLock.set(this.fullscreen && document.visibilityState === 'visible')
  }

  private pokeCursor = () => {
    this.el.style.cursor = ''
    clearTimeout(this.cursorTimer)
    if (!this.fullscreen) return
    this.cursorTimer = window.setTimeout(() => {
      if (this.fullscreen) this.el.style.cursor = 'none'
    }, CURSOR_IDLE_MS)
  }

  private applyMotion() {
    this.reducedMotion = this.motionQuery.matches
    this.director.timeScale = this.reducedMotion ? REDUCED_MOTION_SCALE : 1
  }

  private onMotionChange = () => {
    this.applyMotion()
    this.onChange()
  }
}

// Assigning width clears the canvas even when unchanged, and ResizeObserver can fire without a
// real size change, so only touch it when the size differs
function setSize(c: HTMLCanvasElement, w: number, h: number) {
  if (c.width !== w) c.width = w
  if (c.height !== h) c.height = h
}
