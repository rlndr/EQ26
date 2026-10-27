/** Seconds without a keypress before moving to the next pattern */
export const CYCLE_SECONDS = 60
/** Fade to black, and back in, each take this long */
export const FADE_SECONDS = 0.4
/**
 * Longest frame the clocks will accept. rAF stops in a hidden tab, so the first frame back can
 * report minutes; clamping it means hidden time does not count towards the cycle.
 */
export const MAX_DT = 0.1
/**
 * Pattern speed when the system asks for reduced motion. Slowed rather than stopped: motion is
 * the point of a screensaver, but at 0.4× nothing sweeps across the screen quickly. The
 * auto-cycle and fades keep real time.
 */
export const REDUCED_MOTION_SCALE = 0.4

// Summing 1/60 3600 times gives 59.9999999999, not 60, which would lose a frame at each
// threshold. A microsecond of slack absorbs that and is far below any frame time.
const EPS = 1e-6

/**
 * Which pattern is showing and when it changes: selection, fades, pause and the auto-cycle.
 * Pure timekeeping with no DOM, so verify.ts can drive it frame by frame. Stage applies the
 * results to the canvases.
 *
 * Every clock here runs on the animation loop's frame times, not setInterval, so they all stop
 * together when the tab is hidden.
 */
export class Director {
  readonly count: number
  /** Index on screen; -1 until the first pattern is shown */
  current = -1
  /** Index the current fade-out will swap to */
  target: number
  fading: boolean
  paused = false
  /** Seconds since the last keypress or change, excluding pauses */
  idle = 0
  /** The current effect's t: seconds since shown, excluding pauses */
  effectTime = 0
  /** The effect's dt for this frame; 0 while paused */
  frameDt = 0
  /** Multiplies pattern time only, not the cycle or fades; see REDUCED_MOTION_SCALE */
  timeScale = 1

  private fadeElapsed: number

  constructor(count: number, start = 0) {
    this.count = count
    this.target = start
    // Starts already faded out, so the first tick shows the first pattern
    this.fading = true
    this.fadeElapsed = FADE_SECONDS
  }

  /** Any keypress restarts the cycle count */
  input() {
    this.idle = 0
  }

  select(index: number) {
    this.idle = 0
    if (this.fading) {
      // Latest choice wins; the fade already under way carries on
      this.target = index
    } else if (index !== this.current) {
      this.target = index
      this.fading = true
      this.fadeElapsed = 0
    }
  }

  togglePause() {
    this.paused = !this.paused
  }

  /**
   * Advance one frame. Returns the index to show on the frame a fade-out completes, else null.
   * Fades run on real frame time even while paused, so a pause can never strand a black screen.
   */
  tick(rawDt: number): number | null {
    const dt = Math.min(Math.max(rawDt, 0), MAX_DT)
    this.frameDt = this.paused ? 0 : dt * this.timeScale
    this.effectTime += this.frameDt

    if (this.fading) {
      this.fadeElapsed += dt
      if (this.fadeElapsed < FADE_SECONDS - EPS) return null
      this.fading = false
      this.current = this.target
      this.effectTime = 0
      this.frameDt = 0
      this.idle = 0
      return this.current
    }

    if (!this.paused) this.idle += dt
    if (this.idle >= CYCLE_SECONDS - EPS) this.select((this.current + 1) % this.count)
    return null
  }
}
