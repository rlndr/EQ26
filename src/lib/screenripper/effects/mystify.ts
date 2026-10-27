import { randomSeed, rng } from '../math'
import type { Effect2D } from '../types'

const POLYS = 2
const CORNERS = 4
/** Echoes trailing each polygon, oldest dimmest */
const ECHOES = 10
/** Time between echoes. Time, not frames, so the trail is the same length at any refresh rate */
const ECHO_SECONDS = 0.07
/** Corner speeds in screen-fractions per second */
const SPEED_MIN = 0.12
const SPEED_MAX = 0.3

const POINTS = POLYS * CORNERS

/**
 * The Windows classic: two quadrilaterals whose corners bounce independently off the screen
 * edges, each trailed by fading echoes, colours drifting. Positions are kept as fractions of
 * the screen, so a resize keeps the motion intact.
 */
export function mystify(seed = randomSeed()): Effect2D {
  let ctx: CanvasRenderingContext2D
  let w = 0
  let h = 0
  const rand = rng(seed)
  const pos = new Float64Array(POINTS * 2)
  const vel = new Float64Array(POINTS * 2)
  for (let i = 0; i < POINTS * 2; i++) {
    pos[i] = 0.1 + rand() * 0.8
    vel[i] = (SPEED_MIN + rand() * (SPEED_MAX - SPEED_MIN)) * (rand() < 0.5 ? -1 : 1)
  }
  // Ring buffer of past positions; starts filled with the current one so echoes grow out of it
  const echoes = new Float64Array(ECHOES * POINTS * 2)
  for (let e = 0; e < ECHOES; e++) echoes.set(pos, e * POINTS * 2)
  let head = 0
  let sinceEcho = 0
  const baseHue = rand() * 360

  const polygon = (src: Float64Array, offset: number, p: number) => {
    ctx.beginPath()
    for (let c = 0; c < CORNERS; c++) {
      const i = offset + (p * CORNERS + c) * 2
      const px = src[i] * w
      const py = src[i + 1] * h
      if (c === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
  }

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
      // Straight-line motion folded at the walls: exact for any step size
      for (let i = 0; i < POINTS * 2; i++) {
        pos[i] += vel[i] * dt
        if (pos[i] < 0) {
          pos[i] = -pos[i]
          vel[i] = Math.abs(vel[i])
        } else if (pos[i] > 1) {
          pos[i] = 2 - pos[i]
          vel[i] = -Math.abs(vel[i])
        }
      }
      sinceEcho += dt
      while (sinceEcho >= ECHO_SECONDS) {
        sinceEcho -= ECHO_SECONDS
        head = (head + 1) % ECHOES
        echoes.set(pos, head * POINTS * 2)
      }

      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      ctx.lineJoin = 'round'

      for (let p = 0; p < POLYS; p++) {
        const hue = (baseHue + t * 12 + p * 150) % 360
        // Oldest echo first, so newer ones draw over it
        for (let k = 1; k < ECHOES; k++) {
          const e = (head + k) % ECHOES
          polygon(echoes, e * POINTS * 2, p)
          ctx.lineWidth = 1.5
          ctx.strokeStyle = `hsla(${hue.toFixed(1)} 85% 60% / ${((k / ECHOES) * 0.55).toFixed(3)})`
          ctx.stroke()
        }
        polygon(pos, 0, p)
        ctx.lineWidth = 6
        ctx.strokeStyle = `hsla(${hue.toFixed(1)} 85% 60% / 0.15)`
        ctx.stroke()
        ctx.lineWidth = 2
        ctx.strokeStyle = `hsla(${hue.toFixed(1)} 90% 72% / 1)`
        ctx.stroke()
      }
    },
    dispose() {},
  }
}
