import { randomSeed, rng } from '../math'
import type { Effect2D } from '../types'

export const STARS = 900
/** Depth travelled per second; stars start at z = 1 and are recycled at NEAR */
const SPEED = 0.45
const NEAR = 0.02
/**
 * Streaks run back to where the star was this long ago. A fixed time, not the previous frame,
 * so streaks are the same length at 60 Hz and 144 Hz.
 */
const STREAK_SECONDS = 0.09
/** Stars are drawn in this many brightness bands, one path and one stroke call per band */
const BANDS = 8
/** Spawn area beyond the screen edge so the drifting vanishing point never shows an empty edge */
const SPREAD = 1.25

/** Warp-speed streaks from a vanishing point that drifts slowly around the centre */
export function starfield(seed = randomSeed()): Effect2D {
  let ctx: CanvasRenderingContext2D
  let w = 0
  let h = 0
  const rand = rng(seed)
  const x = new Float32Array(STARS)
  const y = new Float32Array(STARS)
  const z = new Float32Array(STARS)

  // Spawn in the screen's shape, not a square: on 16:9 a square wastes two-thirds of the stars
  // above and below the screen where they are never seen
  const spawn = (i: number, far: boolean) => {
    const big = Math.max(1, w, h)
    x[i] = (rand() * 2 - 1) * SPREAD * (w / big)
    y[i] = (rand() * 2 - 1) * SPREAD * (h / big)
    // A little depth jitter on respawn stops recycled stars arriving as a flat wall
    z[i] = far ? 1 - rand() * 0.05 : NEAR + rand() * (1 - NEAR)
  }
  return {
    kind: '2d',
    init(c, width, height) {
      ctx = c
      w = width
      h = height
      for (let i = 0; i < STARS; i++) spawn(i, false)
    },
    resize(width, height) {
      w = width
      h = height
    },
    frame(t, dt) {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)

      const vx = w / 2 + w * 0.08 * Math.sin(t * 0.13)
      const vy = h / 2 + h * 0.08 * Math.sin(t * 0.17 + 1)
      // At z = 1 a star at ±1 projects to the edge of the larger screen dimension
      const focal = Math.max(w, h) * 0.5
      const tail = SPEED * STREAK_SECONDS

      ctx.lineCap = 'round'
      for (let band = 0; band < BANDS; band++) {
        ctx.beginPath()
        for (let i = 0; i < STARS; i++) {
          // Advance on the first band only, so each star moves once per frame
          if (band === 0) {
            z[i] -= SPEED * dt
            if (z[i] < NEAR) spawn(i, true)
          }
          const near = 1 - z[i]
          if (Math.min(BANDS - 1, Math.floor(near * near * BANDS)) !== band) continue
          const sx = vx + (x[i] / z[i]) * focal
          const sy = vy + (y[i] / z[i]) * focal
          if (sx < 0 || sx > w || sy < 0 || sy > h) {
            // Off screen: recycle so the field stays full where it can be seen
            if (z[i] < 0.9) spawn(i, true)
            continue
          }
          const zt = Math.min(1, z[i] + tail)
          ctx.moveTo(vx + (x[i] / zt) * focal, vy + (y[i] / zt) * focal)
          ctx.lineTo(sx, sy)
        }
        const k = (band + 1) / BANDS
        ctx.lineWidth = 0.6 + 2.4 * k
        ctx.strokeStyle = `hsla(210 70% 88% / ${(0.15 + 0.85 * k).toFixed(3)})`
        ctx.stroke()
      }
    },
    dispose() {},
  }
}
