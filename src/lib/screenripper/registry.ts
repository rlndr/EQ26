import { flowField } from './effects/flowfield'
import { hypercube } from './effects/hypercube'
import { julia } from './effects/julia'
import { mandelbrot } from './effects/mandelbrot'
import { mystify } from './effects/mystify'
import { polyhedra } from './effects/polyhedra'
import { spirograph } from './effects/spirograph'
import { starfield } from './effects/starfield'
import { fractalTree } from './effects/tree'
import { tunnel } from './effects/tunnel'
import type { Entry } from './types'

/** Key `1` is index 0 … key `9` is index 8, key `0` is index 9 */
export function keyLabel(index: number) {
  return index === 9 ? '0' : String(index + 1)
}

/** Reads `ev.key`, not `ev.code`, so the number row and the numpad both work */
export function keyToIndex(key: string): number | null {
  if (key.length !== 1 || key < '0' || key > '9') return null
  const index = key === '0' ? 9 : Number(key) - 1
  return index < EFFECTS.length ? index : null
}

/**
 * The ten patterns in key order (agreed 2026-10-26; Hypercube replaced Plasma on 7 the same day).
 * Swapping slots is a matter of reordering.
 */
export const EFFECTS: Entry[] = [
  { name: 'Polyhedra', kind: '2d', create: polyhedra },
  { name: 'Starfield', kind: '2d', create: () => starfield() },
  { name: 'Mystify', kind: '2d', create: () => mystify() },
  { name: 'Spirograph', kind: '2d', create: () => spirograph() },
  { name: 'Fractal Tree', kind: '2d', create: () => fractalTree() },
  { name: 'Flow Field', kind: '2d', create: () => flowField() },
  { name: 'Hypercube', kind: '2d', create: () => hypercube() },
  { name: 'Mandelbrot Zoom', kind: 'gl', create: mandelbrot },
  { name: 'Julia Morph', kind: 'gl', create: () => julia() },
  { name: 'Tunnel', kind: 'gl', create: tunnel },
]
