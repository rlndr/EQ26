import { clamp, DEG, EARTH_RADIUS_KM, RAD, wrap360, type LatLon } from './astro'

export const GRID_W = 360
export const GRID_H = 181
export const GRID_CELLS = GRID_W * GRID_H

/** Aurora percentage per 1° cell: index = (lat + 90) · 360 + lon, lon 0–359, lat −90–90 */
export type AuroraField = Uint8Array

export const newField = (): AuroraField => new Uint8Array(GRID_CELLS)
export const cellIndex = (lon: number, lat: number) => (lat + 90) * GRID_W + lon

/** Bilinear lookup, wrapping across the 359°→0° seam */
export function sampleField(field: AuroraField, lat: number, lon: number) {
  const y = clamp(lat + 90, 0, GRID_H - 1)
  const x = wrap360(lon)
  const x0 = Math.floor(x) % GRID_W
  const x1 = (x0 + 1) % GRID_W
  const y0 = Math.floor(y)
  const y1 = Math.min(y0 + 1, GRID_H - 1)
  const fx = x - Math.floor(x)
  const fy = y - y0
  const at = (cx: number, cy: number) => field[cy * GRID_W + cx]
  return (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy
}

/** Below this the cell draws nothing */
const FADE_START = 3
/** At and above this the curve applies in full */
const FADE_END = 8

/**
 * Percentage to glow. One fixed curve, deliberately never scaled to the grid's own maximum: quiet
 * days are the normal case (21% was the peak when this was written), and normalising would make
 * every one of them look like a major storm. The short fade-in stops the outline of the oval
 * showing as a hard step at the 1° cell size.
 */
export function brightness(percent: number) {
  if (percent <= FADE_START) return 0
  const t = clamp((percent - FADE_START) / (FADE_END - FADE_START), 0, 1)
  return Math.pow(Math.min(1, percent / 60), 0.6) * (t * t * (3 - 2 * t))
}

/** The grid as the GPU wants it: brightness 0–255, so the curve above lives in exactly one place */
export function brightnessField(field: AuroraField, out: Uint8Array) {
  for (let i = 0; i < field.length; i++) out[i] = Math.round(brightness(field[i]) * 255)
  return out
}

/** Lowest absolute latitude that draws anything; lets the shader skip rays that cannot hit aurora */
export function lowestLitLatitude(field: AuroraField) {
  let lowest = 90
  for (let lat = 0; lat <= 90; lat++) {
    for (let lon = 0; lon < GRID_W; lon++) {
      if (field[cellIndex(lon, lat)] > FADE_START || field[cellIndex(lon, -lat)] > FADE_START) {
        lowest = lat
        return lowest
      }
    }
  }
  return lowest
}

// Trig for every grid line, computed once, because a scan touches all 65,160 cells
const SIN_LAT = Float64Array.from({ length: GRID_H }, (_, i) => Math.sin((i - 90) * RAD))
const COS_LAT = Float64Array.from({ length: GRID_H }, (_, i) => Math.cos((i - 90) * RAD))
const SIN_LON = Float64Array.from({ length: GRID_W }, (_, i) => Math.sin(i * RAD))
const COS_LON = Float64Array.from({ length: GRID_W }, (_, i) => Math.cos(i * RAD))

export function distanceKm(a: LatLon, b: LatLon) {
  const cosC = Math.sin(a.lat * RAD) * Math.sin(b.lat * RAD)
    + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((a.lon - b.lon) * RAD)
  return Math.acos(clamp(cosC, -1, 1)) * EARTH_RADIUS_KM
}

/** Initial compass bearing from a to b, 0–360° */
export function bearingDeg(a: LatLon, b: LatLon) {
  const dLon = (b.lon - a.lon) * RAD
  const y = Math.sin(dLon) * Math.cos(b.lat * RAD)
  const x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD)
    - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos(dLon)
  return wrap360(Math.atan2(y, x) * DEG)
}

export const VIEW_RADIUS_KM = 1000
/** Cells with at least this much count as "the oval" when saying how far away it is */
export const OVAL_THRESHOLD = 10

export interface SkyPoint extends LatLon {
  percent: number
  distanceKm: number
  bearingDeg: number
}

export interface ViewScan {
  /** Forecast percentage directly overhead */
  overhead: number
  /** Best weighted value within sight */
  pView: number
  /** The cell that gave pView; null when nothing is in sight */
  best: SkyPoint | null
  /** Closest cell anywhere of at least OVAL_THRESHOLD; null when the grid has none */
  nearest: SkyPoint | null
}

/**
 * What an observer here could see. NOAA says bright aurora can be seen from as far as 1000 km away,
 * so cells within that range count, discounted linearly to half value at the limit.
 */
export function scanView(field: AuroraField, here: LatLon): ViewScan {
  const sinHere = Math.sin(here.lat * RAD)
  const cosHere = Math.cos(here.lat * RAD)
  const sinLon = Math.sin(here.lon * RAD)
  const cosLon = Math.cos(here.lon * RAD)

  let pView = 0
  let bestIndex = -1
  let bestPercent = 0
  let nearestCos = -2
  let nearestIndex = -1
  const viewCos = Math.cos(VIEW_RADIUS_KM / EARTH_RADIUS_KM)

  for (let i = 0; i < field.length; i++) {
    const percent = field[i]
    if (percent === 0) continue
    const row = Math.floor(i / GRID_W)
    const col = i - row * GRID_W
    const cosC = sinHere * SIN_LAT[row]
      + cosHere * COS_LAT[row] * (cosLon * COS_LON[col] + sinLon * SIN_LON[col])
    if (percent >= OVAL_THRESHOLD && cosC > nearestCos) {
      nearestCos = cosC
      nearestIndex = i
    }
    if (cosC >= viewCos) {
      const km = Math.acos(clamp(cosC, -1, 1)) * EARTH_RADIUS_KM
      const weighted = percent * (1 - 0.5 * (km / VIEW_RADIUS_KM))
      if (weighted > pView) {
        pView = weighted
        bestIndex = i
        bestPercent = percent
      }
    }
  }

  const point = (i: number, percent: number): SkyPoint => {
    const row = Math.floor(i / GRID_W)
    const cell = { lat: row - 90, lon: i - row * GRID_W }
    return { ...cell, percent, distanceKm: distanceKm(here, cell), bearingDeg: bearingDeg(here, cell) }
  }

  return {
    overhead: sampleField(field, here.lat, here.lon),
    pView,
    best: bestIndex >= 0 ? point(bestIndex, bestPercent) : null,
    nearest: nearestIndex >= 0 ? point(nearestIndex, field[nearestIndex]) : null,
  }
}

/** The strongest cell currently in darkness, for pointing the camera somewhere worth looking */
export function strongestInDarkness(field: AuroraField, subSolar: LatLon): LatLon | null {
  const sinSun = Math.sin(subSolar.lat * RAD)
  const cosSun = Math.cos(subSolar.lat * RAD)
  const sinLon = Math.sin(subSolar.lon * RAD)
  const cosLon = Math.cos(subSolar.lon * RAD)
  let best = -1
  let bestPercent = 0
  for (let i = 0; i < field.length; i++) {
    if (field[i] <= bestPercent) continue
    const row = Math.floor(i / GRID_W)
    const col = i - row * GRID_W
    const cosAngle = sinSun * SIN_LAT[row]
      + cosSun * COS_LAT[row] * (cosLon * COS_LON[col] + sinLon * SIN_LON[col])
    if (cosAngle < -0.1) {
      best = i
      bestPercent = field[i]
    }
  }
  if (best < 0) return null
  const row = Math.floor(best / GRID_W)
  const lon = best - row * GRID_W
  return { lat: row - 90, lon: lon > 180 ? lon - 360 : lon }
}
