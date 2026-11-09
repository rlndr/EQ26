import { cellIndex, GRID_CELLS, GRID_H, GRID_W, newField, type AuroraField } from './grid'

/**
 * Shape checks and normalisation for every feed. All of the feeds' quirks are absorbed here, so
 * nothing past this file has to know about them. A feed that does not match throws, which reaches
 * TanStack Query as an error and shows on that one panel; it can never get as far as the renderer.
 */

export class FeedShapeError extends Error {
  constructor(feed: string, problem: string) {
    super(`${feed}: ${problem}`)
    this.name = 'FeedShapeError'
  }
}

type Row = Record<string, unknown>

function list(feed: string, value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new FeedShapeError(feed, 'expected an array')
  return value
}

function record(feed: string, value: unknown): Row {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new FeedShapeError(feed, 'expected an object')
  }
  return value as Row
}

/** A reading: instruments report null when they have nothing, and that must stay a gap */
function reading(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/**
 * Time tags to epoch ms. Several feeds omit the zone ("2026-11-08T22:49:00") and alerts use a space
 * instead of a T; `new Date` would read those as the viewer's local time. All of them are UTC.
 */
export function parseUtc(tag: unknown): number {
  if (typeof tag !== 'string') throw new FeedShapeError('time', `not a time tag: ${String(tag)}`)
  const iso = tag.trim().replace(' ', 'T')
  const ms = Date.parse(/(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`)
  if (Number.isNaN(ms)) throw new FeedShapeError('time', `bad time tag: ${tag}`)
  return ms
}

// --- Aurora grid -------------------------------------------------------------

export interface AuroraFeed {
  observedAt: number
  forecastAt: number
  field: AuroraField
}

export function parseAurora(json: unknown): AuroraFeed {
  const feed = 'aurora grid'
  const root = record(feed, json)
  const coordinates = list(feed, root.coordinates)
  if (coordinates.length !== GRID_CELLS) {
    throw new FeedShapeError(feed, `expected ${GRID_CELLS} cells, got ${coordinates.length}`)
  }
  const field = newField()
  // NOAA lists cells longitude-first. Each is placed by its own coordinates rather than by its
  // position in the list, so a change of ordering upstream cannot scramble the map.
  for (const cell of coordinates) {
    if (!Array.isArray(cell) || cell.length !== 3) throw new FeedShapeError(feed, 'bad cell')
    const [lon, lat, value] = cell as number[]
    if (!Number.isInteger(lon) || lon < 0 || lon >= GRID_W
      || !Number.isInteger(lat) || lat < -90 || lat > (GRID_H - 91)
      || typeof value !== 'number' || !Number.isFinite(value)) {
      throw new FeedShapeError(feed, `bad cell: ${JSON.stringify(cell)}`)
    }
    field[cellIndex(lon, lat)] = Math.min(100, Math.max(0, Math.round(value)))
  }
  return {
    observedAt: parseUtc(root['Observation Time']),
    forecastAt: parseUtc(root['Forecast Time']),
    field,
  }
}

// --- Solar wind --------------------------------------------------------------

export interface WindSample {
  t: number
  speed: number | null
  density: number | null
  bt: number | null
  bz: number | null
}

export interface PropagatedSample extends WindSample {
  /** When this parcel of solar wind reaches Earth, by NOAA's own propagation */
  arrivesAt: number
}

/** Array of arrays with a header row; columns are looked up by name, not position */
export function parsePropagated(json: unknown): PropagatedSample[] {
  const feed = 'propagated solar wind'
  const rows = list(feed, json)
  if (rows.length === 0) throw new FeedShapeError(feed, 'empty')
  const header = rows[0]
  if (!Array.isArray(header)) throw new FeedShapeError(feed, 'missing header row')
  const column = (name: string) => {
    const i = header.indexOf(name)
    if (i < 0) throw new FeedShapeError(feed, `missing column ${name}`)
    return i
  }
  const c = {
    t: column('time_tag'), speed: column('speed'), density: column('density'),
    bt: column('bt'), bz: column('bz'), arrives: column('propagated_time_tag'),
  }
  return rows.slice(1).map((row) => {
    if (!Array.isArray(row)) throw new FeedShapeError(feed, 'bad row')
    return {
      t: parseUtc(row[c.t]),
      speed: reading(row[c.speed]),
      density: reading(row[c.density]),
      bt: reading(row[c.bt]),
      bz: reading(row[c.bz]),
      arrivesAt: parseUtc(row[c.arrives]),
    }
  }).sort((a, b) => a.t - b.t)
}

/** Newest sample that actually has the readings the page needs */
export function latestComplete<T extends WindSample>(samples: T[]): T | null {
  for (let i = samples.length - 1; i >= 0; i--) {
    const s = samples[i]
    if (s.speed !== null && s.density !== null && s.bz !== null) return s
  }
  return null
}

/**
 * The real-time feeds carry a row per spacecraft per minute, flagged `active` on the one NOAA is
 * trusting. Mixing them makes the series jump between instruments, so only active rows are kept.
 */
function activeRows(feed: string, json: unknown): Row[] {
  return list(feed, json).map((r) => record(feed, r)).filter((r) => r.active === true)
}

/** Joins the plasma and magnetic field feeds by minute, oldest first */
export function parseRealtimeWind(plasma: unknown, mag: unknown): WindSample[] {
  const byMinute = new Map<number, WindSample>()
  const slot = (t: number) => {
    let s = byMinute.get(t)
    if (!s) {
      s = { t, speed: null, density: null, bt: null, bz: null }
      byMinute.set(t, s)
    }
    return s
  }
  for (const r of activeRows('solar wind plasma', plasma)) {
    const s = slot(parseUtc(r.time_tag))
    s.speed = reading(r.proton_speed)
    s.density = reading(r.proton_density)
  }
  for (const r of activeRows('solar wind magnetic field', mag)) {
    const s = slot(parseUtc(r.time_tag))
    s.bt = reading(r.bt)
    s.bz = reading(r.bz_gsm)
  }
  return [...byMinute.values()].sort((a, b) => a.t - b.t)
}

// --- Kp and scales -----------------------------------------------------------

export type KpKind = 'observed' | 'estimated' | 'predicted'

export interface KpRow {
  t: number
  kp: number
  kind: KpKind
  /** G1–G5 as NOAA labelled this row, or null below storm level */
  scale: string | null
}

export function parseKpForecast(json: unknown): KpRow[] {
  const feed = 'Kp forecast'
  return list(feed, json).map((raw): KpRow => {
    const r = record(feed, raw)
    // The same quantity is `kp` in this feed and `Kp` in its sibling
    const kp = reading(r.kp ?? r.Kp)
    const kind = r.observed
    if (kp === null) throw new FeedShapeError(feed, 'row without a Kp value')
    if (kind !== 'observed' && kind !== 'estimated' && kind !== 'predicted') {
      throw new FeedShapeError(feed, `unknown row kind: ${String(kind)}`)
    }
    return { t: parseUtc(r.time_tag), kp, kind, scale: text(r.noaa_scale) }
  }).sort((a, b) => a.t - b.t)
}

export const KP_BIN_MS = 3 * 3600_000

/** The row covering this moment, or null outside the feed's range */
export function kpAt(rows: KpRow[], ms: number): KpRow | null {
  for (const row of rows) {
    if (ms >= row.t && ms < row.t + KP_BIN_MS) return row
  }
  return null
}

/** NOAA's table: G1 at Kp 5, G2 at 6, G3 at 7, G4 at 8 and 9−, G5 at a full 9 */
export function kpToG(kp: number): number {
  if (kp >= 9) return 5
  const level = Math.round(kp)
  if (level >= 8) return 4
  return Math.max(0, level - 4)
}

export interface ScaleDay {
  date: string
  g: number | null
  gText: string | null
  r: number | null
  rText: string | null
  /** Chance of R1–R2 and R3+ radio blackouts, % */
  rMinorProb: number | null
  rMajorProb: number | null
  s: number | null
  sText: string | null
  /** Chance of an S1+ radiation storm, % */
  sProb: number | null
}

export interface Scales {
  yesterday: ScaleDay | null
  today: ScaleDay
  outlook: ScaleDay[]
}

export function parseScales(json: unknown): Scales {
  const feed = 'NOAA scales'
  const root = record(feed, json)
  const day = (key: string): ScaleDay => {
    const d = record(feed, root[key])
    const g = record(feed, d.G)
    const r = record(feed, d.R)
    const s = record(feed, d.S)
    return {
      date: text(d.DateStamp) ?? '',
      g: reading(g.Scale),
      gText: text(g.Text),
      r: reading(r.Scale),
      rText: text(r.Text),
      rMinorProb: reading(r.MinorProb),
      rMajorProb: reading(r.MajorProb),
      s: reading(s.Scale),
      sText: text(s.Text),
      sProb: reading(s.Prob),
    }
  }
  return {
    yesterday: root['-1'] ? day('-1') : null,
    today: day('0'),
    outlook: ['1', '2', '3'].filter((k) => root[k]).map(day),
  }
}

// --- Alerts ------------------------------------------------------------------

export interface Alert {
  id: string
  issuedAt: number
  /** The "ALERT: ..." or "WARNING: ..." line */
  headline: string
  message: string
}

export function parseAlerts(json: unknown): Alert[] {
  const feed = 'alerts'
  return list(feed, json).map((raw): Alert => {
    const r = record(feed, raw)
    const message = (text(r.message) ?? '').replace(/\r\n/g, '\n').trim()
    const line = message.split('\n').find((l) => /^(EXTENDED |CONTINUED )?(ALERT|WARNING|WATCH|SUMMARY)\b/.test(l.trim()))
    return {
      id: `${text(r.product_id) ?? 'alert'}-${text(r.issue_datetime) ?? ''}`,
      issuedAt: parseUtc(r.issue_datetime),
      headline: (line ?? message.split('\n')[0] ?? '').trim(),
      message,
    }
  }).sort((a, b) => b.issuedAt - a.issuedAt)
}

// --- X-ray flux --------------------------------------------------------------

export interface XrayPoint {
  t: number
  flux: number | null
}

/** Two bands are reported; 0.1–0.8 nm is the one flare classes are defined on */
export function parseXray(json: unknown): XrayPoint[] {
  const feed = 'X-ray flux'
  return list(feed, json)
    .map((r) => record(feed, r))
    .filter((r) => r.energy === '0.1-0.8nm')
    .map((r) => {
      const flux = reading(r.flux)
      return { t: parseUtc(r.time_tag), flux: flux !== null && flux > 0 ? flux : null }
    })
    .sort((a, b) => a.t - b.t)
}

const FLARE_CLASSES: [string, number][] = [['X', 1e-4], ['M', 1e-5], ['C', 1e-6], ['B', 1e-7], ['A', 1e-8]]

/** Flux in W/m² to a flare class such as "C1.7" */
export function flareClass(flux: number) {
  for (const [letter, base] of FLARE_CLASSES) {
    if (flux >= base) return `${letter}${(flux / base).toFixed(1)}`
  }
  return 'below A'
}

// --- Replay frames -----------------------------------------------------------

export interface ReplayFrame {
  url: string
  t: number
}

export function parseReplayFrames(json: unknown): ReplayFrame[] {
  const feed = 'aurora replay'
  return list(feed, json).map((raw): ReplayFrame => {
    const r = record(feed, raw)
    const url = text(r.url)
    if (!url) throw new FeedShapeError(feed, 'frame without a URL')
    return { url, t: parseUtc(r.time_tag) }
  })
}

// --- Open-Meteo --------------------------------------------------------------

export interface CloudHour {
  t: number
  cloud: number | null
}

export interface CloudForecast {
  /** Seconds east of UTC at the location, for showing its local time */
  utcOffsetSeconds: number
  timezone: string
  hours: CloudHour[]
}

export function parseClouds(json: unknown): CloudForecast {
  const feed = 'cloud cover'
  const root = record(feed, json)
  const hourly = record(feed, root.hourly)
  const times = list(feed, hourly.time)
  const clouds = list(feed, hourly.cloud_cover)
  if (times.length !== clouds.length) throw new FeedShapeError(feed, 'mismatched columns')
  const offset = reading(root.utc_offset_seconds)
  if (offset === null) throw new FeedShapeError(feed, 'missing UTC offset')
  return {
    utcOffsetSeconds: offset,
    timezone: text(root.timezone_abbreviation) ?? '',
    // Requested in the location's time so the offset comes back; converted to true UTC here
    hours: times.map((t, i) => ({ t: parseUtc(t) - offset * 1000, cloud: reading(clouds[i]) })),
  }
}

/** Cloud percentage for the forecast hour containing this moment, or null if not covered */
export function cloudAt(forecast: CloudForecast | undefined, ms: number): number | null {
  if (!forecast) return null
  for (const hour of forecast.hours) {
    if (ms >= hour.t && ms < hour.t + 3600_000) return hour.cloud
  }
  return null
}

export interface Place {
  id: number
  name: string
  region: string
  lat: number
  lon: number
}

export function parsePlaces(json: unknown): Place[] {
  const feed = 'place search'
  const results = record(feed, json).results
  // The service leaves the key out altogether when nothing matches
  if (results === undefined) return []
  return list(feed, results).flatMap((raw): Place[] => {
    const r = record(feed, raw)
    const lat = reading(r.latitude)
    const lon = reading(r.longitude)
    const id = reading(r.id)
    if (lat === null || lon === null || id === null) return []
    const region = [text(r.admin1), text(r.country)].filter(Boolean).join(', ')
    return [{ id, name: text(r.name) ?? '', region, lat, lon }]
  })
}
