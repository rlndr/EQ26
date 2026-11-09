/**
 * Shape checks on the near-earth Lambda's responses, turning its compact rows into named objects.
 * The feeds' own quirks are handled in the Lambda; this only guards the boundary, so a response of
 * the wrong shape shows as an error on one section and never reaches a chart or the renderer.
 */

export class ResponseShapeError extends Error {
  constructor(feed: string, problem: string) {
    super(`${feed}: ${problem}`)
    this.name = 'ResponseShapeError'
  }
}

type Row = Record<string, unknown>

function record(feed: string, value: unknown): Row {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ResponseShapeError(feed, 'expected an object')
  }
  return value as Row
}

function rows(feed: string, value: unknown, width: number): unknown[][] {
  if (!Array.isArray(value)) throw new ResponseShapeError(feed, 'expected a list')
  return value.map((row) => {
    if (!Array.isArray(row) || row.length !== width) throw new ResponseShapeError(feed, 'bad row')
    return row
  })
}

const orNull = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const required = (feed: string, value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ResponseShapeError(feed, 'missing number')
  return value
}
const text = (value: unknown) => (typeof value === 'string' ? value : '')

export interface Fireball {
  t: number
  /** Total impact energy, kilotons of TNT */
  kt: number
  lat: number | null
  lon: number | null
  altKm: number | null
  speedKms: number | null
}

export interface Fireballs {
  events: Fireball[]
  stale: boolean
}

export function parseFireballs(json: unknown): Fireballs {
  const feed = 'fireballs'
  const root = record(feed, json)
  return {
    stale: root.stale === true,
    events: rows(feed, root.events, 6).map((r) => ({
      t: required(feed, r[0]),
      kt: required(feed, r[1]),
      lat: orNull(r[2]),
      lon: orNull(r[3]),
      altKm: orNull(r[4]),
      speedKms: orNull(r[5]),
    })),
  }
}

export interface Flyby {
  des: string
  name: string
  t: number
  /** Nominal, 3-sigma minimum and 3-sigma maximum approach distance, au */
  distAu: number
  minAu: number
  maxAu: number
  speedKms: number | null
  h: number | null
  /** JPL's time uncertainty, e.g. "2_00:46" */
  timeSigma: string
  /** Also on the Sentry risk list; null when the list could not be checked */
  onRisk: boolean | null
}

export interface Flybys {
  flybys: Flyby[]
  stale: boolean
}

export function parseFlybys(json: unknown): Flybys {
  const feed = 'flybys'
  const root = record(feed, json)
  return {
    stale: root.stale === true,
    flybys: rows(feed, root.flybys, 10).map((r) => ({
      des: text(r[0]),
      name: text(r[1]),
      t: required(feed, r[2]),
      distAu: required(feed, r[3]),
      minAu: required(feed, r[4]),
      maxAu: required(feed, r[5]),
      speedKms: orNull(r[6]),
      h: orNull(r[7]),
      timeSigma: text(r[8]),
      onRisk: typeof r[9] === 'boolean' ? r[9] : null,
    })),
  }
}

export interface RiskObject {
  des: string
  name: string
  probability: number | null
  palermo: number | null
  diameterKm: number | null
  firstYear: number | null
  lastYear: number | null
  impactCount: number | null
  /** Null when every possible impact is beyond the Torino scale's 100-year horizon */
  torino: number | null
  speedKms: number | null
}

export interface RiskList {
  objects: RiskObject[]
  removedCount: number | null
  stale: boolean
}

export function parseRisk(json: unknown): RiskList {
  const feed = 'risk list'
  const root = record(feed, json)
  return {
    stale: root.stale === true,
    removedCount: orNull(root.removedCount),
    objects: rows(feed, root.objects, 10).map((r) => ({
      des: text(r[0]),
      name: text(r[1]),
      probability: orNull(r[2]),
      palermo: orNull(r[3]),
      diameterKm: orNull(r[4]),
      firstYear: orNull(r[5]),
      lastYear: orNull(r[6]),
      impactCount: orNull(r[7]),
      torino: orNull(r[8]),
      speedKms: orNull(r[9]),
    })),
  }
}

export interface PossibleImpact {
  date: string
  energyMt: number | null
  probability: number | null
  palermo: number | null
}

export interface SentryDetail {
  /** Set when the object has been cleared from the list since the page loaded */
  removed: string | null
  energyMt: number | null
  massKg: number | null
  impactSpeedKms: number | null
  firstObserved: string | null
  lastObserved: string | null
  observations: number | null
  impactCount: number | null
  impacts: PossibleImpact[]
}

export interface ObjectDetail {
  des: string
  orbitClass: string | null
  hazardous: boolean | null
  sentry: SentryDetail | null
  stale: boolean
}

const textOrNull = (value: unknown) => (typeof value === 'string' ? value : null)

export function parseObject(json: unknown): ObjectDetail {
  const feed = 'object'
  const root = record(feed, json)
  const orbit = root.orbit === null || root.orbit === undefined ? null : record(feed, root.orbit)
  let sentry: SentryDetail | null = null
  if (root.sentry !== null && root.sentry !== undefined) {
    const s = record(feed, root.sentry)
    sentry = {
      removed: textOrNull(s.removed),
      energyMt: orNull(s.energyMt),
      massKg: orNull(s.massKg),
      impactSpeedKms: orNull(s.vImpact),
      firstObserved: textOrNull(s.firstObserved),
      lastObserved: textOrNull(s.lastObserved),
      observations: orNull(s.observations),
      impactCount: orNull(s.impactCount),
      impacts: (Array.isArray(s.impacts) ? s.impacts : []).map((raw) => {
        const v = record(feed, raw)
        return { date: text(v.date), energyMt: orNull(v.energyMt), probability: orNull(v.ip), palermo: orNull(v.ps) }
      }),
    }
  }
  return {
    des: text(root.des),
    orbitClass: orbit ? textOrNull(orbit.orbitClass) : null,
    hazardous: orbit && typeof orbit.hazardous === 'boolean' ? orbit.hazardous : null,
    sentry,
    stale: root.stale === true,
  }
}

export type Vec3Km = [number, number, number]

export interface FlybyTrack {
  des: string
  startMs: number
  stepHours: number
  object: Vec3Km[]
  moon: Vec3Km[]
  stale: boolean
}

function vectors(feed: string, value: unknown): Vec3Km[] {
  return rows(feed, value, 3).map((r) => [required(feed, r[0]), required(feed, r[1]), required(feed, r[2])])
}

export function parseTrack(json: unknown): FlybyTrack {
  const feed = 'track'
  const root = record(feed, json)
  return {
    des: text(root.des),
    startMs: required(feed, root.startMs),
    stepHours: required(feed, root.stepHours),
    object: vectors(feed, root.object),
    moon: vectors(feed, root.moon),
    stale: root.stale === true,
  }
}
