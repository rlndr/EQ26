import { clamp, DEG, EARTH_RADIUS_KM, moonState, subSolarPoint, sunAltitude, type LatLon } from './astro'
import { compassPoint } from './format'
import { newField, scanView, type ViewScan } from './grid'
import { cloudAt, kpAt, type CloudForecast, type KpRow } from './parse'
import { fillStorm, stormFromKp } from './stormModel'

export type Band = 'Unlikely' | 'Slight' | 'Possible' | 'Good'

export interface VisibilityInput {
  pView: number
  sunAlt: number
  /** Percent, or null when no forecast is available, which then does not count against it */
  cloud: number | null
  moonAlt: number
  moonIllum: number
}

export interface Score {
  A: number
  D: number
  C: number
  M: number
  score: number
  band: Band
}

export function darknessFactor(sunAlt: number) {
  if (sunAlt > -6) return 0
  if (sunAlt > -12) return 0.35
  if (sunAlt > -18) return 0.8
  return 1
}

/** This site's own heuristic, not a NOAA product, and the page says so */
export function visibilityScore(input: VisibilityInput): Score {
  const A = Math.min(1, input.pView / 50)
  const D = darknessFactor(input.sunAlt)
  const C = input.cloud === null ? 1 : 1 - 0.9 * (clamp(input.cloud, 0, 100) / 100)
  const M = input.moonAlt > 0 ? 1 - 0.25 * input.moonIllum : 1
  const score = A * D * C * M
  const band: Band = score < 0.05 ? 'Unlikely' : score < 0.2 ? 'Slight' : score < 0.5 ? 'Possible' : 'Good'
  return { A, D, C, M, score, band }
}

/** How high above the horizon something at this altitude appears from this far away, degrees */
export function elevationAngle(distanceKm: number, heightKm: number) {
  const theta = distanceKm / EARTH_RADIUS_KM
  if (theta < 1e-6) return 90
  return Math.atan2(Math.cos(theta) - EARTH_RADIUS_KM / (EARTH_RADIUS_KM + heightKm), Math.sin(theta)) * DEG
}

/** Height of the aurora's lower border, km */
export const LOWER_BORDER_KM = 110

export type Tone = 'good' | 'fair' | 'poor'

export interface Factor {
  label: string
  text: string
  tone: Tone
}

const roundKm = (km: number) => (km < 1000 ? Math.round(km / 10) * 10 : Math.round(km / 50) * 50).toLocaleString()

export function auroraFactor(scan: ViewScan): Factor {
  const label = 'Aurora'
  const best = scan.best
  if (best) {
    const where = best.distanceKm < 60
      ? 'overhead'
      : `${roundKm(best.distanceKm)} km to the ${compassPoint(best.bearingDeg)}, about ${Math.max(1, Math.round(elevationAngle(best.distanceKm, LOWER_BORDER_KM)))}° up`
    return { label, text: `${Math.round(best.percent)}% forecast, ${where}`, tone: best.percent >= 30 ? 'good' : best.percent >= 10 ? 'fair' : 'poor' }
  }
  if (scan.nearest) {
    return { label, text: `Oval is ${roundKm(scan.nearest.distanceKm)} km to the ${compassPoint(scan.nearest.bearingDeg)}, too far to see`, tone: 'poor' }
  }
  return { label, text: 'None forecast anywhere right now', tone: 'poor' }
}

export function darknessFactorText(sunAlt: number): Factor {
  const label = 'Darkness'
  if (sunAlt > -6) return { label, text: sunAlt > 0 ? 'Sun is up' : 'Too bright, Sun only just set', tone: 'poor' }
  if (sunAlt > -12) return { label, text: 'Twilight, only a strong display would show', tone: 'poor' }
  if (sunAlt > -18) return { label, text: 'Dark enough', tone: 'fair' }
  return { label, text: 'Fully dark', tone: 'good' }
}

export function cloudFactor(cloud: number | null, loading: boolean): Factor {
  const label = 'Cloud'
  if (cloud === null) return { label, text: loading ? 'Checking the forecast…' : 'Forecast unavailable, not counted', tone: 'fair' }
  const pct = Math.round(cloud)
  if (pct < 25) return { label, text: `${pct}% cover, mostly clear`, tone: 'good' }
  if (pct < 70) return { label, text: `${pct}% cover, partly cloudy`, tone: 'fair' }
  return { label, text: `${pct}% cover`, tone: 'poor' }
}

export function moonFactor(moonAlt: number, illumination: number): Factor {
  const label = 'Moon'
  const pct = Math.round(illumination * 100)
  if (moonAlt <= 0) return { label, text: 'Below the horizon', tone: 'good' }
  return { label, text: `Up, ${pct}% lit`, tone: pct > 60 ? 'fair' : 'good' }
}

export interface TonightCell {
  t: number
  sunAlt: number
  cloud: number | null
  kp: number | null
  score: Score | null
}

export const TONIGHT_HOURS = 12

/**
 * The next twelve hours for a location. NOAA's grid only reaches 30–90 minutes ahead, so each hour
 * uses the modelled oval for that hour's forecast Kp.
 */
export function buildTonight(startMs: number, here: LatLon, clouds: CloudForecast | undefined, kpRows: KpRow[] | undefined): TonightCell[] {
  const hour = 3600_000
  const first = Math.floor(startMs / hour) * hour
  const field = newField()
  return Array.from({ length: TONIGHT_HOURS }, (_, i): TonightCell => {
    const t = first + i * hour
    const sunAlt = sunAltitude(here.lat, here.lon, t)
    const cloud = cloudAt(clouds, t)
    const kp = kpRows ? kpAt(kpRows, t)?.kp ?? null : null
    if (kp === null) return { t, sunAlt, cloud, kp, score: null }
    fillStorm(field, stormFromKp(kp), subSolarPoint(t))
    const moon = moonState(here.lat, here.lon, t)
    const score = visibilityScore({
      pView: scanView(field, here).pView, sunAlt, cloud, moonAlt: moon.altDeg, moonIllum: moon.illumination,
    })
    return { t, sunAlt, cloud, kp, score }
  })
}
