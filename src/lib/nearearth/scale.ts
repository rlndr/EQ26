/** Unit conversions and plain-language wording for the near-Earth feeds */

export const LUNAR_DISTANCE_KM = 384_400
const AU_KM = 149_597_870.7
export const LD_PER_AU = AU_KM / LUNAR_DISTANCE_KM

export const auToLd = (au: number) => au * LD_PER_AU
export const kmToLd = (km: number) => km / LUNAR_DISTANCE_KM

/** Geostationary orbit, measured from Earth's centre */
export const GEOSTATIONARY_LD = 42_164 / LUNAR_DISTANCE_KM
/** How close JPL's close approach search looks */
export const SEARCH_LIMIT_LD = auToLd(0.05)

/** Reflectivity Sentry assumes when a size has only been estimated from brightness */
export const DEFAULT_ALBEDO = 0.154

/** Diameter in km from absolute magnitude H and albedo */
export const diameterFromH = (h: number, albedo = DEFAULT_ALBEDO) =>
  (1329 / Math.sqrt(albedo)) * Math.pow(10, -h / 5)

export interface SizeEstimate {
  centralM: number
  lowM: number
  highM: number
}

/** The range spans bright rocky objects (0.25) to dark carbon-rich ones (0.05) */
export function sizeFromH(h: number): SizeEstimate {
  return {
    centralM: diameterFromH(h) * 1000,
    lowM: diameterFromH(h, 0.25) * 1000,
    highM: diameterFromH(h, 0.05) * 1000,
  }
}

function twoFigures(x: number) {
  return Number(x.toPrecision(2)).toLocaleString('en-US')
}

export function formatLength(metres: number) {
  return metres >= 1000 ? `${twoFigures(metres / 1000)} km` : `${twoFigures(metres)} m`
}

export function formatSizeEstimate(h: number | null) {
  if (h === null) return 'Size unknown'
  const size = sizeFromH(h)
  const unit = size.highM >= 1000 ? 1000 : 1
  const suffix = unit === 1000 ? 'km' : 'm'
  return `about ${formatLength(size.centralM)} (${twoFigures(size.lowM / unit)}–${twoFigures(size.highM / unit)} ${suffix})`
}

/** "3.401e-4" reads "1 in 2,940" */
export function oddsInWords(probability: number | null) {
  if (probability === null || probability <= 0) return 'Unknown'
  if (probability >= 1) return 'Certain'
  const odds = 1 / probability
  // Whole numbers below 100: "1 in 9.74" claims a precision JPL itself warns against
  return `1 in ${(odds < 100 ? Math.round(odds) : Number(odds.toPrecision(3))).toLocaleString('en-US')}`
}

export type PalermoBand = 'none' | 'monitor' | 'above'

export function palermoBand(palermo: number): PalermoBand {
  if (palermo < -2) return 'none'
  if (palermo <= 0) return 'monitor'
  return 'above'
}

export const PALERMO_BAND_LABELS: Record<PalermoBand, string> = {
  none: 'No likely consequences',
  monitor: 'Merits careful monitoring',
  above: 'More threatening than the background hazard',
}

/** JPL's uncertainty format: "2_00:46" is days_hours:minutes, "13:02" hours:minutes, "< 00:01" tiny */
export function timeUncertaintyMinutes(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed.startsWith('<')) return 0
  const match = /^(?:(\d+)_)?(\d{1,2}):(\d{2})$/.exec(trimmed)
  if (!match) return null
  return Number(match[1] ?? 0) * 1440 + Number(match[2]) * 60 + Number(match[3])
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`

export function formatTimeUncertainty(text: string) {
  const minutes = timeUncertaintyMinutes(text)
  if (minutes === null) return 'Unknown'
  if (minutes === 0) return 'under a minute'
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  const parts = [days ? plural(days, 'day') : '', hours ? plural(hours, 'hour') : '', mins ? plural(mins, 'minute') : '']
  return parts.filter(Boolean).join(' ')
}
