import { clamp, latLonToVec } from '../aurora/astro'
import type { EarthquakeFeature } from '../api'
import { timeFraction, type MarkerData } from '../nearearth/markers'

export interface LocatedQuake {
  lat: number
  lon: number
  mag: number
  place: string
  /** UTC ms */
  time: number
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_MS = 86_400_000

/** Magnitude to marker strength: M5 is 0, M8 and above is 1 */
export const magnitudeLevel = (mag: number) => clamp((mag - 5) / 3, 0, 1)

/** The UTC month `fetchEarthquakes` asks for: its first and its last millisecond */
export function monthBounds(year: number, month: number): [number, number] {
  return [Date.UTC(year, month - 1, 1), Date.UTC(year, month, 1) - 1]
}

/** "14 Mar", in UTC whatever the browser's locale */
export function dayLabel(ms: number) {
  const d = new Date(ms)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

export function buildQuakeMarkers(features: EarthquakeFeature[], year: number, month: number): MarkerData<LocatedQuake> {
  const [startMs, endMs] = monthBounds(year, month)
  const events: LocatedQuake[] = []
  for (const f of features) {
    const { mag, place, time } = f.properties
    const [lon, lat] = f.geometry.coordinates
    if (!Number.isFinite(mag) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue
    events.push({ lat, lon, mag, place, time })
  }
  events.sort((a, b) => a.time - b.time)
  const positions = new Float32Array(events.length * 3)
  const times = new Float32Array(events.length)
  const energies = new Float32Array(events.length)
  events.forEach((event, i) => {
    positions.set(latLonToVec(event.lat, event.lon), i * 3)
    times[i] = clamp(timeFraction(event.time, startMs, endMs), 0, 1)
    energies[i] = magnitudeLevel(event.mag)
  })
  return { events, positions, times, energies, startMs, endMs, steps: Math.round((endMs + 1 - startMs) / DAY_MS) }
}
