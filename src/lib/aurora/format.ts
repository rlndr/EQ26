import type { Band } from './visibility'

/** Display helpers shared by the Aurora Watch panels */

/** Severity colours for G1 to G5, index 0 being below storm level */
export const G_COLORS = ['#34d399', '#facc15', '#f59e0b', '#f97316', '#ef4444', '#b91c1c']

export const BAND_STYLE: Record<Band, { text: string; fill: string }> = {
  Unlikely: { text: 'text-zinc-400', fill: '#52525b' },
  Slight: { text: 'text-amber-400', fill: '#f59e0b' },
  Possible: { text: 'text-sky-400', fill: '#38bdf8' },
  Good: { text: 'text-emerald-400', fill: '#34d399' },
}

export function timeAgo(ms: number, now: number) {
  const minutes = Math.max(0, Math.round((now - ms) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

/** Clock time in the viewer's own zone */
export const clockTime = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export const shortDayTime = (ms: number) =>
  new Date(ms).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })

/** Clock time at a location with a fixed offset from UTC */
export function clockAtOffset(ms: number, utcOffsetSeconds: number) {
  const d = new Date(ms + utcOffsetSeconds * 1000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

export const compassPoint = (bearing: number) => COMPASS[Math.round(bearing / 45) % 8]

export function formatLatLon(lat: number, lon: number) {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(1)}°${ns} ${Math.abs(lon).toFixed(1)}°${ew}`
}

/** Thins a series to one point per bucket, keeping gaps when a whole bucket has no data */
export function bucketSeries<T extends { t: number }>(
  rows: T[],
  bucketMs: number,
  combine: (group: T[], t: number) => T,
): T[] {
  const out: T[] = []
  let group: T[] = []
  let bucket = Number.NaN
  for (const row of rows) {
    const b = Math.floor(row.t / bucketMs) * bucketMs
    if (b !== bucket && group.length > 0) {
      out.push(combine(group, bucket))
      group = []
    }
    bucket = b
    group.push(row)
  }
  if (group.length > 0) out.push(combine(group, bucket))
  return out
}

export function mean(values: (number | null)[]) {
  const present = values.filter((v): v is number => v !== null)
  if (present.length === 0) return null
  return present.reduce((a, b) => a + b, 0) / present.length
}

export function maxOf(values: (number | null)[]) {
  const present = values.filter((v): v is number => v !== null)
  return present.length === 0 ? null : Math.max(...present)
}
