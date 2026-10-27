import { randomSeed, rng, rotate4 } from '../math'
import type { Effect2D } from '../types'

/** 4D camera distance on the w axis, in circumradii */
export const W_CAMERA = 3
/** 3D camera distance, in circumradii */
export const CAMERA = 4
/** Circumradius on screen as a fraction of the short side, before perspective */
export const RADIUS = 0.34

/** The 16 corners (±1, ±1, ±1, ±1); bit b of the index set means coordinate b is +1 */
export const VERTICES = Array.from({ length: 16 }, (_, n) => [0, 1, 2, 3].map((b) => ((n >> b) & 1 ? 1 : -1)))

/** Corners whose indices differ in one bit differ in one coordinate: those are the 32 edges */
export const EDGES: [number, number][] = []
for (let a = 0; a < 16; a++) {
  for (let b = a + 1; b < 16; b++) {
    const diff = a ^ b
    if ((diff & (diff - 1)) === 0) EDGES.push([a, b])
  }
}

/**
 * Choose the two axes a face spans (6 ways), fix the other two at ±1 (4 ways): 24 squares,
 * each as its corner indices in order round the square.
 */
export const FACES: [number, number, number, number][] = []
for (let i = 0; i < 4; i++) {
  for (let j = i + 1; j < 4; j++) {
    const [k, l] = [0, 1, 2, 3].filter((a) => a !== i && a !== j)
    for (const sk of [0, 1 << k]) {
      for (const sl of [0, 1 << l]) {
        const base = sk | sl
        FACES.push([base, base | (1 << i), base | (1 << i) | (1 << j), base | (1 << j)])
      }
    }
  }
}

/**
 * A tesseract turning through 4D, so its inner cube keeps turning itself inside out, with a
 * slow 3D tumble on top. Faint glass in its 24 square faces, outer cube warm, inner cube cool.
 *
 * Cleared and redrawn every frame, with no trails: each frame is a pure function of t. An
 * earlier version faded trails while adding the glass each frame, which made the glass brighter
 * on faster displays (30/255 at 60 Hz, 128/255 at 240 Hz) and, above 60 Hz, shimmer as the
 * chunked fade stepped. It also had panes that swung out of the frame; their outline appeared
 * and vanished abruptly at each end of a move. Both removed 2026-10-26 for flicker.
 */
export function hypercube(seed = randomSeed()): Effect2D {
  let ctx: CanvasRenderingContext2D
  let w = 0
  let h = 0
  const hue0 = rng(seed)() * 360
  const p4 = new Float64Array(16 * 4)
  // Screen x, y, and w (which decides inner versus outer cube) per corner
  const screen = new Float64Array(16 * 3)

  /** Three planes through w for the inside-out turn, two for a tumble; rates in rad/s */
  const PLANES: [number, number, number][] = [[0, 3, 0.21], [1, 3, 0.15], [2, 3, 0.09], [0, 1, 0.06], [0, 2, 0.04]]

  const project = (t: number) => {
    for (let n = 0; n < 16; n++) p4.set(VERTICES[n], n * 4)
    for (const [i, j, rate] of PLANES) {
      const c = Math.cos(t * rate)
      const s = Math.sin(t * rate)
      for (let n = 0; n < 16; n++) rotate4(p4, n * 4, i, j, c, s)
    }
    const size = Math.min(w, h) * RADIUS
    for (let n = 0; n < 16; n++) {
      const o = n * 4
      // Coordinates are ±1, so the circumradius is 2: halve to unit size
      const x = p4[o] / 2, y = p4[o + 1] / 2, z = p4[o + 2] / 2, ww = p4[o + 3] / 2
      const s4 = W_CAMERA / (W_CAMERA - ww)
      const s3 = CAMERA / (CAMERA - z * s4)
      screen[n * 3] = w / 2 + x * s4 * s3 * size
      screen[n * 3 + 1] = h / 2 - y * s4 * s3 * size
      screen[n * 3 + 2] = ww
    }
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
    frame(t) {
      project(t)
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'

      const hue = hue0 + t * 6
      // Outer cube (w > 0) warm, inner cube cool
      const tint = (ww: number) => (hue + ww * 70).toFixed(1)

      // Faint glass in every face; overlapping panes add up, so depth reads through them
      for (const [a, b, c, d] of FACES) {
        const ww = (screen[a * 3 + 2] + screen[b * 3 + 2] + screen[c * 3 + 2] + screen[d * 3 + 2]) / 4
        ctx.beginPath()
        ctx.moveTo(screen[a * 3], screen[a * 3 + 1])
        ctx.lineTo(screen[b * 3], screen[b * 3 + 1])
        ctx.lineTo(screen[c * 3], screen[c * 3 + 1])
        ctx.lineTo(screen[d * 3], screen[d * 3 + 1])
        ctx.closePath()
        ctx.fillStyle = `hsla(${tint(ww)} 80% 55% / 0.05)`
        ctx.fill()
      }

      // The frame: wide faint stroke under a thin bright one for glow, as in Polyhedra
      for (const [a, b] of EDGES) {
        const ww = (screen[a * 3 + 2] + screen[b * 3 + 2]) / 2
        const light = 0.45 + 0.55 * (ww + 1) / 2
        ctx.beginPath()
        ctx.moveTo(screen[a * 3], screen[a * 3 + 1])
        ctx.lineTo(screen[b * 3], screen[b * 3 + 1])
        ctx.lineWidth = 6
        ctx.strokeStyle = `hsla(${tint(ww)} 90% 60% / ${(0.12 * light).toFixed(3)})`
        ctx.stroke()
        ctx.lineWidth = 1.6
        ctx.strokeStyle = `hsla(${tint(ww)} 90% 78% / ${light.toFixed(3)})`
        ctx.stroke()
      }
      ctx.globalCompositeOperation = 'source-over'
    },
    dispose() {},
  }
}
