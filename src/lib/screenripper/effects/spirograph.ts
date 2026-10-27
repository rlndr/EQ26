import { randomSeed, rng } from '../math'
import type { Effect2D } from '../types'

export const PENS = 3
/** Radians of curve behind each pen */
const TAIL = 44
/** Curve resolution in radians of the outer angle */
const STEP = 0.035
/** Pen speed, radians of the outer angle per second */
const OMEGA = 1.9
/** The tail is stroked in this many pieces, faint at the end, bright at the pen */
export const CHUNKS = 12
/** Inner-wheel radius range, as a fraction of the fixed ring (R = 1) */
const R_MIN = 0.3
const R_MAX = 0.7
/** Fraction of the short screen side the figure may reach from centre */
export const FIT = 0.46

/**
 * Hypotrochoid: a pen on a wheel of radius r rolling inside a ring of radius 1, at distance d
 * from the wheel's centre. Three pens 120° apart trace it live while r and d drift, so the
 * figure keeps changing.
 *
 * The obvious formula, cos(kθ) with k = (1 − r) / r, cannot be used with a drifting k: θ grows
 * forever, so a small change in k becomes an ever larger jump in kθ and the tail would whirl
 * faster and faster. Instead the wheel's phase ψ is integrated frame by frame, and the tail is
 * laid out relative to the pen, so a change in k only bends it by (distance back) × Δk.
 */
export function spirograph(seed = randomSeed()): Effect2D {
  let ctx: CanvasRenderingContext2D
  let w = 0
  let h = 0
  const rand = rng(seed)
  const phaseR = rand() * Math.PI * 2
  const phaseD = rand() * Math.PI * 2
  const baseHue = rand() * 360
  let theta = 0
  let psi = 0

  return {
    kind: '2d',
    init(c, width, height) {
      ctx = c
      w = width
      h = height
    },
    resize(width, height) {
      w = width
      h = height
    },
    frame(t, dt) {
      const r = R_MIN + (R_MAX - R_MIN) * (0.5 + 0.5 * Math.sin(t * 0.021 + phaseR))
      const d = r * (0.55 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.033 + phaseD)))
      const k = (1 - r) / r
      theta += OMEGA * dt
      psi += k * OMEGA * dt

      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.globalCompositeOperation = 'lighter'

      // Furthest the pen can be from centre is (1 − r) + d; scale so that just fits
      const scale = (Math.min(w, h) * FIT) / (1 - r + d)
      const cx = w / 2
      const cy = h / 2
      const spin = t * 0.04
      const steps = Math.ceil(TAIL / STEP)
      const perChunk = Math.ceil(steps / CHUNKS)

      for (let p = 0; p < PENS; p++) {
        const rot = spin + (p * Math.PI * 2) / PENS
        const cr = Math.cos(rot)
        const sr = Math.sin(rot)
        const hue = (baseHue + p * 40 + t * 6) % 360
        for (let c = 0; c < CHUNKS; c++) {
          ctx.beginPath()
          // Chunks overlap by one point so the pieces join without gaps
          const from = c * perChunk
          const to = Math.min(steps, from + perChunk)
          for (let s = from; s <= to; s++) {
            const back = (steps - s) * STEP
            const th = theta - back
            const ps = psi - k * back
            const x = (1 - r) * Math.cos(th) + d * Math.cos(ps)
            const y = (1 - r) * Math.sin(th) - d * Math.sin(ps)
            const px = cx + (x * cr - y * sr) * scale
            const py = cy + (x * sr + y * cr) * scale
            if (s === from) ctx.moveTo(px, py)
            else ctx.lineTo(px, py)
          }
          const k01 = (c + 1) / CHUNKS
          ctx.lineWidth = 1.4
          ctx.strokeStyle = `hsla(${hue.toFixed(1)} 85% 65% / ${(k01 * k01 * 0.8).toFixed(3)})`
          ctx.stroke()
        }
      }
      ctx.globalCompositeOperation = 'source-over'
    },
    dispose() {},
  }
}
