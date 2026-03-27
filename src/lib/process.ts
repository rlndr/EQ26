import { type EarthquakeFeature, parseRegion, getMagnitudeBand } from './api'

export const MAGNITUDE_BANDS = ['M5.x', 'M6.x', 'M7.x', 'M8+'] as const
export type MagnitudeBand = (typeof MAGNITUDE_BANDS)[number]

export interface RegionRow {
  region: string
  total: number
  bands: Record<MagnitudeBand, number>
}

export interface ProcessedData {
  byBand: Record<MagnitudeBand, number>
  byRegion: RegionRow[]
  maxMag: number
  maxMagPlace: string
  regionCount: number
}

export function processEarthquakes(features: EarthquakeFeature[]): ProcessedData {
  const byBand: Record<MagnitudeBand, number> = {
    'M5.x': 0,
    'M6.x': 0,
    'M7.x': 0,
    'M8+': 0,
  }

  const regionMap = new Map<string, RegionRow>()

  let maxMag = 0
  let maxMagPlace = 'N/A'

  for (const feature of features) {
    const { mag, place } = feature.properties
    if (mag == null) continue

    const band = getMagnitudeBand(mag) as MagnitudeBand
    byBand[band] = (byBand[band] ?? 0) + 1

    const region = parseRegion(place)
    if (!regionMap.has(region)) {
      regionMap.set(region, {
        region,
        total: 0,
        bands: { 'M5.x': 0, 'M6.x': 0, 'M7.x': 0, 'M8+': 0 },
      })
    }
    const row = regionMap.get(region)!
    row.total += 1
    row.bands[band] = (row.bands[band] ?? 0) + 1

    if (mag > maxMag) {
      maxMag = mag
      maxMagPlace = place ?? 'Unknown'
    }
  }

  const byRegion = Array.from(regionMap.values()).sort((a, b) => b.total - a.total)

  return {
    byBand,
    byRegion,
    maxMag,
    maxMagPlace,
    regionCount: regionMap.size,
  }
}
