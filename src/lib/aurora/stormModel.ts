import { RAD, latLonToVec, type LatLon } from './astro'
import { magneticAngleVec, magneticLatitudeVec } from './geomag'
import { GRID_CELLS, GRID_H, GRID_W, type AuroraField } from './grid'

/**
 * A simplified auroral oval for moments NOAA's grid cannot cover: hours ahead, and storms from
 * history. It is an illustration, always labelled as simulated on the page. It writes the same
 * 360×181 array as the live feed, so the globe and the viewing panel need no special case.
 */

export interface StormSetting {
  /** Equatorward edge at magnetic midnight, degrees of magnetic latitude */
  edgeMlat: number
  /** Width of the oval, degrees */
  width: number
  /** Peak forecast percentage */
  strength: number
}

/** NOAA's rule of thumb: about 66° at Kp 0, moving about 2° equatorward per Kp level */
export const edgeFromKp = (kp: number) => 66 - 2 * kp

export function stormFromKp(kp: number): StormSetting {
  return { edgeMlat: edgeFromKp(kp), width: 5 + 1.2 * kp, strength: Math.min(100, 12 + 9.5 * kp) }
}

export interface StormPreset {
  id: string
  label: string
  detail: string
  /** Null for storms off the top of the Kp scale */
  kp: number | null
  setting: StormSetting
}

export const STORM_PRESETS: StormPreset[] = [
  { id: 'quiet', label: 'Quiet', detail: 'Kp 1', kp: 1, setting: stormFromKp(1) },
  { id: 'g1', label: 'G1 minor', detail: 'Kp 5', kp: 5, setting: stormFromKp(5) },
  { id: 'g3', label: 'G3 strong', detail: 'Kp 7', kp: 7, setting: stormFromKp(7) },
  { id: 'may2024', label: 'G5, May 2024', detail: 'Kp 9', kp: 9, setting: stormFromKp(9) },
  { id: 'carrington', label: 'Carrington, 1859', detail: 'Beyond the scale', kp: null, setting: { edgeMlat: 25, width: 32, strength: 100 } },
]

// Each cell's magnetic coordinates never change, so they are worked out once
let mlats: Float32Array | null = null
let angles: Float32Array | null = null

function magneticGrid() {
  if (mlats && angles) return { mlats, angles }
  mlats = new Float32Array(GRID_CELLS)
  angles = new Float32Array(GRID_CELLS)
  for (let row = 0; row < GRID_H; row++) {
    for (let col = 0; col < GRID_W; col++) {
      const v = latLonToVec(row - 90, col)
      mlats[row * GRID_W + col] = magneticLatitudeVec(v)
      angles[row * GRID_W + col] = magneticAngleVec(v)
    }
  }
  return { mlats, angles }
}

export function fillStorm(out: AuroraField, setting: StormSetting, subSolar: LatLon) {
  const grid = magneticGrid()
  const sunAngle = magneticAngleVec(latLonToVec(subSolar.lat, subSolar.lon))
  for (let i = 0; i < GRID_CELLS; i++) {
    const mlat = Math.abs(grid.mlats[i])
    // +1 on the night side at magnetic midnight, −1 facing the Sun
    const midnight = Math.cos((grid.angles[i] - sunAngle + 180) * RAD)
    // The stated edge is the night-side reach; the oval sits a few degrees poleward by day
    const edge = setting.edgeMlat + 5 * (1 - midnight) * 0.5
    if (mlat < edge - 1.5) {
      out[i] = 0
      continue
    }
    const width = setting.width * (0.75 + 0.25 * midnight)
    // Gentler on the poleward side: seen from inside the oval, a steep falloff shows as a hard wall
    const centre = edge + width / 2
    const offset = (mlat - centre) / ((width / 2.4) * (mlat > centre ? 1.7 : 1))
    const day = 0.4 + 0.6 * (1 + midnight) * 0.5
    out[i] = Math.round(setting.strength * day * Math.exp(-offset * offset))
  }
  return out
}
