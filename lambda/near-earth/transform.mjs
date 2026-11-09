// Pure conversion of JPL responses for the near-earth Lambda. Every quirk of the feeds is absorbed
// here, so nothing past this file has to know about them. No I/O, so verify.mjs can test it directly.

export const API_VERSIONS = { fireball: '1.2', cad: '1.5', sentry: '2.0' }

export class UpstreamError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UpstreamError'
  }
}

/** JPL sends almost every number as a string, and null for anything unknown */
export function num(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** JPL publishes the format version with each response; a change means fields may have moved */
export function checkVersion(name, json, warn = console.warn) {
  const version = json?.signature?.version
  if (version !== API_VERSIONS[name]) {
    warn(`near-earth: ${name} API is version ${version}, expected ${API_VERSIONS[name]}`)
  }
}

const jdToMs = (jd) => Math.round((jd - 2440587.5) * 86_400_000)

/** "(2025 UF5)" to "2025 UF5", padding removed; names like "101955 Bennu (1999 RQ36)" are kept */
export function cleanName(fullname, fallback) {
  const name = (fullname ?? '').trim()
  if (!name) return fallback
  const wrapped = /^\((.+)\)$/.exec(name)
  return wrapped ? wrapped[1] : name
}

function columns(json, feed) {
  if (!Array.isArray(json?.fields)) throw new UpstreamError(`${feed}: missing fields`)
  const index = Object.fromEntries(json.fields.map((f, i) => [f, i]))
  return (row, name) => row[index[name]]
}

/** A hemisphere letter and an unsigned angle to a signed coordinate; null when unknown */
export function signedCoordinate(value, direction, negative) {
  const n = num(value)
  if (n === null || !direction) return null
  return direction === negative ? -n : n
}

/** Fireballs, oldest first: [t, impact kt, lat, lon, altitude km, speed km/s] */
export function transformFireballs(json, warn) {
  checkVersion('fireball', json, warn)
  const col = columns(json, 'fireball')
  const events = (json.data ?? []).map((row) => {
    const t = Date.parse(`${col(row, 'date').replace(' ', 'T')}Z`)
    if (Number.isNaN(t)) throw new UpstreamError(`fireball: bad date ${col(row, 'date')}`)
    return [
      t,
      num(col(row, 'impact-e')),
      signedCoordinate(col(row, 'lat'), col(row, 'lat-dir'), 'S'),
      signedCoordinate(col(row, 'lon'), col(row, 'lon-dir'), 'W'),
      num(col(row, 'alt')),
      num(col(row, 'vel')),
    ]
  })
  return { events: events.sort((a, b) => a[0] - b[0]) }
}

/** Flybys by date: [des, name, t, dist, min, max (au), v km/s, H, time uncertainty] */
export function transformFlybys(json, warn) {
  checkVersion('cad', json, warn)
  if (json.data === undefined) return { flybys: [] }
  const col = columns(json, 'close approach')
  return {
    flybys: json.data.map((row) => [
      col(row, 'des'),
      cleanName(col(row, 'fullname'), col(row, 'des')),
      jdToMs(num(col(row, 'jd'))),
      num(col(row, 'dist')),
      num(col(row, 'dist_min')),
      num(col(row, 'dist_max')),
      num(col(row, 'v_rel')),
      num(col(row, 'h')),
      col(row, 't_sigma_f'),
    ]),
  }
}

/** "2103-2122" to [2103, 2122] */
export function parseYearRange(range) {
  const match = /^(\d{4})-(\d{4})$/.exec(range ?? '')
  return match ? [Number(match[1]), Number(match[2])] : [null, null]
}

/** Risk list: [des, name, probability, Palermo, diameter km, first year, last year, impacts, Torino, v km/s] */
export function transformRisk(summary, removed, warn) {
  checkVersion('sentry', summary, warn)
  if (!Array.isArray(summary?.data)) throw new UpstreamError('sentry: missing data')
  return {
    objects: summary.data.map((o) => {
      const [first, last] = parseYearRange(o.range)
      return [
        o.des,
        cleanName(o.fullname, o.des),
        num(o.ip),
        num(o.ps_cum),
        num(o.diameter),
        first,
        last,
        num(o.n_imp),
        // Null means beyond the Torino scale's 100-year horizon, which is not the same as 0
        num(o.ts_max),
        num(o.v_inf),
      ]
    }),
    removedCount: Array.isArray(removed?.data) ? removed.data.length : null,
  }
}

export const MAX_IMPACTS = 50

/** One Sentry object. A removed object is still HTTP 200, and says so in the body. */
export function transformSentryDetail(json) {
  if (json?.error) {
    if (json.removed) return { removed: json.removed }
    throw new UpstreamError(`sentry: ${json.error}`)
  }
  const s = json?.summary
  if (!s) throw new UpstreamError('sentry: missing summary')
  const impacts = (json.data ?? []).map((v) => ({
    date: v.date,
    energyMt: num(v.energy),
    ip: num(v.ip),
    ps: num(v.ps),
    ts: num(v.ts),
  }))
  // Some objects list hundreds of possible dates; the likeliest are the ones worth showing
  impacts.sort((a, b) => (b.ip ?? 0) - (a.ip ?? 0))
  return {
    ip: num(s.ip),
    psCum: num(s.ps_cum),
    psMax: num(s.ps_max),
    tsMax: num(s.ts_max),
    diameterKm: num(s.diameter),
    energyMt: num(s.energy),
    massKg: num(s.mass),
    vImpact: num(s.v_imp),
    vInfinity: num(s.v_inf),
    firstObserved: s.first_obs ?? null,
    lastObserved: s.last_obs ?? null,
    observations: num(s.nobs),
    impactCount: impacts.length,
    impacts: impacts.slice(0, MAX_IMPACTS),
  }
}

export function transformOrbitClass(json) {
  const object = json?.object
  if (!object) return null
  return {
    orbitClass: object.orbit_class?.name ?? null,
    hazardous: typeof object.pha === 'boolean' ? object.pha : null,
    neo: typeof object.neo === 'boolean' ? object.neo : null,
  }
}

/** Numbered asteroids are looked up as "29075;" and provisional designations as "DES=2025 UF5;" */
export const horizonsCommand = (des) => (/^\d+$/.test(des) ? `${des};` : `DES=${des};`)

const horizonsTime = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')

export function horizonsParams(command, startMs, stopMs, stepHours) {
  return new URLSearchParams({
    format: 'json',
    COMMAND: `'${command}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'",
    CENTER: "'500@399'",
    VEC_TABLE: "'1'",
    CSV_FORMAT: "'YES'",
    START_TIME: `'${horizonsTime(startMs)}'`,
    STOP_TIME: `'${horizonsTime(stopMs)}'`,
    STEP_SIZE: `'${stepHours}h'`,
  })
}

/** Horizons vector table to [[x, y, z]] in km. Null when the body was not found, which is still 200. */
export function parseHorizonsVectors(json) {
  const block = json?.result?.split('$$SOE')[1]?.split('$$EOE')[0]
  if (!block) return null
  return block.trim().split('\n').map((line) => {
    const cols = line.split(',')
    const position = [Number(cols[2]), Number(cols[3]), Number(cols[4])]
    if (position.some(Number.isNaN)) throw new UpstreamError('horizons: unparseable row')
    return position.map(Math.round)
  })
}
