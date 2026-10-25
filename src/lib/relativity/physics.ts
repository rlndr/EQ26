/**
 * Core special relativity formulas and slider mappings.
 *
 * Velocities are represented as β = v / c in [0, 1).
 * Exact SI speed of light: c = 299,792.458 km/s.
 */

export const C_KMS = 299_792.458
export const C_MPH = 670_616_629

export const MAX_BETA_LINEAR = 0.9999
export const MIN_BETA_ULTRA = 0.9
export const MAX_BETA_ULTRA = 0.99999

/** Default velocity β = √3 / 2 ≈ 0.8660254c, where γ = 2.000 exactly. */
export const DEFAULT_BETA = Math.sqrt(3) / 2

export interface VelocityPreset {
  label: string
  beta: number
  title?: string
}

export const VELOCITY_PRESETS: VelocityPreset[] = [
  { label: 'Parker Probe (0.00064c)', beta: 0.00064, title: 'Fastest human spacecraft (~192 km/s)' },
  { label: '0.10c', beta: 0.1 },
  { label: '0.50c', beta: 0.5 },
  { label: '0.866c (2× Slowdown)', beta: DEFAULT_BETA },
  { label: '0.99c (7.1×)', beta: 0.99 },
  { label: '0.999c (22.4×)', beta: 0.999 },
  { label: '0.9999c (70.7×)', beta: 0.9999 },
]

export function clampBeta(beta: number): number {
  if (!Number.isFinite(beta) || beta <= 0) return 0
  return Math.min(MAX_BETA_ULTRA, beta)
}

/**
 * Lorentz factor γ = 1 / √(1 − β²).
 * Clamps β just below 1 so accidental boundary inputs stay finite.
 */
export function lorentzGamma(beta: number): number {
  if (!Number.isFinite(beta) || beta <= 0) return 1.0
  const b = Math.min(0.9999999, beta)
  return 1 / Math.sqrt(1 - b * b)
}

/** Inverse Lorentz relation: β = √(1 − 1/γ²). */
export function betaFromGamma(gamma: number): number {
  if (!Number.isFinite(gamma) || gamma <= 1) return 0
  return Math.sqrt(1 - 1 / (gamma * gamma))
}

/** Proper clock tick rate relative to stationary observer: Δt' / Δt = 1 / γ = √(1 − β²). */
export function tickRate(beta: number): number {
  return 1 / lorentzGamma(beta)
}

/** Relativistic length contraction ratio L / L₀ = 1 / γ along the axis of motion. */
export function lengthContraction(beta: number): number {
  return 1 / lorentzGamma(beta)
}

export function speedKms(beta: number): number {
  return clampBeta(beta) * C_KMS
}

export function speedMph(beta: number): number {
  return clampBeta(beta) * C_MPH
}

/**
 * Maps a slider position in [0, 1000] to β = v / c.
 * - Standard mode: linear from 0 to 0.9999c
 * - Ultra-relativistic mode: logarithmic zoom across "the nines" from 0.90c to 0.99999c
 *   via β(t) = 1 − 0.1 × 10^(−4t)
 */
export function sliderToBeta(sliderVal: number, isUltra: boolean): number {
  const t = Math.max(0, Math.min(1, sliderVal / 1000))
  if (!isUltra) {
    return t * MAX_BETA_LINEAR
  }
  return 1 - 0.1 * Math.pow(10, -4 * t)
}

/**
 * Inverse of sliderToBeta: maps β = v / c to a slider position in [0, 1000].
 */
export function betaToSlider(beta: number, isUltra: boolean): number {
  if (!isUltra) {
    const clamped = Math.max(0, Math.min(MAX_BETA_LINEAR, beta))
    return (clamped / MAX_BETA_LINEAR) * 1000
  }
  const clamped = Math.max(MIN_BETA_ULTRA, Math.min(MAX_BETA_ULTRA, beta))
  const t = -Math.log10((1 - clamped) / 0.1) / 4
  return Math.max(0, Math.min(1, t)) * 1000
}

export function formatBeta(beta: number): string {
  const b = clampBeta(beta)
  if (b === 0) return '0.0000 c'
  if (b < 0.01) return `${b.toFixed(5)} c`
  if (b > 0.999) return `${b.toFixed(5)} c`
  return `${b.toFixed(4)} c`
}

export function formatClockTime(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds)
  const hrs = Math.floor(safe / 3600)
  const mins = Math.floor((safe % 3600) / 60)
  const secs = safe % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  const secStr = secs.toFixed(2).padStart(5, '0')
  return `${pad(hrs)}:${pad(mins)}:${secStr}`
}

