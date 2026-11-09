// Checks for the near-earth Lambda, on responses trimmed from real JPL output. No network.
//
//   node lambda/near-earth/verify.mjs

import { createApp, createCache } from './index.mjs'
import {
  cleanName, horizonsCommand, horizonsParams, MAX_IMPACTS, num, parseHorizonsVectors, parseYearRange,
  signedCoordinate, transformFireballs, transformFlybys, transformOrbitClass, transformRisk, transformSentryDetail,
} from './transform.mjs'

let failures = 0
function check(name, ok, detail = '') {
  if (!ok) failures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `   ${detail}` : ''}`)
}
const quiet = () => {}

const fireballJson = {
  signature: { version: '1.2', source: 'NASA/JPL Fireball Data API' },
  count: '3',
  fields: ['date', 'energy', 'impact-e', 'lat', 'lat-dir', 'lon', 'lon-dir', 'alt', 'vel'],
  data: [
    ['2026-10-04 03:14:45', '5.4', '0.18', '41.8', 'S', '173.1', 'W', '26.9', '13.8'],
    ['2013-02-15 03:20:26', '37500', '441', '54.8', 'N', '61.1', 'E', '23.3', '18.6'],
    ['2026-01-02 10:00:00', '2.0', '0.1', null, null, null, null, null, null],
  ],
}

const cadJson = {
  signature: { version: '1.5' },
  count: 2,
  fields: ['des', 'orbit_id', 'jd', 'cd', 'dist', 'dist_min', 'dist_max', 'v_rel', 'v_inf', 't_sigma_f', 'h', 'fullname'],
  data: [
    ['2025 UF5', '2', '2461354.378953221', '2026-Nov-09 21:06', '0.0483285203945581', '0.0461358857258629', '0.0506851279674532', '1.94365998105654', '1.91508454761627', '2_00:46', '27.70', '       (2025 UF5)'],
    ['2011 TO', '3', '2461360.5', '2026-Nov-16 00:00', '0.01', '0.009', '0.011', '8.0', '7.9', '< 00:01', '26.3', '       (2011 TO)'],
  ],
}

const sentryJson = {
  signature: { version: '2.0' },
  count: 2,
  data: [
    { des: '2011 TO', fullname: '(2011 TO)', range: '2064-2064', ip: '2.937e-06', ps_cum: '-6.15', diameter: '0.018', n_imp: 1, ts_max: '0', v_inf: '8.55', last_obs: '2013-01-12' },
    { des: '101955', fullname: '101955 Bennu (1999 RQ36)', range: '2178-2290', ip: '0.000571699999999996', ps_cum: '-1.40', diameter: '0.49', n_imp: 157, ts_max: null, v_inf: '5.99', last_obs: '2020-10-3.80160' },
  ],
}

const sentryRemoved = { signature: { version: '2.0' }, count: 2, data: [{ des: 'A', removed: 'x' }, { des: 'B', removed: 'y' }] }

const sentryDetail = {
  signature: { version: '2.0' },
  summary: { ip: '3.401e-04', ps_cum: '-0.98', ps_max: '-0.98', ts_max: null, diameter: '1.3e+00', energy: '7.521e+04', mass: '1.96e+12', v_imp: '17.97', v_inf: '14.10', first_obs: '1950-02-23', last_obs: '2026-11-05', nobs: 1192 },
  data: [
    { energy: '7.521e+04', ip: '1e-5', date: '2880-03-16.99', ps: '-0.98', ts: null },
    { energy: '7.5e+04', ip: '3e-4', date: '2881-01-01.00', ps: '-1.5', ts: '0' },
  ],
}

const horizonsOk = { result: 'header\n$$SOE\n2461350.5, A.D. 2026-Nov-06 00:00:00.0000,  3.765868393254101E+06, -6.185498797414390E+06, -2.031353664645231E+05,\n2461350.75, A.D. x,  1.5E+06, 2.5E+06, 3.5E+06,\n$$EOE\ntrailer' }
const horizonsMissing = { result: '*******\n Matching small-bodies: \n    No matches found.\n*******' }

console.log('\nFIREBALLS')
{
  const { events } = transformFireballs(fireballJson, quiet)
  const latest = events[2]
  check('sorted oldest first', events[0][1] === 441 && latest[0] === Date.UTC(2026, 9, 4, 3, 14, 45))
  check('41.8 S, 173.1 W becomes −41.8, −173.1', latest[2] === -41.8 && latest[3] === -173.1, `${latest[2]}, ${latest[3]}`)
  check('north and east stay positive', events[0][2] === 54.8 && events[0][3] === 61.1)
  check('uses impact energy in kt, not radiated energy', events[0][1] === 441)
  check('missing location stays null', events[1][2] === null && events[1][3] === null)
  check('missing altitude and speed stay null', events[1][4] === null && events[1][5] === null)
  check('present altitude and speed convert', events[0][4] === 23.3 && events[0][5] === 18.6)
  check('signedCoordinate needs a direction', signedCoordinate('10', null, 'S') === null)
  let warned = ''
  transformFireballs({ ...fireballJson, signature: { version: '9.9' } }, (m) => { warned = m })
  check('a new API version is logged', warned.includes('9.9'))
}

console.log('\nFLYBYS')
{
  const { flybys } = transformFlybys(cadJson, quiet)
  check('uses jd for time', flybys[0][2] === Math.round((2461354.378953221 - 2440587.5) * 86_400_000), `${flybys[0][2]}`)
  check('padded fullname cleaned', flybys[0][1] === '2025 UF5')
  check('distances convert', flybys[0][3] === 0.0483285203945581 && flybys[0][4] === 0.0461358857258629)
  check('time uncertainty passes through', flybys[0][8] === '2_00:46' && flybys[1][8] === '< 00:01')
  check('no matches is an empty list', transformFlybys({ signature: { version: '1.5' }, count: 0 }, quiet).flybys.length === 0)
}

console.log('\nRISK LIST')
{
  const { objects, removedCount } = transformRisk(sentryJson, sentryRemoved, quiet)
  check('numeric strings convert', objects[0][2] === 2.937e-6 && objects[0][3] === -6.15)
  check('year range parsed', objects[1][5] === 2178 && objects[1][6] === 2290)
  check('name kept when not wrapped', objects[1][1] === '101955 Bennu (1999 RQ36)')
  check('null Torino stays null, 0 stays 0', objects[1][8] === null && objects[0][8] === 0)
  check('removed count', removedCount === 2)
  check('missing removed list is null, not 0', transformRisk(sentryJson, null, quiet).removedCount === null)
  check('odd last_obs does not break anything', objects.length === 2)
  check('bad year range', parseYearRange('soon')[0] === null)
  check('cleanName fallback', cleanName('   ', 'X') === 'X')
  check('num edge cases', num('') === null && num(null) === null && num('abc') === null && num('1e+00') === 1)
}

console.log('\nOBJECT DETAIL')
{
  const d = transformSentryDetail(sentryDetail)
  check('energy, mass and speeds convert', d.energyMt === 75210 && d.massKg === 1.96e12 && d.vImpact === 17.97)
  check('null Torino stays null', d.tsMax === null)
  check('likeliest impact first', d.impacts[0].date === '2881-01-01.00')
  const removed = transformSentryDetail({ error: 'specified object removed', removed: '2021-02-21 08:22:28' })
  check('removed is recognised despite HTTP 200', removed.removed === '2021-02-21 08:22:28')
  let threw = false
  try { transformSentryDetail({ error: 'bad request' }) } catch { threw = true }
  check('other errors are not mistaken for removal', threw)
  const many = { summary: {}, data: Array.from({ length: 200 }, (_, i) => ({ ip: String(i), energy: '1', ps: '0', ts: '0', date: `d${i}` })) }
  const trimmed = transformSentryDetail(many)
  check(`impact list capped at ${MAX_IMPACTS}, true count kept`, trimmed.impacts.length === MAX_IMPACTS && trimmed.impactCount === 200)
  const orbit = transformOrbitClass({ object: { orbit_class: { code: 'APO', name: 'Apollo' }, pha: true, neo: true } })
  check('orbit class', orbit.orbitClass === 'Apollo' && orbit.hazardous === true)
  check('orbit class missing', transformOrbitClass(null) === null)
}

console.log('\nHORIZONS')
{
  check('provisional designation', horizonsCommand('2025 UF5') === 'DES=2025 UF5;')
  check('numbered asteroid', horizonsCommand('29075') === '29075;')
  const params = horizonsParams('301', Date.UTC(2026, 10, 2, 21, 6), Date.UTC(2026, 10, 16, 21, 6), 2)
  check('command quoted', params.get('COMMAND') === "'301'")
  check('Earth-centred', params.get('CENTER') === "'500@399'")
  check('explicit time window', params.get('START_TIME') === "'2026-11-02 21:06'" && params.get('STOP_TIME') === "'2026-11-16 21:06'")
  check('step size', params.get('STEP_SIZE') === "'2h'")
  const rows = parseHorizonsVectors(horizonsOk)
  check('vectors parsed in km', rows.length === 2 && rows[0][0] === 3765868 && rows[0][1] === -6185499 && rows[1][2] === 3500000)
  check('no ephemeris block means not found', parseHorizonsVectors(horizonsMissing) === null)
  check('empty response means not found', parseHorizonsVectors(null) === null)
}

console.log('\nCACHE')
{
  let t = 0
  const cache = createCache({ now: () => t })
  let calls = 0
  const load = async () => ++calls
  const a = await cache.get('k', 100, load)
  t = 50
  const b = await cache.get('k', 100, load)
  check('fresh hit does not refetch', a.value === 1 && b.value === 1 && calls === 1 && b.stale === false)
  t = 200
  const c = await cache.get('k', 100, load)
  check('expired entry refetches', c.value === 2 && calls === 2)
  t = 400
  const d = await cache.get('k', 100, async () => { throw new Error('down') })
  check('failed refresh serves the last copy as stale', d.value === 2 && d.stale === true)
  let threw = false
  try { await cache.get('empty', 100, async () => { throw new Error('down') }) } catch { threw = true }
  check('nothing cached and failing throws', threw)

  let shared = 0
  const slow = () => new Promise((r) => setTimeout(() => r(++shared), 5))
  const [x, y] = await Promise.all([cache.get('s', 100, slow), cache.get('s', 100, slow)])
  check('concurrent requests share one upstream call', shared === 1 && x.value === y.value)

  const small = createCache({ now: () => 0, maxEntries: 2 })
  let loads = 0
  const count = async () => ++loads
  await small.get('a', 100, count)
  await small.get('b', 100, count)
  await small.get('a', 100, count)
  await small.get('c', 100, count)
  await small.get('a', 100, count)
  const before = loads
  await small.get('b', 100, count)
  check('least recently used entry is evicted', before === 3 && loads === 4)
}

console.log('\nROUTES AND ALLOW-LIST')
{
  const requested = []
  const NOW = Date.UTC(2026, 10, 8, 12)
  const fetchJson = async (url) => {
    requested.push(url)
    if (url.includes('/fireball.api')) return fireballJson
    if (url.includes('/cad.api')) return cadJson
    if (url.includes('/sbdb.api')) return { object: { orbit_class: { name: 'Apollo' }, pha: false, neo: true } }
    if (url.includes('/sentry.api?removed=1')) return sentryRemoved
    if (url.includes('/sentry.api?des=')) return sentryDetail
    if (url.includes('/sentry.api')) return sentryJson
    if (url.includes('horizons.api')) return horizonsOk
    throw new Error(`unexpected ${url}`)
  }
  const { handler } = createApp({ fetchJson, now: () => NOW, warn: quiet })
  const get = async (rawPath, method = 'GET') => {
    const res = await handler({ rawPath, requestContext: { http: { method } } })
    return { status: res.statusCode, body: JSON.parse(res.body) }
  }

  const fire = await get('/fireballs')
  check('/fireballs', fire.status === 200 && fire.body.events.length === 3 && fire.body.stale === false)
  check('Amplify-style prefix accepted', (await get('/api/near-earth/fireballs')).status === 200)

  const fly = await get('/flybys')
  check('/flybys adds the risk flag', fly.body.flybys[0][9] === false && fly.body.flybys[1][9] === true)
  const cad = requested.find((u) => u.includes('/cad.api'))
  check('flyby window uses two explicit dates', cad.includes('date-min=2026-11-01') && cad.includes('date-max=2027-01-07'), cad.split('?')[1])

  const risk = await get('/risk')
  check('/risk includes the removed count', risk.body.objects.length === 2 && risk.body.removedCount === 2)

  const onRisk = await get('/object/101955')
  check('/object for a listed object', onRisk.status === 200 && onRisk.body.sentry.energyMt === 75210 && onRisk.body.orbit.orbitClass === 'Apollo')
  const onFlybyOnly = await get(`/object/${encodeURIComponent('2025 UF5')}`)
  check('/object for a flyby not on the risk list skips Sentry', onFlybyOnly.status === 200 && onFlybyOnly.body.sentry === null)

  const before = requested.length
  for (const bad of ['1234567', "x';DROP", '2025 UF5;CENTER=500@10', '../fireballs', encodeURIComponent("29075;'")]) {
    check(`rejected: ${bad}`, (await get(`/object/${bad}`)).status === 404)
  }
  check('rejected designations never reach JPL', requested.length === before, `${requested.length - before} calls`)
  check('malformed encoding rejected', (await get('/object/%E0%A4%A')).status === 404)

  const track = await get(`/track/${encodeURIComponent('2025 UF5')}`)
  check('/track returns object and Moon', track.status === 200 && track.body.object.length === 2 && track.body.moon.length === 2)
  const horizonsCalls = requested.filter((u) => u.includes('horizons.api'))
  check('track window comes from the flyby list', horizonsCalls.length === 2 && horizonsCalls[0].includes('START_TIME=%272026-11-02'), horizonsCalls[0].match(/START_TIME=[^&]*/)[0])
  check('/track for an object not flying by', (await get('/track/101955')).status === 404)

  check('unknown route', (await get('/nope')).status === 404)
  check('prototype names are not routes', (await get('/constructor')).status === 404 && (await get('/__proto__')).status === 404)
  check('root', (await get('/')).status === 404)
  check('/object needs a designation', (await get('/object')).status === 404)
  check('/fireballs takes no designation', (await get('/fireballs/x')).status === 404)
  check('extra path segments', (await get('/object/101955/more')).status === 404)
  check('POST refused', (await get('/fireballs', 'POST')).status === 405)

  const notFound = createApp({
    fetchJson: async (url) => (url.includes('horizons') ? horizonsMissing : fetchJson(url)),
    now: () => NOW, warn: quiet,
  })
  const missing = await notFound.handler({ rawPath: `/track/${encodeURIComponent('2025 UF5')}` })
  check('object Horizons cannot find is 404', missing.statusCode === 404)

  const down = createApp({ fetchJson: async () => { throw new Error('down') }, now: () => NOW, warn: quiet })
  const failed = await down.handler({ rawPath: '/fireballs' })
  check('JPL down with nothing cached is 502', failed.statusCode === 502)
  check('502 hides internal detail', !failed.body.includes('down'))

  let up = true
  let t = NOW
  const flaky = createApp({ fetchJson: async (u) => { if (!up) throw new Error('down'); return fetchJson(u) }, now: () => t, warn: quiet })
  await flaky.handler({ rawPath: '/fireballs' })
  up = false
  t += 7 * 3_600_000
  const staleRes = JSON.parse((await flaky.handler({ rawPath: '/fireballs' })).body)
  check('JPL down with a cached copy is served stale', staleRes.stale === true && staleRes.events.length === 3)

  let sequential = true
  let active = 0
  const concurrent = createApp({
    fetchJson: async (url) => {
      if (url.includes('horizons')) {
        active++
        if (active > 1) sequential = false
        await new Promise((r) => setTimeout(r, 3))
        active--
      }
      return fetchJson(url)
    },
    now: () => NOW, warn: quiet,
  })
  await Promise.all([
    concurrent.handler({ rawPath: `/track/${encodeURIComponent('2025 UF5')}` }),
    concurrent.handler({ rawPath: `/track/${encodeURIComponent('2011 TO')}` }),
  ])
  check('Horizons calls never overlap', sequential)
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`)
process.exitCode = failures > 0 ? 1 : 0
