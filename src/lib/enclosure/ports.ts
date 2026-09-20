import { CUIN_PER_CUFT } from './volume'

export interface PortSpec {
  /** Internal diameter, inches. */
  diameter: number
  /** Length, inches. */
  length: number
  /** Number of identical ports. */
  count: number
}

/**
 * Imperial constant for the vented-box tuning equation, with Vb in cubic inches and lengths in
 * inches.
 */
const K_PORT = 1.463e7

/**
 * End correction. 0.732 is one flanged end — a tube flush with the baffle and open inside the
 * box, which is how almost every enclosure is actually built. Both-ends-flanged would be 0.823,
 * but the difference across a realistic design is well under half a hertz, far inside the
 * tolerance of the approximation itself, so it is fixed rather than exposed as another input.
 */
const END_CORRECTION = 0.732

/** Volume the port tubes steal from the box, in cubic feet. */
export function portDisplacement(p: PortSpec): number {
  if (p.count <= 0 || p.diameter <= 0 || p.length <= 0) return 0
  const r = p.diameter / 2
  return (p.count * Math.PI * r * r * p.length) / CUIN_PER_CUFT
}

/**
 * Frequency the box ends up tuned to, given ports the user has specified. This is the standard
 * port-length equation rearranged for Fb.
 *
 * `netVolumeCuFt` must be the NET volume — after port and driver displacement — since that is
 * the air the ports are actually working against.
 */
export function tuningFrequency(p: PortSpec, netVolumeCuFt: number): number | null {
  if (p.count <= 0 || p.diameter <= 0 || p.length <= 0 || netVolumeCuFt <= 0) return null
  const r = p.diameter / 2
  const effectiveLength = p.length + END_CORRECTION * r
  return Math.sqrt((K_PORT * p.count * r * r) / (effectiveLength * netVolumeCuFt * CUIN_PER_CUFT))
}

/**
 * The same equation the other way round: how long these ports would need to be to hit a target
 * tuning. Shown alongside the result, because it is what you want to know next when the number
 * comes out wrong. Returns null when the target is unreachable (the end correction alone
 * already overshoots, meaning the port would need negative length).
 */
export function lengthForTuning(
  diameter: number,
  count: number,
  targetFb: number,
  netVolumeCuFt: number,
): number | null {
  if (diameter <= 0 || count <= 0 || targetFb <= 0 || netVolumeCuFt <= 0) return null
  const r = diameter / 2
  const length =
    (K_PORT * count * r * r) / (targetFb * targetFb * netVolumeCuFt * CUIN_PER_CUFT) -
    END_CORRECTION * r
  return length > 0 ? length : null
}
