/**
 * Numerical verification for Aurora Watch. The values come from aurora-feature-plan.md, the parser
 * fixtures are trimmed from real NOAA responses, and the Sun and Moon references were captured from
 * the US Naval Observatory's celestial navigation API.
 *
 * Not imported by the app. Run it through the runner, which also compiles the shaders:
 *
 *   node scripts/verify-aurora.mjs
 */

import {
  greenwichHourAngle, horizontal, latLonToVec, moonEquatorial, moonIllumination, sunEquatorial, vecToLatLon, wrap180, wrap360,
} from './astro'
import {
  flightPose, groundPose, localAxes, orbitPose, pickSurface, projectPoint,
} from './camera'
import { bucketSeries, clockAtOffset, compassPoint, formatLatLon, maxOf, mean, timeAgo } from './format'
import { DIPOLE_POLE, magneticLatitude, magneticLocalTime } from './geomag'
import {
  bearingDeg, brightness, brightnessField, cellIndex, distanceKm, GRID_CELLS, GRID_H, GRID_W, lowestLitLatitude, newField, sampleField, scanView, strongestInDarkness,
} from './grid'
import {
  cloudAt, FeedShapeError, flareClass, kpAt, kpToG, latestComplete, parseAlerts, parseAurora, parseClouds, parseKpForecast, parsePlaces, parsePropagated, parseRealtimeWind, parseReplayFrames, parseScales, parseUtc, parseXray,
} from './parse'
import { makeNoiseTexture } from './noise'
import { bzBlend, couplingFromBz, particleCount, particleSpeed, standoffRadii } from './magnetosphere'
import { edgeFromKp, fillStorm, STORM_PRESETS, stormFromKp } from './stormModel'
import { buildTonight, darknessFactor, elevationAngle, TONIGHT_HOURS, visibilityScore } from './visibility'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `   ${detail}` : ''}`)
}
const near = (a: number, b: number, tol = 1e-4) => Math.abs(a - b) <= tol
function throwsShape(fn: () => unknown) {
  try {
    fn()
    return false
  } catch (err) {
    return err instanceof FeedShapeError
  }
}

console.log('\nFEED PARSING (§1)')
{
  const hour = Date.UTC(2026, 10, 8, 22, 49)
  check('zone-less tag is UTC', parseUtc('2026-11-08T22:49:00') === hour)
  check('Z tag is UTC', parseUtc('2026-11-08T22:49:00Z') === hour)
  check('alert format with a space is UTC', parseUtc('2026-11-08 02:03:49.380') === Date.UTC(2026, 10, 8, 2, 3, 49, 380))
  check('garbage time tag rejected', throwsShape(() => parseUtc('soon')))

  const coordinates: number[][] = []
  for (let lon = 0; lon < GRID_W; lon++) {
    for (let lat = -90; lat <= 90; lat++) coordinates.push([lon, lat, lon === 17 && lat === 70 ? 42 : 0])
  }
  const aurora = parseAurora({
    'Observation Time': '2026-11-08T22:53:00Z', 'Forecast Time': '2026-11-08T23:29:00Z', coordinates, type: 'MultiPoint',
  })
  check('grid transposed: lon-first list lands at (lat+90)·360+lon', aurora.field[160 * 360 + 17] === 42 && aurora.field[17 * 181 + 160] === 0)
  check('grid has 65,160 cells', GRID_CELLS === 65160 && aurora.field.length === 65160)
  check('wrong cell count rejected', throwsShape(() => parseAurora({ 'Observation Time': 'x', 'Forecast Time': 'x', coordinates: [[0, 0, 0]] })))
  check('out-of-range cell rejected', throwsShape(() => parseAurora({
    'Observation Time': '2026-11-08T22:53:00Z', 'Forecast Time': '2026-11-08T23:29:00Z',
    coordinates: coordinates.map((c, i) => (i === 5 ? [999, 0, 0] : c)),
  })))

  const propagated = parsePropagated([
    ['time_tag', 'speed', 'density', 'temperature', 'bx', 'by', 'bz', 'bt', 'vx', 'vy', 'vz', 'propagated_time_tag'],
    ['2026-11-08T22:02:00Z', null, null, 255564.0, 2.98, 0.51, null, 5.71, -721.1, -46.3, -66.1, '2026-11-08T22:31:39Z'],
    ['2026-11-08T22:01:00Z', 734.8, 1.35, 236242.0, 2.4, -0.02, 5.13, 5.7, -730.3, -30.4, -75.3, '2026-11-08T22:30:16Z'],
  ])
  check('propagated: columns found by name, sorted oldest first', propagated[0].speed === 734.8 && propagated[0].bz === 5.13)
  check('propagated: null reading stays null, not zero', propagated[1].speed === null)
  check('propagated: arrival time kept', propagated[0].arrivesAt === Date.UTC(2026, 10, 8, 22, 30, 16))
  check('latestComplete skips rows with gaps', latestComplete(propagated)?.speed === 734.8)
  check('propagated: missing column rejected', throwsShape(() => parsePropagated([['time_tag', 'speed'], ['2026-11-08T22:01:00Z', 1]])))

  const wind = parseRealtimeWind([
    { time_tag: '2026-11-08T22:49:00', active: true, source: 'SOLAR1', proton_speed: 714.2, proton_density: 1.76 },
    { time_tag: '2026-11-08T22:49:00', active: false, source: 'ACE', proton_speed: 500, proton_density: 9 },
    { time_tag: '2026-11-08T22:48:00', active: true, source: 'SOLAR1', proton_speed: null, proton_density: 1.8 },
  ], [
    { time_tag: '2026-11-08T22:49:00', active: false, source: 'ACE', bt: 9, bz_gsm: 9 },
    { time_tag: '2026-11-08T22:49:00', active: true, source: 'SOLAR1', bt: 4.93, bz_gsm: 1.7 },
  ])
  check('realtime: inactive spacecraft dropped', wind.length === 2 && wind[1].speed === 714.2 && wind[1].bz === 1.7)
  check('realtime: newest-first feed becomes oldest-first', wind[0].t < wind[1].t)
  check('realtime: null speed is a gap', wind[0].speed === null)

  const kp = parseKpForecast([
    { time_tag: '2026-11-08T21:00:00', kp: 3, observed: 'estimated', noaa_scale: null },
    { time_tag: '2026-11-08T18:00:00', Kp: 4.67, observed: 'observed', noaa_scale: 'G1' },
    { time_tag: '2026-11-09T00:00:00', kp: 5.33, observed: 'predicted', noaa_scale: 'G1' },
  ])
  check('Kp: either field casing, sorted', kp[0].kp === 4.67 && kp[0].scale === 'G1' && kp[2].kind === 'predicted')
  check('Kp: kpAt finds the 3-hour bin', kpAt(kp, Date.UTC(2026, 10, 8, 23, 59))?.kp === 3)
  check('Kp: kpAt outside range is null', kpAt(kp, Date.UTC(2026, 10, 10)) === null)
  check('Kp: unknown row kind rejected', throwsShape(() => parseKpForecast([{ time_tag: '2026-11-08T21:00:00', kp: 3, observed: 'maybe' }])))
  check('G-scale: 4.33 none, 4.67 G1, 5.67 G2, 7 G3, 8.67 G4, 9 G5',
    kpToG(4.33) === 0 && kpToG(4.67) === 1 && kpToG(5.67) === 2 && kpToG(7) === 3 && kpToG(8.67) === 4 && kpToG(9) === 5)

  const g = (s: string | null, t: string | null) => ({ Scale: s, Text: t })
  const scales = parseScales({
    0: { DateStamp: '2026-11-08', G: g('0', 'none'), R: { ...g('0', 'none'), MinorProb: null, MajorProb: null }, S: { ...g('0', 'none'), Prob: null } },
    1: { DateStamp: '2026-11-08', G: g('1', 'minor'), R: { ...g(null, null), MinorProb: '60', MajorProb: '15' }, S: { ...g(null, null), Prob: '15' } },
    '-1': { DateStamp: '2026-11-07', G: g('1', 'minor'), R: { ...g('1', 'minor'), MinorProb: null, MajorProb: null }, S: { ...g('0', 'none'), Prob: null } },
  })
  check('scales: today, outlook and yesterday', scales.today.g === 0 && scales.outlook[0].g === 1 && scales.outlook[0].rMinorProb === 60 && scales.yesterday?.r === 1)
  check('scales: null scale stays null', scales.outlook[0].r === null)

  const alerts = parseAlerts([
    { product_id: 'K05A', issue_datetime: '2026-11-07 19:45:37.330', message: 'Space Weather Message Code: ALTK05\r\nSerial Number: 2061\r\n\r\nALERT: Geomagnetic K-index of 5 \nThreshold Reached' },
    { product_id: 'K04W', issue_datetime: '2026-11-07 20:40:51.927', message: 'Code: WARK04\r\n\r\nEXTENDED WARNING: Geomagnetic K-index of 4 expected\n' },
  ])
  check('alerts: newest first, headline extracted', alerts[0].headline === 'EXTENDED WARNING: Geomagnetic K-index of 4 expected' && alerts[1].headline === 'ALERT: Geomagnetic K-index of 5')

  const xray = parseXray([
    { time_tag: '2026-11-07T23:02:00Z', flux: 3.5e-8, energy: '0.05-0.4nm' },
    { time_tag: '2026-11-07T23:02:00Z', flux: 1.7e-6, energy: '0.1-0.8nm' },
    { time_tag: '2026-11-07T23:03:00Z', flux: 0, energy: '0.1-0.8nm' },
  ])
  check('x-ray: only the 0.1-0.8nm band', xray.length === 2 && xray[0].flux === 1.7e-6)
  check('x-ray: zero flux is a gap on a log axis', xray[1].flux === null)
  check('flare class: C1.7, M2.5, X1.0', flareClass(1.7e-6) === 'C1.7' && flareClass(2.5e-5) === 'M2.5' && flareClass(1e-4) === 'X1.0')

  check('replay frames', parseReplayFrames([{ url: '/a.jpg', time_tag: '2026-11-07T23:00:00Z' }])[0].url === '/a.jpg')

  const clouds = parseClouds({
    utc_offset_seconds: 3600, timezone_abbreviation: 'GMT+1',
    hourly: { time: ['2026-11-09T00:00', '2026-11-09T01:00'], cloud_cover: [80, null] },
  })
  check('clouds: local hour converted to true UTC', clouds.hours[0].t === Date.UTC(2026, 10, 8, 23))
  check('clouds: cloudAt inside and outside', cloudAt(clouds, Date.UTC(2026, 10, 8, 23, 30)) === 80 && cloudAt(clouds, Date.UTC(2026, 10, 12)) === null)
  check('clouds: null cloud stays null', cloudAt(clouds, Date.UTC(2026, 10, 9, 0, 30)) === null)
  check('places: no results key means none', parsePlaces({ generationtime_ms: 0.2 }).length === 0)
  check('places: fields mapped', parsePlaces({ results: [{ id: 1, name: 'Tromsø', latitude: 69.6, longitude: 18.9, admin1: 'Troms', country: 'Norway' }] })[0].region === 'Troms, Norway')
}

console.log('\nGRID (§2, §3)')
{
  check('brightness 10 → 0.34', near(brightness(10), 0.34, 0.005), brightness(10).toFixed(3))
  check('brightness 21 → 0.53', near(brightness(21), 0.53, 0.005), brightness(21).toFixed(3))
  check('brightness 60 → 1.00', near(brightness(60), 1, 1e-9))
  check('brightness 100 stays 1', near(brightness(100), 1, 1e-9))
  check('brightness ≤ 3 → 0', brightness(3) === 0 && brightness(0) === 0)
  let rising = true
  for (let p = 1; p <= 100; p++) if (brightness(p) < brightness(p - 1)) rising = false
  check('brightness never decreases', rising)
  const bright = brightnessField(Uint8Array.of(0, 21, 60), new Uint8Array(3))
  check('brightness field scales to bytes', bright[0] === 0 && bright[1] === 136 && bright[2] === 255, [...bright].join(','))

  const field = newField()
  field[cellIndex(359, 60)] = 40
  field[cellIndex(0, 60)] = 80
  check('sample at a cell centre', sampleField(field, 60, 0) === 80)
  check('wraps across 359°→0°', near(sampleField(field, 60, 359.5), 60, 1e-9), `${sampleField(field, 60, 359.5)}`)
  check('negative longitudes wrap', near(sampleField(field, 60, -0.5), 60, 1e-9))
  check('lat +90 does not read past the grid', sampleField(field, 90, 10) === 0)

  check('1° of latitude is about 111 km', near(distanceKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }), 111.19, 0.01))
  check('bearing: north, east, south', near(bearingDeg({ lat: 0, lon: 0 }, { lat: 10, lon: 0 }), 0) && near(bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 10 }), 90) && near(bearingDeg({ lat: 10, lon: 0 }, { lat: 0, lon: 0 }), 180))

  const hot = newField()
  hot[cellIndex(20, 65)] = 50
  const scan = scanView(hot, { lat: 60, lon: 20 })
  check('Pview finds a hot cell 556 km away', near(scan.best?.distanceKm ?? 0, 555.97, 0.1), `${scan.best?.distanceKm.toFixed(1)} km`)
  check('Pview weights by distance: 50 × (1 − 0.5 × 0.556)', near(scan.pView, 50 * (1 - 0.5 * 0.55597), 0.01), scan.pView.toFixed(2))
  check('Pview bearing points north', near(scan.best?.bearingDeg ?? -1, 0, 1e-6))
  check('overhead is 0 where nothing is overhead', scan.overhead === 0)
  const far = scanView(hot, { lat: 40, lon: 20 })
  check('out of sight beyond 1000 km', far.pView === 0 && far.best === null)
  check('nearest still reports the distant oval', near(far.nearest?.distanceKm ?? 0, 2779.9, 0.2), `${far.nearest?.distanceKm.toFixed(1)} km`)
  const across = newField()
  across[cellIndex(1, 65)] = 50
  check('scan works across the seam', near(scanView(across, { lat: 65, lon: -1 }).best?.distanceKm ?? 0, 94, 1), `${scanView(across, { lat: 65, lon: -1 }).best?.distanceKm.toFixed(1)} km`)
  check('empty field: nothing to see', scanView(newField(), { lat: 60, lon: 0 }).nearest === null)

  const lit = newField()
  lit[cellIndex(10, 55)] = 30
  check('lowest lit latitude', lowestLitLatitude(lit) === 55)
  const litSouth = newField()
  litSouth[cellIndex(10, -48)] = 30
  check('lowest lit latitude includes the south', lowestLitLatitude(litSouth) === 48)

  const dark = newField()
  dark[cellIndex(0, 65)] = 90 // in sunlight
  dark[cellIndex(180, 65)] = 30 // in darkness
  const s = strongestInDarkness(dark, { lat: 0, lon: 0 })
  check('strongest in darkness ignores the sunlit side', s?.lon === 180 && s?.lat === 65)
  check('grid dimensions', GRID_W === 360 && GRID_H === 181)
}

console.log('\nSUN AND MOON vs USNO (§9)')
{
  const usno = [
    { when: Date.UTC(2026, 2, 20, 12), lat: 0, lon: 0, sun: { dec: -0.045442, gha: 358.140786, hc: 88.140231, zn: 91.400374 }, moon: { dec: 10.504681, gha: 341.928858, hc: 69.185994, zn: 59.130732 } },
    { when: Date.UTC(2026, 5, 21, 6, 30), lat: -42.88, lon: 147.33, sun: { dec: 23.437914, gha: 277.058075, hc: 1.144134, zn: 304.156585 }, moon: { dec: 1.450168, gha: 194.799102, hc: 42.842069, zn: 24.732856 } },
    { when: Date.UTC(2026, 11, 24, 18), lat: 64.84, lon: -147.72, sun: { dec: -23.404895, gha: 90.081236, hc: -8.66751, zn: 128.358325 }, moon: { dec: 26.023379, gha: 259.049282, hc: 14.960458, zn: 299.953225 } },
  ]
  const TOL = 0.5
  const angleErr = (a: number, b: number) => Math.abs(wrap180(a - b))
  for (const c of usno) {
    const label = new Date(c.when).toISOString().slice(0, 16)
    const sun = sunEquatorial(c.when)
    const sunGha = greenwichHourAngle(c.when, sun.raDeg)
    const sunH = horizontal(c.lat, c.lon, sun.decDeg, sunGha)
    check(`${label} Sun dec, GHA, alt, az within ${TOL}°`,
      near(sun.decDeg, c.sun.dec, TOL) && angleErr(sunGha, c.sun.gha) <= TOL && near(sunH.altDeg, c.sun.hc, TOL) && angleErr(sunH.azDeg, c.sun.zn) <= TOL,
      `Δdec ${(sun.decDeg - c.sun.dec).toFixed(3)} Δgha ${wrap180(sunGha - c.sun.gha).toFixed(3)} Δalt ${(sunH.altDeg - c.sun.hc).toFixed(3)}`)
    const moon = moonEquatorial(c.when)
    const moonGha = greenwichHourAngle(c.when, moon.raDeg)
    const moonH = horizontal(c.lat, c.lon, moon.decDeg, moonGha)
    check(`${label} Moon dec, GHA, alt within ${TOL}°`,
      near(moon.decDeg, c.moon.dec, TOL) && angleErr(moonGha, c.moon.gha) <= TOL && near(moonH.altDeg, c.moon.hc, TOL),
      `Δdec ${(moon.decDeg - c.moon.dec).toFixed(3)} Δgha ${wrap180(moonGha - c.moon.gha).toFixed(3)} Δalt ${(moonH.altDeg - c.moon.hc).toFixed(3)}`)
  }
  // New Moon 2026-02-17 12:01 UTC, full Moon 2026-03-03 11:38 UTC (annular and total eclipses)
  const newMoon = moonIllumination(Date.UTC(2026, 1, 17, 12, 1))
  const fullMoon = moonIllumination(Date.UTC(2026, 2, 3, 11, 38))
  check('Moon illumination near 0 at new, near 1 at full', newMoon < 0.01 && fullMoon > 0.99, `${newMoon.toFixed(4)}, ${fullMoon.toFixed(4)}`)

  const v = latLonToVec(69.6, 18.9)
  const back = vecToLatLon(v)
  check('lat/lon ↔ vector round trip', near(back.lat, 69.6) && near(back.lon, 18.9))
  const east = latLonToVec(0, 90)
  check('vector frame: 90°E is −z, north is +y', near(east[2], -1) && near(latLonToVec(90, 0)[1], 1))
  check('wrap helpers', wrap360(-10) === 350 && wrap180(190) === -170)
}

console.log('\nVIEWING SCORE AND GEOMETRY (§3, §6)')
{
  const base = { pView: 21, sunAlt: -30, cloud: 0, moonAlt: -10, moonIllum: 0.5 }
  const clear = visibilityScore(base)
  check('P=21, dark, clear, Moon down: A=0.42 and Possible', near(clear.A, 0.42, 1e-9) && clear.band === 'Possible', `${clear.score.toFixed(3)} ${clear.band}`)
  check('Sun at −3° is Unlikely whatever the aurora does', visibilityScore({ ...base, pView: 100, sunAlt: -3 }).band === 'Unlikely')
  check('darkness steps', darknessFactor(0) === 0 && darknessFactor(-7) === 0.35 && darknessFactor(-13) === 0.8 && darknessFactor(-19) === 1)
  check('edges of the darkness steps', darknessFactor(-6) === 0.35 && darknessFactor(-12) === 0.8 && darknessFactor(-18) === 1)
  check('full cloud leaves 10%', near(visibilityScore({ ...base, cloud: 100 }).C, 0.1, 1e-9))
  check('missing cloud forecast does not count against it', visibilityScore({ ...base, cloud: null }).C === 1)
  check('full Moon up costs 25%', near(visibilityScore({ ...base, moonAlt: 20, moonIllum: 1 }).M, 0.75, 1e-9))
  check('Moon below the horizon costs nothing', visibilityScore({ ...base, moonIllum: 1 }).M === 1)
  check('bands: 0.05 Slight, 0.2 Possible, 0.5 Good', visibilityScore({ ...base, pView: 2.5 }).band === 'Slight' && visibilityScore({ ...base, pView: 10 }).band === 'Possible' && visibilityScore({ ...base, pView: 25 }).band === 'Good')
  check('A saturates at P=50', visibilityScore({ ...base, pView: 90 }).A === 1)
  check('elevation: 743 km → 5°', near(elevationAngle(743, 110), 5, 0.05), elevationAngle(743, 110).toFixed(2))
  check('elevation: 502 km → 10°', near(elevationAngle(502, 110), 10, 0.05), elevationAngle(502, 110).toFixed(2))
  check('elevation: 280 km → 20°', near(elevationAngle(280, 110), 20, 0.1), elevationAngle(280, 110).toFixed(2))
  check('elevation: overhead is 90°', elevationAngle(0, 110) === 90)

  const t0 = Date.UTC(2026, 10, 8, 20, 30)
  const kpRows = [{ t: Date.UTC(2026, 10, 8, 18), kp: 5, kind: 'predicted' as const, scale: 'G1' }]
  const cells = buildTonight(t0, { lat: 69.65, lon: 18.96 }, undefined, kpRows)
  check('tonight: twelve hours, starting on the hour', cells.length === TONIGHT_HOURS && cells[0].t === Date.UTC(2026, 10, 8, 20))
  check('tonight: Kp only where forecast exists', cells[0].kp === 5 && cells[0].score !== null && cells[3].kp === null && cells[3].score === null)
}

console.log('\nMAGNETOSPHERE (§9)')
{
  for (const [n, v, want] of [[5, 400, 11.15], [1.76, 714, 10.94], [20, 800, 7.02], [50, 1500, 4.89]]) {
    check(`standoff n=${n}, v=${v} → ${want} Earth radii`, near(standoffRadii(n, v), want, 0.01), standoffRadii(n, v).toFixed(2))
  }
  check('only southward Bz couples', couplingFromBz(5) === 0 && couplingFromBz(0) === 0 && near(couplingFromBz(-5), 0.5) && couplingFromBz(-30) === 1)
  check('particle count stays in range', particleCount(0) === 70 && particleCount(1000) === 440)
  check('particle speed rises with wind speed', particleSpeed(800) > particleSpeed(400))
  check('Bz colour blend is clamped', bzBlend(-30) === -1 && bzBlend(30) === 1 && bzBlend(0) === 0)
}

console.log('\nGEOMAGNETIC AND STORM MODEL (§5, §9)')
{
  check('dipole pole is at magnetic latitude 90°', near(magneticLatitude(DIPOLE_POLE.lat, DIPOLE_POLE.lon), 90, 1e-6))
  check('its antipode is at −90°', near(magneticLatitude(-DIPOLE_POLE.lat, DIPOLE_POLE.lon + 180), -90, 1e-6))
  const sun = { lat: 0, lon: 0 }
  check('magnetic noon under the Sun', near(magneticLocalTime(0, 0, sun), 12, 1e-6))
  check('magnetic time advances eastward', magneticLocalTime(0, 30, sun) > 12)
  check('magnetic midnight opposite the Sun', Math.min(magneticLocalTime(0, 180, sun), 24 - magneticLocalTime(0, 180, sun)) < 1.5, magneticLocalTime(0, 180, sun).toFixed(2))

  check('edge: 64° at Kp 1, 48° at Kp 9', edgeFromKp(1) === 64 && edgeFromKp(9) === 48)
  const presets = Object.fromEntries(STORM_PRESETS.map((p) => [p.id, p]))
  check('presets match the plan', presets.quiet.setting.edgeMlat === 64 && presets.g1.setting.edgeMlat === 56 && presets.g3.setting.edgeMlat === 52 && presets.may2024.setting.edgeMlat === 48 && presets.carrington.setting.edgeMlat === 25 && presets.carrington.kp === null)

  const field = fillStorm(newField(), stormFromKp(5), sun)
  check('model output is 65,160 cells', field.length === 65160)
  let inRange = true
  for (const v of field) if (v > 100) inRange = false
  check('every value is in 0–100', inRange)

  // Find night-side and day-side cells by their own magnetic coordinates
  let edgeCell = -1
  let belowCell = -1
  let dayEdgeCell = -1
  let nightPeak = 0
  let dayPeak = 0
  for (let row = 0; row < GRID_H; row++) {
    for (let col = 0; col < GRID_W; col++) {
      const lat = row - 90
      const m = magneticLatitude(lat, col)
      const mlt = magneticLocalTime(lat, col, sun)
      const i = row * GRID_W + col
      const nearMidnight = mlt < 1 || mlt > 23
      const nearNoon = mlt > 11 && mlt < 13
      if (nearMidnight && m > 0) nightPeak = Math.max(nightPeak, field[i])
      if (nearNoon && m > 0) dayPeak = Math.max(dayPeak, field[i])
      if (nearMidnight && Math.abs(m - 56.5) < 0.6) edgeCell = i
      if (nearMidnight && Math.abs(m - 53) < 0.6) belowCell = i
      if (nearNoon && Math.abs(m - 53) < 0.6) dayEdgeCell = i
    }
  }
  check('at Kp 5 the night-side edge is visible', edgeCell >= 0 && field[edgeCell] >= 10, `${field[edgeCell]}%`)
  check('3° equatorward of the edge there is nothing', belowCell >= 0 && field[belowCell] === 0)
  check('day side sits poleward of the night side', dayEdgeCell >= 0 && field[dayEdgeCell] === 0)
  check('day side is weaker than night side', dayPeak < nightPeak, `${dayPeak}% vs ${nightPeak}%`)
  check('peak follows Kp', stormFromKp(1).strength < stormFromKp(9).strength && stormFromKp(9).strength <= 100)

  const carrington = fillStorm(newField(), presets.carrington.setting, sun)
  const tokyoNightSun = { lat: 0, lon: 139 + 180 }
  const tokyo = fillStorm(newField(), presets.carrington.setting, { lat: tokyoNightSun.lat, lon: wrap180(tokyoNightSun.lon) })
  check('Carrington reaches mid-latitudes at night', sampleField(tokyo, 36, 139) > 0, `${sampleField(tokyo, 36, 139).toFixed(0)}%`)
  check('Carrington leaves the equator dark', sampleField(carrington, 0, 180) === 0)
}

console.log('\nCAMERA (§2, §6)')
{
  const aspect = 1200 / 700
  const pose = orbitPose(60, 20, 3.4)
  const centre = pickSurface(pose, 0, 0, aspect)
  check('screen centre picks the point under the camera', near(centre?.lat ?? 0, 60, 1e-6) && near(centre?.lon ?? 0, 20, 1e-6))
  const target = latLonToVec(72, 40)
  const screen = projectPoint(pose, target, aspect)
  const picked = screen ? pickSurface(pose, screen[0], screen[1], aspect) : null
  check('project then pick round-trips', near(picked?.lat ?? 0, 72, 1e-6) && near(picked?.lon ?? 0, 40, 1e-6))
  check('a ray missing the Earth picks nothing', pickSurface(pose, 0.99, 0.99, aspect) === null)
  check('camera up points toward north', pose.up[1] > 0)
  check('basis is orthonormal', near(Math.hypot(...pose.right), 1) && near(Math.hypot(...pose.up), 1) && near(pose.right[0] * pose.up[0] + pose.right[1] * pose.up[1] + pose.right[2] * pose.up[2], 0))

  const axes = localAxes(45, 10)
  const north = groundPose(45, 10, 0, 0)
  const east = groundPose(45, 10, 90, 0)
  const up = groundPose(45, 10, 0, 90)
  const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  check('heading 0 faces north', near(dot(north.forward, axes.north), 1, 1e-6))
  check('heading 90 faces east', near(dot(east.forward, axes.east), 1, 1e-6))
  check('pitch 90 faces straight up', near(dot(up.forward, axes.up), 1, 1e-6))
  check('east really is east of the observer', vecToLatLon([axes.up[0] + axes.east[0] * 0.01, axes.up[1] + axes.east[1] * 0.01, axes.up[2] + axes.east[2] * 0.01]).lon > 10)

  const orbit = { lat: 60, lon: 20, dist: 3.4 }
  const ground = { lat: 69.65, lon: 18.96, heading: 10, pitch: 14 }
  const start = flightPose(orbit, ground, 0)
  const end = flightPose(orbit, ground, 1)
  const groundEnd = groundPose(ground.lat, ground.lon, ground.heading, ground.pitch)
  const startOrbit = orbitPose(orbit.lat, orbit.lon, orbit.dist)
  check('flight starts at the orbit camera', near(dot(start.forward, startOrbit.forward), 1, 1e-6) && near(Math.hypot(...start.pos), 3.4, 1e-6))
  check('flight ends at the ground camera', near(dot(end.forward, groundEnd.forward), 1, 1e-6) && near(Math.hypot(...end.pos), Math.hypot(...groundEnd.pos), 1e-6))
  let finite = true
  for (let s = 0; s <= 1.0001; s += 0.05) {
    const p = flightPose(orbit, ground, s)
    if (![...p.pos, ...p.forward, ...p.up, ...p.right].every(Number.isFinite)) finite = false
  }
  check('flight never produces a bad camera', finite)
}

console.log('\nNOISE AND FORMATTING')
{
  const size = 64
  const noise = makeNoiseTexture(size)
  let worstSeam = 0
  let worstStep = 0
  for (let y = 0; y < size; y++) {
    worstSeam = Math.max(worstSeam, Math.abs(noise[(y * size + size - 1) * 4] - noise[y * size * 4]))
    for (let x = 1; x < size; x++) worstStep = Math.max(worstStep, Math.abs(noise[(y * size + x) * 4] - noise[(y * size + x - 1) * 4]))
  }
  check('noise tiles: the seam is no rougher than the interior', worstSeam <= worstStep * 1.2, `${worstSeam} vs ${worstStep}`)
  check('noise uses the full range', Math.max(...noise.filter((_, i) => i % 4 === 0)) === 255)
  check('noise is deterministic', makeNoiseTexture(32).every((v, i, a) => v === makeNoiseTexture(32)[i] || a.length === 0))

  check('time ago', timeAgo(0, 20_000) === 'just now' && timeAgo(0, 300_000) === '5 min ago' && timeAgo(0, 7_200_000) === '2 h ago')
  check('clock at a fixed offset', clockAtOffset(Date.UTC(2026, 10, 8, 23, 5), 3600) === '00:05')
  check('compass points, including the wrap', compassPoint(0) === 'N' && compassPoint(90) === 'E' && compassPoint(350) === 'N' && compassPoint(225) === 'SW')
  check('lat/lon formatting', formatLatLon(-42.88, 147.33) === '42.9°S 147.3°E')
  check('mean and max skip gaps', mean([1, null, 3]) === 2 && maxOf([1, null, 3]) === 3 && mean([null]) === null && maxOf([null]) === null)
  const buckets = bucketSeries([{ t: 0, v: 1 }, { t: 299_000, v: 3 }, { t: 300_000, v: 5 }], 300_000, (g, t) => ({ t, v: Math.max(...g.map((r) => r.v)) }))
  check('bucketing keeps peaks per bucket', buckets.length === 2 && buckets[0].v === 3 && buckets[1].t === 300_000)
  check('bucketing an empty series', bucketSeries<{ t: number }>([], 1000, (g) => g[0]).length === 0)
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`)
if (failures > 0) throw new Error(`${failures} check(s) failed`)
