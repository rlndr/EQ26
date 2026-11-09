// near-earth Lambda: fireballs, close approaches and the Sentry risk list from NASA JPL, for the
// Near Earth page. None of JPL's APIs allow browser requests, so this serves them compactly from
// the page's own origin (an Amplify 200 rewrite in production, dev-server.mjs locally).
//
// Deploy notes: Node.js 22.x runtime, timeout 60s, index.mjs and transform.mjs in the same package.
// The Function URL is public, so designations from the path are only ever used if they are on the
// current flyby or risk list: this must never become a general proxy to JPL.

import {
  horizonsCommand, horizonsParams, parseHorizonsVectors, transformFireballs, transformFlybys,
  transformOrbitClass, transformRisk, transformSentryDetail,
} from './transform.mjs'

const SSD = 'https://ssd-api.jpl.nasa.gov'
const HORIZONS = 'https://ssd.jpl.nasa.gov/api/horizons.api'
const HOUR = 3_600_000
const DAY = 24 * HOUR
const UPSTREAM_TIMEOUT_MS = 20_000
const RETRY_DELAY_MS = 1000

const PAST_DAYS = 7
const FUTURE_DAYS = 60
const TRACK_HALF_DAYS = 7
const TRACK_STEP_HOURS = 2
const PREFIX = '/api/near-earth'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function liveFetchJson(url) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'land3r-near-earth' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
    // JPL documents 503 as temporary overload, so it gets one more try
    if (res.status === 503 && attempt === 0) {
      await sleep(RETRY_DELAY_MS)
      continue
    }
    if (!res.ok) throw new Error(`${url} returned ${res.status}`)
    return res.json()
  }
}

/**
 * Time-based cache for one warm container. A failed refresh serves the last good copy marked stale,
 * and concurrent requests for the same key share one upstream call.
 */
export function createCache({ now = Date.now, maxEntries = Infinity } = {}) {
  const entries = new Map()
  const loading = new Map()

  return {
    async get(key, ttlMs, load) {
      const entry = entries.get(key)
      if (entry && now() - entry.at < ttlMs) {
        // Reinserting keeps the Map in least-recently-used order
        entries.delete(key)
        entries.set(key, entry)
        return { value: entry.value, stale: false }
      }
      if (loading.has(key)) return loading.get(key)

      const pending = (async () => {
        try {
          const value = await load()
          entries.delete(key)
          entries.set(key, { value, at: now() })
          if (entries.size > maxEntries) entries.delete(entries.keys().next().value)
          return { value, stale: false }
        } catch (err) {
          if (entry) return { value: entry.value, stale: true }
          throw err
        } finally {
          loading.delete(key)
        }
      })()
      loading.set(key, pending)
      return pending
    },
  }
}

const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10)

export function createApp({ fetchJson = liveFetchJson, now = Date.now, warn = console.warn } = {}) {
  const feeds = createCache({ now })
  const objects = createCache({ now, maxEntries: 200 })
  const tracks = createCache({ now, maxEntries: 50 })

  // Horizons answers concurrent requests with 503, so all its calls go through one queue
  let horizonsQueue = Promise.resolve()
  const queryHorizons = (params) => {
    const result = horizonsQueue.then(() => fetchJson(`${HORIZONS}?${params}`))
    horizonsQueue = result.catch(() => {})
    return result
  }

  const getFireballs = () => feeds.get('fireballs', 6 * HOUR, async () =>
    transformFireballs(await fetchJson(`${SSD}/fireball.api`), warn))

  const getFlybys = () => feeds.get('flybys', HOUR, async () => {
    // Two explicit dates: a fixed date-min with a relative date-max returns a different window
    const params = new URLSearchParams({
      'date-min': isoDate(now() - PAST_DAYS * DAY),
      'date-max': isoDate(now() + FUTURE_DAYS * DAY),
      'dist-max': '0.05',
      sort: 'date',
      fullname: 'true',
    })
    return transformFlybys(await fetchJson(`${SSD}/cad.api?${params}`), warn)
  })

  const getRisk = () => feeds.get('risk', 6 * HOUR, async () => {
    const summary = await fetchJson(`${SSD}/sentry.api`)
    // Only a headline number, so losing it must not cost the whole list
    const removed = await fetchJson(`${SSD}/sentry.api?removed=1`).catch(() => null)
    return transformRisk(summary, removed, warn)
  })

  const quietly = (promise) => promise.catch(() => null)

  const routes = {
    fireballs: async () => {
      const { value, stale } = await getFireballs()
      return { payload: value, stale }
    },

    risk: async () => {
      const { value, stale } = await getRisk()
      return { payload: value, stale }
    },

    // The risk flag is added per response, so a failed Sentry fetch cannot get baked into the cache
    flybys: async () => {
      const [{ value, stale }, risk] = await Promise.all([getFlybys(), quietly(getRisk())])
      const listed = risk ? new Set(risk.value.objects.map((o) => o[0])) : null
      return {
        payload: { flybys: value.flybys.map((f) => [...f, listed ? listed.has(f[0]) : null]) },
        stale,
      }
    },

    object: async (des) => {
      const [flybys, risk] = await Promise.all([quietly(getFlybys()), quietly(getRisk())])
      if (!flybys && !risk) throw new Error('no lists available to check the designation against')
      const onFlybys = flybys?.value.flybys.some((f) => f[0] === des) ?? false
      const onRisk = risk?.value.objects.some((o) => o[0] === des) ?? false
      if (!onFlybys && !onRisk) return null

      const { value, stale } = await objects.get(des, 6 * HOUR, async () => {
        const sstr = new URLSearchParams({ sstr: des })
        const orbit = await quietly(fetchJson(`${SSD}/sbdb.api?${sstr}`))
        const sentry = onRisk
          ? transformSentryDetail(await fetchJson(`${SSD}/sentry.api?${new URLSearchParams({ des })}`))
          : null
        return { des, orbit: transformOrbitClass(orbit), sentry }
      })
      return { payload: value, stale }
    },

    track: async (des) => {
      const { value: list } = await getFlybys()
      const flyby = list.flybys.find((f) => f[0] === des)
      if (!flyby) return null

      const closeAt = flyby[2]
      const startMs = closeAt - TRACK_HALF_DAYS * DAY
      const stopMs = closeAt + TRACK_HALF_DAYS * DAY
      const { value, stale } = await tracks.get(`${des}@${closeAt}`, 6 * HOUR, async () => {
        const object = parseHorizonsVectors(await queryHorizons(horizonsParams(horizonsCommand(des), startMs, stopMs, TRACK_STEP_HOURS)))
        if (!object) return null
        const moon = parseHorizonsVectors(await queryHorizons(horizonsParams('301', startMs, stopMs, TRACK_STEP_HOURS)))
        return { des, startMs, stepHours: TRACK_STEP_HOURS, object, moon: moon ?? [] }
      })
      return value ? { payload: value, stale } : null
    },
  }

  const respond = (statusCode, body) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    body: JSON.stringify(body),
  })

  const handler = async (event) => {
    const method = event?.requestContext?.http?.method ?? 'GET'
    if (method !== 'GET') return respond(405, { error: 'method not allowed' })

    const raw = event?.rawPath ?? '/'
    const path = raw.startsWith(PREFIX) ? raw.slice(PREFIX.length) : raw
    const [name, encoded, extra] = path.split('/').filter(Boolean)
    const route = Object.hasOwn(routes, name ?? '') ? routes[name] : null
    const takesDesignation = name === 'object' || name === 'track'
    if (!route || extra !== undefined || takesDesignation !== (encoded !== undefined)) {
      return respond(404, { error: 'not found' })
    }

    let des
    if (encoded !== undefined) {
      try {
        des = decodeURIComponent(encoded)
      } catch {
        return respond(404, { error: 'not found' })
      }
    }

    try {
      const result = await route(des)
      if (!result) return respond(404, { error: 'not found' })
      return respond(200, { ...result.payload, stale: result.stale, generated: new Date(now()).toISOString() })
    } catch (err) {
      console.error(`near-earth: ${name} failed:`, err)
      return respond(502, { error: 'JPL unavailable and no cached data' })
    }
  }

  return { handler }
}

export const handler = createApp().handler
