import { noise2d, randomSeed, rng } from '../math'
import type { Effect2D } from '../types'

const PARTICLES = 4000
/** Each painting lasts this long; three fill one 60-second auto-cycle slot */
export const FIELD_SECONDS = 20
/** The end of each painting, where it fades to black before the next field starts */
export const CLEAR_SECONDS = 2
/** Particles respawn after a random lifetime in this range, so no region empties out */
const LIFE_MIN = 3
const LIFE_MAX = 9
/** Particle speed in short-sides per second */
export const SPEED = 0.07
/** Noise cells across the short side: lower is broader, smoother flow */
const FIELD_SCALE = 2.2
/** Alpha of each stroke; ink builds up where paths overlap */
const INK = 0.05
/** Particles are split into this many colour groups, one path and stroke per group */
const GROUPS = 3

/**
 * The painting's opacity with `remaining` seconds of the fade-out left: falls in a straight
 * line to 0. A pure function of time, so it runs at the same pace on any display.
 */
export const fadeOpacity = (remaining: number) => Math.min(1, Math.max(0, remaining / CLEAR_SECONDS))

/**
 * Particles follow a noise field and leave ink behind, so the painting builds up over 18 s,
 * then fades and a new field starts.
 *
 * Deliberately not fading trails: fading on an 8-bit canvas sticks at about 0.5 / alpha per
 * channel, and trails long enough to read as flow need an alpha so small that the ghost they
 * leave is clearly grey. Accumulating, then clearing outright, has no such floor.
 *
 * The fade at the end of each painting is the canvas element's opacity, not black fills over
 * the pixels. Fills were tried twice: a fixed alpha stuck at a grey floor, saving it up into
 * larger steps stepped visibly at ~15 Hz, and a rising alpha ran at half the pace on 240 Hz
 * because tiny alphas round up to 1/255.
 */
export function flowField(seed = randomSeed()): Effect2D {
  let ctx: CanvasRenderingContext2D
  let w = 0
  let h = 0
  const rand = rng(seed)
  const x = new Float32Array(PARTICLES)
  const y = new Float32Array(PARTICLES)
  const age = new Float32Array(PARTICLES)
  const life = new Float32Array(PARTICLES)
  let fieldIndex = -1
  let field = noise2d(seed)
  let hue = 0

  const spawn = (i: number) => {
    x[i] = rand() * w
    y[i] = rand() * h
    age[i] = 0
    life[i] = LIFE_MIN + rand() * (LIFE_MAX - LIFE_MIN)
  }

  const clear = () => {
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)
  }

  const effect: Effect2D = {
    kind: '2d',
    opacity: 1,
    init(c, width, height) {
      ctx = c
      w = width
      h = height
      clear()
    },
    resize(width, height) {
      // Keep particles where they were relative to the stage
      for (let i = 0; i < PARTICLES; i++) {
        x[i] *= width / Math.max(1, w)
        y[i] *= height / Math.max(1, h)
      }
      w = width
      h = height
    },
    frame(t, dt) {
      const index = Math.floor(t / FIELD_SECONDS)
      if (index !== fieldIndex) {
        fieldIndex = index
        field = noise2d(seed + index + 1)
        hue = rand() * 360
        for (let i = 0; i < PARTICLES; i++) spawn(i)
        clear()
      }
      const local = t - index * FIELD_SECONDS

      // Stop painting and let the finished picture fade out as a whole
      effect.opacity = fadeOpacity(FIELD_SECONDS - local)
      if (effect.opacity < 1) return

      const short = Math.min(w, h)
      const freq = FIELD_SCALE / short
      const step = SPEED * short * dt
      // The field itself drifts slowly, so flow lines bend over the life of a painting
      const drift = t * 0.02

      ctx.globalCompositeOperation = 'lighter'
      ctx.lineWidth = 1
      ctx.lineCap = 'butt'
      for (let g = 0; g < GROUPS; g++) {
        ctx.beginPath()
        for (let i = g; i < PARTICLES; i += GROUPS) {
          const angle = field(x[i] * freq, y[i] * freq + drift) * Math.PI * 4
          const nx = x[i] + Math.cos(angle) * step
          const ny = y[i] + Math.sin(angle) * step
          ctx.moveTo(x[i], y[i])
          ctx.lineTo(nx, ny)
          x[i] = nx
          y[i] = ny
          age[i] += dt
          if (age[i] > life[i] || nx < 0 || nx > w || ny < 0 || ny > h) spawn(i)
        }
        ctx.strokeStyle = `hsla(${((hue + g * 28) % 360).toFixed(1)} 80% 62% / ${INK})`
        ctx.stroke()
      }
      ctx.globalCompositeOperation = 'source-over'
    },
    dispose() {},
  }
  return effect
}
