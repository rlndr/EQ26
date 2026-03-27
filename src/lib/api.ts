export interface EarthquakeFeature {
  properties: {
    mag: number
    place: string
    time: number
    url: string
    title: string
  }
}

export interface EarthquakeResponse {
  features: EarthquakeFeature[]
}

/**
 * Fetch earthquakes from USGS API for a given year/month.
 * Returns all events with magnitude >= 5, sorted by magnitude descending.
 */
export async function fetchEarthquakes(
  year: number,
  month: number,
): Promise<EarthquakeFeature[]> {
  // Build date range: first day of month to first day of next month
  const start = new Date(Date.UTC(year, month - 1, 1))
  const end = new Date(Date.UTC(year, month, 1))

  const fmt = (d: Date) => d.toISOString().split('T')[0]

  const params = new URLSearchParams({
    format: 'geojson',
    starttime: fmt(start),
    endtime: fmt(end),
    minmagnitude: '5',
    orderby: 'magnitude',
  })

  const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?${params.toString()}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`USGS API error: ${response.status} ${response.statusText}`)
  }

  const data: EarthquakeResponse = await response.json()
  return data.features
}

/**
 * Parse the region (country/area) from a USGS place string.
 * Typical formats:
 *   "150km SSW of Suva, Fiji"  -> "Fiji"
 *   "City, Country"             -> "Country"
 *   "Somewhere"                 -> "Somewhere"
 */
export function parseRegion(place: string): string {
  if (!place || typeof place !== 'string') return 'Unknown'
  const trimmed = place.trim()
  const lastComma = trimmed.lastIndexOf(',')
  if (lastComma === -1) {
    // No comma — return the whole string, trimmed
    return trimmed || 'Unknown'
  }
  const region = trimmed.slice(lastComma + 1).trim()
  return region || 'Unknown'
}

/**
 * Return the magnitude band label for a given magnitude value.
 */
export function getMagnitudeBand(mag: number): string {
  if (mag >= 8.0) return 'M8+'
  if (mag >= 7.0) return 'M7.x'
  if (mag >= 6.0) return 'M6.x'
  return 'M5.x'
}
