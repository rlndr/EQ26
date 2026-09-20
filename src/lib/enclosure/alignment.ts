export const LITRES_PER_CUFT = 28.3168466

/** Thiele-Small parameters, as published on any driver's spec sheet. */
export interface Driver {
  /** Equivalent compliance volume, cubic feet. */
  vas: number
  /** Total Q factor at resonance. */
  qts: number
  /** Free-air resonant frequency, Hz. */
  fs: number
}

export const litresToCuFt = (l: number) => l / LITRES_PER_CUFT
export const cuFtToLitres = (f: number) => f * LITRES_PER_CUFT

export interface Target {
  /** Recommended net internal volume, cubic feet. */
  vb: number
  /** System resonance (sealed) or port tuning (ported), Hz. */
  f: number
  /** -3 dB point, Hz. */
  f3: number
}

export function hasDriver(d: Driver): boolean {
  return d.vas > 0 && d.qts > 0 && d.fs > 0
}

/**
 * Sealed (acoustic suspension) alignment for a chosen system Q. Qtc 0.707 is the Butterworth,
 * maximally flat choice; lower is tighter and rolls off earlier, higher gives a bump at
 * resonance.
 *
 * Returns null when Qts >= Qtc. That is not an error to swallow: the formula divides through a
 * non-positive number, and what it means is that this driver cannot reach that system Q in any
 * sealed box, however large. The caller should say so.
 */
export const BUTTERWORTH_Q = Math.SQRT1_2 // 0.7071..., conventionally written 0.707

export function sealedTarget(d: Driver, qtc: number = BUTTERWORTH_Q): Target | null {
  if (!hasDriver(d) || qtc <= 0 || d.qts >= qtc) return null

  const ratio = qtc / d.qts
  const vb = d.vas / (ratio * ratio - 1)
  const fc = d.fs * ratio

  // At qtc = 1/sqrt(2) this reduces to exactly f3 === fc, the defining property of a Butterworth
  // alignment — a free check that the implementation is right. (It only holds to 4 decimal
  // places against the rounded 0.707, which is why BUTTERWORTH_Q carries the full value.)
  const a = 1 / (qtc * qtc) - 2
  const f3 = fc * Math.sqrt((a + Math.sqrt(a * a + 4)) / 2)

  return { vb, f: fc, f3 }
}

/**
 * Ported (bass reflex) alignment, using the standard Small approximations for a QB3-type
 * response. These are published approximations rather than a full transfer-function
 * simulation — the right level of precision for a web tool, but not a substitute for WinISD.
 */
export function portedTarget(d: Driver): Target | null {
  if (!hasDriver(d)) return null
  return {
    vb: 20 * d.vas * Math.pow(d.qts, 3.3),
    f: 0.42 * d.fs * Math.pow(d.qts, -0.9),
    f3: 0.26 * d.fs * Math.pow(d.qts, -1.4),
  }
}

/** Signed percentage difference of `actual` against `target`. */
export function deviation(actual: number, target: number): number | null {
  if (!Number.isFinite(actual) || !Number.isFinite(target) || target <= 0) return null
  return ((actual - target) / target) * 100
}

export type Verdict = 'good' | 'close' | 'off'

/** Within 10% is a good match; within 25% is workable. Deliberately forgiving — the
 *  alignment formulas themselves are approximations. */
export function verdict(percent: number | null): Verdict {
  if (percent === null) return 'off'
  const m = Math.abs(percent)
  if (m <= 10) return 'good'
  if (m <= 25) return 'close'
  return 'off'
}
