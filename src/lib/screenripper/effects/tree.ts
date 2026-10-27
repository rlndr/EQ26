import { randomSeed, rng, smoothstep } from '../math'
import type { Effect2D } from '../types'

/** Branching levels below the trunk; 2^(DEPTH+1) − 1 = 2047 branches */
export const DEPTH = 10
const NODES = 2 ** (DEPTH + 1) - 1
/** Each tree lives this long; three fill one 60-second auto-cycle slot */
export const TREE_SECONDS = 20
/** Time for the tree to grow from seed to its tips */
const GROW_SECONDS = 7
/** The tree fades out over the end of its life */
const FADE_SECONDS = 1.5
/** Wind bend per level at the tips, radians; it accumulates up the tree */
export const SWAY = 0.035
/** Share of the stage the unswayed tree is fitted into, leaving room for sway */
export const FIT_W = 0.9
export const FIT_H = 0.86
/** Trunk base sits this far up from the bottom, as a fraction of height */
export const BASE = 0.04

export interface TreeShape {
  /** Angle of each branch relative to its parent; heap order, children of i at 2i+1 and 2i+2 */
  turn: Float32Array
  /** Length of each branch relative to the trunk */
  length: Float32Array
  hue: number
}

/** One tree's shape from its seed: overall spread and taper, plus a jitter on every branch */
export function growTree(seed: number): TreeShape {
  const rand = rng(seed)
  const spread = 0.32 + rand() * 0.28
  const taper = 0.68 + rand() * 0.08
  const lean = (rand() - 0.5) * 0.3
  const turn = new Float32Array(NODES)
  const length = new Float32Array(NODES)
  length[0] = 1
  turn[0] = 0
  for (let i = 1; i < NODES; i++) {
    const parent = (i - 1) >> 1
    const left = i % 2 === 1
    turn[i] = (left ? spread : -spread) + lean + (rand() - 0.5) * 0.5
    length[i] = length[parent] * taper * (0.85 + rand() * 0.25)
  }
  return { turn, length, hue: rand() * 360 }
}

const depthOf = (i: number) => Math.floor(Math.log2(i + 1))
// Scratch for layout(); shared because only one tree draws at a time, and it saves an
// allocation every frame
const ANGLE = new Float32Array(NODES)

/**
 * Branch end points for the whole tree with the given wind: `bend[k]` is added to the turn of
 * every branch at depth k, plus a small per-branch flutter at the tips. Trunk starts at (0, 0)
 * pointing up (+y), in trunk-length units. Writes into `out` as x0, y0, x1, y1 per branch.
 */
export function layout(shape: TreeShape, bend: Float32Array, flutter: number, out: Float32Array) {
  const angle = ANGLE
  for (let i = 0; i < NODES; i++) {
    const k = depthOf(i)
    const parent = (i - 1) >> 1
    const x0 = i === 0 ? 0 : out[parent * 4 + 2]
    const y0 = i === 0 ? 0 : out[parent * 4 + 3]
    const leaf = k >= DEPTH - 2 ? flutter * Math.sin(i * 1.7) : 0
    angle[i] = (i === 0 ? Math.PI / 2 : angle[parent]) + shape.turn[i] + bend[k] + leaf
    out[i * 4] = x0
    out[i * 4 + 1] = y0
    out[i * 4 + 2] = x0 + Math.cos(angle[i]) * shape.length[i]
    out[i * 4 + 3] = y0 + Math.sin(angle[i]) * shape.length[i]
  }
}

/**
 * Bounding box of a laid-out tree, always including the trunk base at (0, 0). minY matters:
 * with a wide spread the outermost branches turn the same way at every level and can curl
 * round below the base.
 */
export function bounds(seg: Float32Array) {
  let minX = 0, maxX = 0, minY = 0, maxY = 0
  for (let i = 0; i < NODES; i++) {
    minX = Math.min(minX, seg[i * 4 + 2])
    maxX = Math.max(maxX, seg[i * 4 + 2])
    minY = Math.min(minY, seg[i * 4 + 3])
    maxY = Math.max(maxY, seg[i * 4 + 3])
  }
  return { minX, maxX, minY, maxY }
}

/** Scale and offset that fit a tree with these bounds into a w × h stage, trunk at the bottom */
export function fitTree(b: ReturnType<typeof bounds>, w: number, h: number) {
  const scale = Math.min((h * FIT_H) / (b.maxY - b.minY), (w * FIT_W) / (b.maxX - b.minX))
  return {
    scale,
    ox: w / 2 - ((b.minX + b.maxX) / 2) * scale,
    // Lowest point of the tree, not necessarily the trunk base, sits at BASE
    oy: h * (1 - BASE) + b.minY * scale,
  }
}

/** Wind bend for each depth at time t: a wave that travels up the tree, stronger at the tips */
export function wind(t: number, out: Float32Array) {
  for (let k = 0; k <= DEPTH; k++) {
    const reach = k / DEPTH
    out[k] = SWAY * reach * (Math.sin(t * 0.9 - k * 0.35) + 0.5 * Math.sin(t * 1.7 + k * 0.6))
  }
}

/**
 * A recursive tree that grows level by level from a seed, sways in a wind that travels up its
 * branches, blossoms at the tips, then fades and regrows with a new shape.
 */
export function fractalTree(seed = randomSeed()): Effect2D {
  let ctx: CanvasRenderingContext2D
  let w = 0
  let h = 0
  const seg = new Float32Array(NODES * 4)
  const still = new Float32Array(DEPTH + 1)
  const bend = new Float32Array(DEPTH + 1)
  let treeIndex = -1
  let shape: TreeShape
  // Fit computed once per tree from its unswayed shape, so the scale does not breathe
  let box = { minX: 0, maxX: 0, minY: 0, maxY: 1 }

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
      const index = Math.floor(t / TREE_SECONDS)
      if (index !== treeIndex) {
        treeIndex = index
        shape = growTree(seed + index)
        layout(shape, still, 0, seg)
        box = bounds(seg)
      }
      const local = t - index * TREE_SECONDS

      wind(t, bend)
      layout(shape, bend, 0.04 * Math.sin(t * 2.3), seg)

      const { scale, ox, oy } = fitTree(box, w, h)

      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      const life = 1 - smoothstep((local - (TREE_SECONDS - FADE_SECONDS)) / FADE_SECONDS)
      const grown = (local / GROW_SECONDS) * (DEPTH + 1)
      ctx.lineCap = 'round'

      // One path per depth: every branch at a depth shares a width and colour
      for (let k = 0; k <= DEPTH; k++) {
        const f = Math.min(1, Math.max(0, grown - k))
        if (f <= 0) break
        ctx.beginPath()
        for (let i = 2 ** k - 1; i < 2 ** (k + 1) - 1; i++) {
          const x0 = seg[i * 4], y0 = seg[i * 4 + 1]
          const x1 = x0 + (seg[i * 4 + 2] - x0) * f
          const y1 = y0 + (seg[i * 4 + 3] - y0) * f
          ctx.moveTo(ox + x0 * scale, oy - y0 * scale)
          ctx.lineTo(ox + x1 * scale, oy - y1 * scale)
        }
        // Trunk is warm bark, tips are the tree's own colour
        const u = k / DEPTH
        const hue = 30 + (((shape.hue - 30 + 540) % 360) - 180) * u
        ctx.lineWidth = Math.max(0.8, scale * 0.05 * Math.pow(0.68, k))
        ctx.strokeStyle = `hsla(${hue.toFixed(1)} ${(35 + 50 * u).toFixed(0)}% ${(32 + 33 * u).toFixed(0)}% / ${life.toFixed(3)})`
        ctx.stroke()
      }

      // Blossom once the tips have finished growing
      const bloom = smoothstep(grown - (DEPTH + 1)) * life
      if (bloom > 0) {
        const r = Math.max(1.2, scale * 0.012)
        ctx.beginPath()
        for (let i = 2 ** DEPTH - 1; i < NODES; i++) {
          const x = ox + seg[i * 4 + 2] * scale
          const y = oy - seg[i * 4 + 3] * scale
          ctx.moveTo(x + r, y)
          ctx.arc(x, y, r, 0, Math.PI * 2)
        }
        ctx.fillStyle = `hsla(${((shape.hue + 20) % 360).toFixed(1)} 90% 75% / ${(0.8 * bloom).toFixed(3)})`
        ctx.fill()
      }
    },
    dispose() {},
  }
}
