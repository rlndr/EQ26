import { latLonToVec } from '../aurora/astro'
import type { Fireball } from './parse'

export interface LocatedFireball extends Fireball {
  lat: number
  lon: number
}

export interface MarkerData {
  /** Events with a location, oldest first, in buffer order */
  events: LocatedFireball[]
  positions: Float32Array
  /** 0 at the first event, 1 at `endMs` */
  times: Float32Array
  /** 0 for the faintest, 1 for the most energetic */
  energies: Float32Array
  startMs: number
  endMs: number
}

const LOG_FAINTEST = Math.log10(0.05)
const LOG_BRIGHTEST = Math.log10(500)

/** Energy in kt to marker strength. Log scale: the record spans nearly four orders of magnitude. */
export const energyLevel = (kt: number) =>
  Math.min(1, Math.max(0, (Math.log10(Math.max(kt, 1e-6)) - LOG_FAINTEST) / (LOG_BRIGHTEST - LOG_FAINTEST)))

export const timeFraction = (ms: number, startMs: number, endMs: number) =>
  endMs > startMs ? (ms - startMs) / (endMs - startMs) : 1

export const fractionToMs = (fraction: number, startMs: number, endMs: number) =>
  startMs + fraction * (endMs - startMs)

export function buildMarkers(all: Fireball[], endMs: number): MarkerData {
  const events = all
    .filter((e): e is LocatedFireball => e.lat !== null && e.lon !== null)
    .sort((a, b) => a.t - b.t)
  const startMs = events[0]?.t ?? endMs
  const positions = new Float32Array(events.length * 3)
  const times = new Float32Array(events.length)
  const energies = new Float32Array(events.length)
  events.forEach((event, i) => {
    positions.set(latLonToVec(event.lat, event.lon), i * 3)
    times[i] = timeFraction(event.t, startMs, endMs)
    energies[i] = energyLevel(event.kt)
  })
  return { events, positions, times, energies, startMs, endMs }
}

export interface YearCount {
  year: number
  count: number
}

/** Fireballs per year, including years with none, so gaps are not closed up on the chart */
export function yearCounts(events: Fireball[]): YearCount[] {
  if (events.length === 0) return []
  const counts = new Map<number, number>()
  let first = Infinity
  let last = -Infinity
  for (const e of events) {
    const year = new Date(e.t).getUTCFullYear()
    counts.set(year, (counts.get(year) ?? 0) + 1)
    first = Math.min(first, year)
    last = Math.max(last, year)
  }
  const out: YearCount[] = []
  for (let year = first; year <= last; year++) out.push({ year, count: counts.get(year) ?? 0 })
  return out
}

export function yearBounds(year: number): [number, number] {
  return [Date.UTC(year, 0, 1), Date.UTC(year + 1, 0, 1)]
}
