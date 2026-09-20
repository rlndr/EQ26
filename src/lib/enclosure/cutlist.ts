import { baffleLength, topDepth, type Enclosure } from './volume'

export interface Panel {
  name: string
  qty: number
  /** Inches. For a trapezoid this is the longer parallel edge. */
  width: number
  height: number
  /** Set only for trapezoidal panels: the shorter parallel edge. */
  width2?: number
  note?: string
}

/**
 * Panels for a butt-jointed rectangular box: top and bottom run the full footprint, front and
 * back sit between them, and the sides fill the remaining gap. Panel material plus the cavity
 * refills the outer shell exactly, which `verify.ts` asserts.
 *
 * Other joinery schemes produce a different cut list but the *same* interior volume, so the
 * volume maths never depends on this choice.
 */
function squareCutList(e: Enclosure): Panel[] {
  const t = e.thickness
  return [
    { name: 'Top / bottom', qty: 2, width: e.width, height: e.depth },
    { name: 'Front / back', qty: 2, width: e.width, height: e.height - 2 * t },
    { name: 'Left / right', qty: 2, width: e.depth - 2 * t, height: e.height - 2 * t },
  ]
}

/**
 * Panels for a sloped-baffle box. These are outside face sizes: the sides become trapezoids and
 * the baffle is longer than the box is tall, because it spans the slope.
 *
 * Unlike the square case these are not a tidy interlocking set — a sloped baffle needs bevelled
 * edges where it meets the top and bottom, and the bevel angle depends on the joinery chosen.
 * The sizes below are the faces before bevelling.
 */
function slopedCutList(e: Enclosure): Panel[] {
  const dTop = topDepth(e)
  return [
    { name: 'Bottom', qty: 1, width: e.width, height: e.depth },
    { name: 'Top', qty: 1, width: e.width, height: dTop },
    { name: 'Back', qty: 1, width: e.width, height: e.height },
    {
      name: 'Baffle (sloped)',
      qty: 1,
      width: e.width,
      height: baffleLength(e),
      note: `bevel top and bottom edges to ${e.angle}°`,
    },
    {
      name: 'Left / right',
      qty: 2,
      width: e.depth,
      width2: dTop,
      height: e.height,
      note: 'trapezoid',
    },
  ]
}

export function cutList(e: Enclosure): Panel[] {
  return e.angle > 0 ? slopedCutList(e) : squareCutList(e)
}

/** Total panel area in square feet, for estimating sheet goods. */
export function boardArea(panels: Panel[]): number {
  return panels.reduce((sum, p) => {
    // A trapezoid's area is its mean parallel edge times its height
    const effectiveWidth = p.width2 === undefined ? p.width : (p.width + p.width2) / 2
    return sum + (p.qty * effectiveWidth * p.height) / 144
  }, 0)
}

/** True when the cut list is the exact interlocking set rather than the bevelled approximation. */
export function isExactCutList(e: Enclosure): boolean {
  return e.angle <= 0
}
