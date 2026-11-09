/** Shared energy scale for the ladder. Everything is in kilotons of TNT. */

export const ktFromMt = (mt: number) => mt * 1000

export const HIROSHIMA_KT = 15

export interface EnergyReference {
  id: string
  label: string
  kt: number
  /** How the figure is known */
  note: string
}

export const LADDER: EnergyReference[] = [
  { id: 'hiroshima', label: 'Hiroshima bomb', kt: HIROSHIMA_KT, note: 'Historical' },
  { id: 'chelyabinsk', label: 'Chelyabinsk, 2013', kt: 441, note: 'NASA fireball record' },
  { id: 'tunguska', label: 'Tunguska, 1908', kt: ktFromMt(10), note: 'Estimate, usually 3–15 Mt' },
  { id: 'tsar', label: 'Tsar Bomba', kt: ktFromMt(50), note: 'Historical' },
  { id: 'chicxulub', label: 'Chicxulub, the dinosaur impact', kt: ktFromMt(100_000_000), note: 'Estimate' },
]

/** The ladder runs from 0.01 kt to 10¹² kt */
const LOG_MIN = -2
const LOG_MAX = 12

/** Position on the ladder, 0 to 1 */
export const ladderFraction = (kt: number) =>
  Math.min(1, Math.max(0, (Math.log10(Math.max(kt, 1e-9)) - LOG_MIN) / (LOG_MAX - LOG_MIN)))

function figures(x: number) {
  if (x >= 1000) return Math.round(x).toLocaleString('en-US')
  return String(Number(x.toPrecision(x < 10 ? 2 : 3)))
}

export function formatEnergy(kt: number) {
  return kt < 1000 ? `${figures(kt)} kt` : `${figures(kt / 1000)} Mt`
}

export function comparedToHiroshima(kt: number) {
  const times = kt / HIROSHIMA_KT
  if (times >= 2) return `${Number(times.toPrecision(2)).toLocaleString('en-US')} × Hiroshima`
  if (times >= 0.5) return 'About the same as Hiroshima'
  return `${Math.round(times * 100)}% of Hiroshima`
}
