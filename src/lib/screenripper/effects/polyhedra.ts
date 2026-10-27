import { rotate, smoothstep } from '../math'
import type { Effect2D } from '../types'

const PHI = (1 + Math.sqrt(5)) / 2

/** Each solid shows this long; five of them fill exactly one 60-second auto-cycle slot */
export const SHAPE_SECONDS = 12
/** The last part of each slot, where the next solid's edges grow as this one's shrink */
export const MORPH_SECONDS = 1.5
/** Camera distance in circumradii; nearest point is magnified CAMERA / (CAMERA - 1) = 1.5× */
export const CAMERA = 3
/** Circumradius as a fraction of the smaller screen dimension */
export const RADIUS = 0.36
/** The dual drawn inside, as a fraction of the outer solid's size */
const INNER = 0.42

export interface Solid {
  name: string
  vertices: [number, number, number][]
  edges: [number, number][]
}

/**
 * Every edge of a Platonic solid has the same length, and it is the shortest distance between
 * any two vertices, so edges are found rather than typed in. Scaled to unit circumradius.
 */
function solid(name: string, raw: [number, number, number][]): Solid {
  const r = Math.hypot(...raw[0])
  const vertices = raw.map(([x, y, z]) => [x / r, y / r, z / r] as [number, number, number])
  const dist = (a: number, b: number) => Math.hypot(
    vertices[a][0] - vertices[b][0], vertices[a][1] - vertices[b][1], vertices[a][2] - vertices[b][2])
  let min = Infinity
  for (let a = 0; a < vertices.length; a++) for (let b = a + 1; b < vertices.length; b++) min = Math.min(min, dist(a, b))
  const edges: [number, number][] = []
  for (let a = 0; a < vertices.length; a++) {
    for (let b = a + 1; b < vertices.length; b++) if (dist(a, b) < min * (1 + 1e-6)) edges.push([a, b])
  }
  return { name, vertices, edges }
}

/** Every combination of signs on the non-zero components of (x, y, z) */
function signs(x: number, y: number, z: number): [number, number, number][] {
  const out: [number, number, number][] = []
  for (const sx of x ? [1, -1] : [1]) for (const sy of y ? [1, -1] : [1]) for (const sz of z ? [1, -1] : [1]) {
    out.push([sx * x, sy * y, sz * z])
  }
  return out
}

/** Cyclic permutations: (x, y, z), (y, z, x), (z, x, y) */
const cyclic = (pts: [number, number, number][]) =>
  pts.flatMap(([x, y, z]) => [[x, y, z], [y, z, x], [z, x, y]] as [number, number, number][])

export const SOLIDS: Solid[] = [
  solid('tetrahedron', [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]),
  solid('cube', signs(1, 1, 1)),
  solid('octahedron', cyclic(signs(1, 0, 0))),
  solid('dodecahedron', [...signs(1, 1, 1), ...cyclic(signs(0, 1 / PHI, PHI))]),
  solid('icosahedron', cyclic(signs(0, 1, PHI))),
]

/** Index of each solid's dual: the tetrahedron is its own, the others swap in pairs */
export const DUAL = [0, 2, 1, 4, 3]

/** Which solid shows at time t, and how far (0–1) the hand-over to the next one has got */
export function morphAt(t: number) {
  const slot = Math.floor(t / SHAPE_SECONDS)
  const local = t - slot * SHAPE_SECONDS
  return {
    index: slot % SOLIDS.length,
    next: (slot + 1) % SOLIDS.length,
    blend: smoothstep((local - (SHAPE_SECONDS - MORPH_SECONDS)) / MORPH_SECONDS),
  }
}

/**
 * Wireframe Platonic solids tumbling on three axes, each with its dual turning the other way
 * inside it. The solids have different vertex and edge counts, so there is no true vertex
 * morph between them: instead the outgoing solid's edges shrink to their midpoints while the
 * incoming one's grow out of theirs.
 */
export function polyhedra(): Effect2D {
  let ctx: CanvasRenderingContext2D
  let w = 0
  let h = 0
  // Projected vertices as screen x, screen y, depth; sized for the largest solid (20 vertices)
  const proj = new Float32Array(20 * 3)

  function drawSolid(s: Solid, grow: number, size: number, ax: number, ay: number, az: number, hue: number, alpha: number) {
    if (grow <= 0) return
    const cx = w / 2
    const cy = h / 2
    for (let v = 0; v < s.vertices.length; v++) {
      const [x, y, z] = s.vertices[v]
      rotate(x, y, z, ax, ay, az, proj, v * 3)
      const p = CAMERA / (CAMERA - proj[v * 3 + 2])
      proj[v * 3] = cx + proj[v * 3] * p * size
      proj[v * 3 + 1] = cy - proj[v * 3 + 1] * p * size
    }
    for (const [a, b] of s.edges) {
      const ax2 = proj[a * 3], ay2 = proj[a * 3 + 1]
      const bx = proj[b * 3], by = proj[b * 3 + 1]
      const mx = (ax2 + bx) / 2, my = (ay2 + by) / 2
      const hx = ((bx - ax2) / 2) * grow, hy = ((by - ay2) / 2) * grow
      // Depth cue: the far side of the solid is dimmer than the near side
      const depth = (proj[a * 3 + 2] + proj[b * 3 + 2]) / 2
      const light = (0.3 + 0.7 * (depth + 1) / 2) * alpha
      ctx.beginPath()
      ctx.moveTo(mx - hx, my - hy)
      ctx.lineTo(mx + hx, my + hy)
      // A wide faint stroke under a thin bright one reads as glow, far cheaper than shadowBlur
      ctx.lineWidth = 7
      ctx.strokeStyle = `hsla(${hue} 90% 60% / ${(0.12 * light).toFixed(3)})`
      ctx.stroke()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = `hsla(${hue} 90% 78% / ${light.toFixed(3)})`
      ctx.stroke()
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
      // Cleared every frame: trails faded on the canvas pulsed above 60 Hz and got brighter
      // with refresh rate (see hypercube.ts, which hit the same thing)
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'
      ctx.lineCap = 'round'

      const { index, next, blend } = morphAt(t)
      const size = Math.min(w, h) * RADIUS
      // Rotation rates chosen not to share a period, so the tumble never visibly repeats
      const ax = t * 0.31, ay = t * 0.47, az = t * 0.13
      const hue = (200 + t * 8) % 360
      const innerHue = (hue + 50) % 360

      drawSolid(SOLIDS[index], 1 - blend, size, ax, ay, az, hue, 1)
      drawSolid(SOLIDS[next], blend, size, ax, ay, az, hue, 1)
      drawSolid(SOLIDS[DUAL[index]], 1 - blend, size * INNER, -ay, -ax, az * 2, innerHue, 0.7)
      drawSolid(SOLIDS[DUAL[next]], blend, size * INNER, -ay, -ax, az * 2, innerHue, 0.7)

      ctx.globalCompositeOperation = 'source-over'
    },
    dispose() {},
  }
}
