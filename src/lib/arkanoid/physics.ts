export interface Hit {
  axis: 'x' | 'y'
  /** Signed distance to push the ball back out along that axis. */
  push: number
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/**
 * Overlap test between the ball and an axis-aligned box, resolving on the axis of least
 * penetration.
 *
 * The ball is treated as a box of half-size `r` rather than a circle. At a 5-unit ball against
 * 16x8 bricks the two are visually indistinguishable, and the box form is far more stable at
 * shared brick corners, where exact circle-corner maths tends to produce jitter or double
 * reflections.
 */
export function boxHit(
  cx: number, cy: number, r: number,
  bx: number, by: number, bw: number, bh: number,
): Hit | null {
  const hw = bw / 2
  const hh = bh / 2
  const ox = r + hw - Math.abs(cx - (bx + hw))
  const oy = r + hh - Math.abs(cy - (by + hh))
  if (ox <= 0 || oy <= 0) return null

  if (ox < oy) return { axis: 'x', push: cx < bx + hw ? -ox : ox }
  return { axis: 'y', push: cy < by + hh ? -oy : oy }
}
