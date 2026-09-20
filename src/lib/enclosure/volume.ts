export const CUIN_PER_CUFT = 1728

/** Realistic enclosure stock only. Thinner panels resonate and colour the sound. */
export const THICKNESSES = [0.75, 1] as const
export type Thickness = (typeof THICKNESSES)[number]

/** Beyond this the box is a wedge with no usable baffle left. */
export const MAX_ANGLE = 45

export interface Enclosure {
  /** Outside dimensions, inches. */
  width: number
  height: number
  /** Depth at the BOTTOM. With a sloped baffle the top is shallower. */
  depth: number
  thickness: Thickness
  /**
   * Baffle slope from vertical, degrees. 0 is a plain rectangular box; positive leans the
   * baffle back as it rises, so the top of the enclosure is shallower than the bottom.
   */
  angle: number
}

export interface Displacements {
  /** All in cubic feet. */
  driver: number
  ports: number
  bracing: number
}

const rad = (deg: number) => (deg * Math.PI) / 180

/** Outside depth at the top of the box. Equals `depth` when the baffle is vertical. */
export function topDepth(e: Enclosure): number {
  return e.depth - e.height * Math.tan(rad(e.angle))
}

/** Length of the sloped baffle panel itself — longer than the height once it leans. */
export function baffleLength(e: Enclosure): number {
  return e.height / Math.cos(rad(e.angle))
}

export interface Interior {
  width: number
  height: number
  /** Interior depth at the bottom and at the top of the cavity. */
  depthBottom: number
  depthTop: number
  /** Mean of the two — the figure that behaves like a single "interior depth". */
  meanDepth: number
}

/**
 * The cavity is everything at least one panel thickness from every face.
 *
 * For a vertical wall that costs `t` of depth, but a wall leaning at θ costs `t / cos θ`,
 * because the perpendicular thickness projects further horizontally. That is why this is not
 * simply "subtract 2t" once an angle is involved.
 *
 * Verified against brute-force numerical integration of the offset solid at 0–30°.
 */
export function interior(e: Enclosure): Interior {
  const t = e.thickness
  const r = rad(e.angle)
  const tan = Math.tan(r)
  const sec = 1 / Math.cos(r)

  // Depth of the cavity measured at height y above the outside floor:
  //   D - y*tan - t*sec - t
  const depthBottom = e.depth - t * tan - t * sec - t
  const depthTop = e.depth - (e.height - t) * tan - t * sec - t

  return {
    width: e.width - 2 * t,
    height: e.height - 2 * t,
    depthBottom,
    depthTop,
    meanDepth: (depthBottom + depthTop) / 2,
  }
}

/**
 * Gross interior volume, cubic feet.
 *
 * Integrating the cavity depth over its height collapses to the mean depth, so the wedge is
 * just width x height x mean depth:
 *   V = (W-2t)(H-2t) * [ D - t - t/cosθ - (H tanθ)/2 ]
 */
export function grossVolume(e: Enclosure): number {
  const i = interior(e)
  if (i.width <= 0 || i.height <= 0 || i.depthTop <= 0 || i.depthBottom <= 0) return 0
  return (i.width * i.height * i.meanDepth) / CUIN_PER_CUFT
}

/**
 * Problems that make the result meaningless rather than merely unusual. A small box in thick
 * stock, or too steep a baffle, can close the cavity off entirely — that must be reported
 * rather than rendered as a nonsense number.
 */
export function validate(e: Enclosure): string[] {
  const errors: string[] = []
  const min = 2 * e.thickness
  const named: [string, number][] = [
    ['Width', e.width],
    ['Height', e.height],
    ['Depth', e.depth],
  ]
  for (const [name, value] of named) {
    if (!Number.isFinite(value) || value <= 0) {
      errors.push(`${name} must be greater than zero.`)
    } else if (value <= min) {
      errors.push(
        `${name} of ${value}" leaves no interior — two ${e.thickness}" panels already take ${min}".`,
      )
    }
  }
  if (errors.length > 0) return errors

  if (!Number.isFinite(e.angle) || e.angle < 0) {
    errors.push('Baffle angle must be zero or greater.')
  } else if (e.angle > MAX_ANGLE) {
    errors.push(`Baffle angle above ${MAX_ANGLE}° leaves no usable baffle.`)
  }
  if (errors.length > 0) return errors

  if (topDepth(e) <= 0) {
    errors.push(
      `A ${e.angle}° baffle removes all ${e.depth}" of depth before reaching the top. ` +
        `Reduce the angle or the height, or increase the depth.`,
    )
    return errors
  }

  const i = interior(e)
  if (i.depthTop <= 0) {
    errors.push(
      `The baffle closes the cavity before the top at ${e.angle}°. ` +
        `The interior would need ${(e.depth - i.depthTop).toFixed(2)}" of depth to stay open.`,
    )
  }
  return errors
}

export function totalDisplacement(d: Displacements): number {
  return d.driver + d.ports + d.bracing
}

/** Net volume is what the driver actually sees. Never returns below zero. */
export function netVolume(gross: number, d: Displacements): number {
  return Math.max(0, gross - totalDisplacement(d))
}
