// planetPositions Lambda — proxies NASA JPL Horizons for the Planetary Orrery page.
//
// Fetches ±6 months of daily heliocentric positions for the 8 planets, parses the
// $$SOE/$$EOE text blocks, and returns compact JSON (coordinates in AU). Horizons
// returns 503s for concurrent requests, so the upstream calls run sequentially;
// the parsed payload is cached in module scope for the rest of the UTC day, so a
// warm container makes at most one upstream pass per day.
//
// Deploy notes: Node.js 22.x runtime, timeout 60s (cold pass takes ~10-20s of
// sequential NASA queries). CORS is configured on the Function URL, not here —
// returning CORS headers as well would duplicate them.

const HORIZONS_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api'
const AU_KM = 1.495978707e8
const DAY_MS = 86_400_000

const PLANETS = [
  ['mercury', '199'],
  ['venus', '299'],
  ['earth', '399'],
  ['mars', '499'],
  ['jupiter', '599'],
  ['saturn', '699'],
  ['uranus', '799'],
  ['neptune', '899'],
]

let cache = null // { day: 'YYYY-MM-DD', payload: { generated, startDate, stepDays, planets } }

async function fetchPlanetSeries(id, start, stop, { center = '500@10', decimals = 4 } = {}) {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: `'${id}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'",
    CENTER: `'${center}'`,
    VEC_TABLE: "'1'",
    CSV_FORMAT: "'YES'",
    START_TIME: `'${start}'`,
    STOP_TIME: `'${stop}'`,
    STEP_SIZE: "'1d'",
  })
  const res = await fetch(`${HORIZONS_URL}?${params}`)
  if (!res.ok) throw new Error(`Horizons returned ${res.status} for body ${id}`)
  const json = await res.json()
  const block = json.result?.split('$$SOE')[1]?.split('$$EOE')[0]
  if (!block) throw new Error(`No ephemeris block for body ${id}`)
  return block
    .trim()
    .split('\n')
    .map((line) => {
      // CSV row: JD, calendar date, X, Y, Z (km, heliocentric ecliptic J2000)
      const cols = line.split(',')
      const x = Number(cols[2]) / AU_KM
      const y = Number(cols[3]) / AU_KM
      if (Number.isNaN(x) || Number.isNaN(y)) throw new Error(`Unparseable row for body ${id}`)
      // 4 decimals of an AU (~15,000 km) is ample for the graphic and keeps the payload small
      return [Number(x.toFixed(decimals)), Number(y.toFixed(decimals))]
    })
}

function respond(payload, stale) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, stale }),
  }
}

export const handler = async () => {
  const today = new Date().toISOString().slice(0, 10)
  if (cache?.day === today) return respond(cache.payload, false)

  const start = new Date(Date.now() - 182 * DAY_MS).toISOString().slice(0, 10)
  const stop = new Date(Date.now() + 183 * DAY_MS).toISOString().slice(0, 10)
  try {
    const planets = {}
    for (const [name, id] of PLANETS) {
      planets[name] = await fetchPlanetSeries(id, start, stop)
    }
    // Moon is served geocentric ([x, y] relative to Earth) so the frontend can draw it
    // around Earth. 6 decimals: lunar distance (~0.0026 AU) would vanish at 4.
    const moon = await fetchPlanetSeries('301', start, stop, { center: '500@399', decimals: 6 })
    const payload = {
      generated: new Date().toISOString(),
      startDate: start,
      stepDays: 1,
      planets,
      moon,
    }
    cache = { day: today, payload }
    return respond(payload, false)
  } catch (err) {
    console.error('Horizons fetch failed:', err)
    if (cache) return respond(cache.payload, true)
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Horizons unavailable and no cached data' }),
    }
  }
}
