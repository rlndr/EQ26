/**
 * Numerical verification for Near Earth. Values come from near-earth-feature-plan.md.
 *
 * Not imported by the app. Run it through the runner, which also runs the Lambda's checks and
 * compiles the shaders:
 *
 *   node scripts/verify-near-earth.mjs
 */

import { comparedToHiroshima, formatEnergy, ktFromMt, LADDER, ladderFraction } from './energy'
import { latLonToVec } from '../aurora/astro'
import { orbitPose, pickSurface, projectPoint } from '../aurora/camera'
import { closestIndex, compressRadius, compressVector, samplePath, speedAt } from './flybyStage'
import { buildMarkers, energyLevel, fractionToMs, timeFraction, yearBounds, yearCounts } from './markers'
import {
  ResponseShapeError, parseFireballs, parseFlybys, parseObject, parseRisk, parseTrack, type Fireball,
} from './parse'
import {
  auToLd, diameterFromH, formatLength, formatSizeEstimate, formatTimeUncertainty, GEOSTATIONARY_LD, oddsInWords, palermoBand, SEARCH_LIMIT_LD, sizeFromH, timeUncertaintyMinutes,
} from './scale'

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
    return err instanceof ResponseShapeError
  }
}

console.log('\nSCALE (§10)')
{
  check('size, H=22 → 134.8 m', near(diameterFromH(22) * 1000, 134.8, 0.05), (diameterFromH(22) * 1000).toFixed(1))
  check('size, H=25 → 33.9 m', near(diameterFromH(25) * 1000, 33.9, 0.05))
  check('size, H=27.7 → 9.8 m', near(diameterFromH(27.7) * 1000, 9.8, 0.05))
  check('size, H=30 → 3.4 m', near(diameterFromH(30) * 1000, 3.4, 0.05))
  const range = sizeFromH(27.7)
  check('range for H=27.7 is 8–17 m', Math.round(range.lowM) === 8 && Math.round(range.highM) === 17, `${range.lowM.toFixed(1)}–${range.highM.toFixed(1)}`)
  check('size wording', formatSizeEstimate(27.7) === 'about 9.8 m (7.7–17 m)', formatSizeEstimate(27.7))
  check('no H', formatSizeEstimate(null) === 'Size unknown')
  check('km wording', formatLength(1300) === '1.3 km' && formatLength(490) === '490 m')
  check('0.00795386 au → 3.10 LD', near(auToLd(0.00795386), 3.10, 0.005), auToLd(0.00795386).toFixed(3))
  check('0.05 au → 19.46 LD', near(SEARCH_LIMIT_LD, 19.46, 0.005))
  check('geostationary → 0.11 LD', near(GEOSTATIONARY_LD, 0.11, 0.001))
  check('3.401e-4 reads 1 in 2,940', oddsInWords(3.401e-4) === '1 in 2,940', oddsInWords(3.401e-4))
  check('8.515e-7 reads 1 in 1,170,000', oddsInWords(8.515158e-7) === '1 in 1,170,000', oddsInWords(8.515158e-7))
  check('odds below 100 are whole numbers', oddsInWords(0.1027) === '1 in 10', oddsInWords(0.1027))
  check('odds edge cases', oddsInWords(null) === 'Unknown' && oddsInWords(0) === 'Unknown' && oddsInWords(1) === 'Certain')
  check('Palermo bands', palermoBand(-6) === 'none' && palermoBand(-2.01) === 'none' && palermoBand(-2) === 'monitor' && palermoBand(0) === 'monitor' && palermoBand(0.1) === 'above')
  check('2_00:46 is 2 days 46 minutes', formatTimeUncertainty('2_00:46') === '2 days 46 minutes', formatTimeUncertainty('2_00:46'))
  check('13:02', formatTimeUncertainty('13:02') === '13 hours 2 minutes')
  check('< 00:01 is under a minute', formatTimeUncertainty('< 00:01') === 'under a minute')
  check('00:01 is singular', formatTimeUncertainty('00:01') === '1 minute')
  check('unparseable uncertainty', timeUncertaintyMinutes('soon') === null && formatTimeUncertainty('soon') === 'Unknown')
}

console.log('\nENERGY LADDER (§7)')
{
  check('75,210 Mt = 7.521 × 10⁷ kt', ktFromMt(75210) === 7.521e7)
  check('format kt and Mt', formatEnergy(441) === '441 kt' && formatEnergy(75_210_000) === '75,210 Mt' && formatEnergy(0.18) === '0.18 kt', formatEnergy(0.18))
  let rising = true
  for (let i = 1; i < LADDER.length; i++) if (ladderFraction(LADDER[i].kt) <= ladderFraction(LADDER[i - 1].kt)) rising = false
  check('ladder rises with energy', rising)
  check('ladder clamps', ladderFraction(1e-6) === 0 && ladderFraction(1e30) === 1)
  check('Chelyabinsk compared', comparedToHiroshima(441) === '29 × Hiroshima', comparedToHiroshima(441))
  check('small event compared', comparedToHiroshima(0.75) === '5% of Hiroshima', comparedToHiroshima(0.75))
  check('similar event compared', comparedToHiroshima(15) === 'About the same as Hiroshima')
}

console.log('\nMARKERS')
{
  const T = (y: number) => Date.UTC(y, 0, 1)
  const events: Fireball[] = [
    { t: T(2010), kt: 441, lat: 54.8, lon: 61.1, altKm: 23, speedKms: 18 },
    { t: T(2000), kt: 0.05, lat: 0, lon: 0, altKm: null, speedKms: null },
    { t: T(2005), kt: 1, lat: null, lon: null, altKm: null, speedKms: null },
  ]
  const m = buildMarkers(events, T(2020))
  check('only located events become markers', m.events.length === 2)
  check('oldest first', m.events[0].t === T(2000))
  check('times run 0 to end', m.times[0] === 0 && near(m.times[1], (T(2010) - T(2000)) / (T(2020) - T(2000)), 1e-6))
  check('positions are unit vectors', near(Math.hypot(m.positions[3], m.positions[4], m.positions[5]), 1, 1e-5))
  check('energy levels clamp and rise', energyLevel(0.01) === 0 && energyLevel(1000) === 1 && energyLevel(1) > energyLevel(0.1))
  check('time fraction round trip', near(fractionToMs(timeFraction(T(2015), T(2000), T(2020)), T(2000), T(2020)), T(2015), 1))
  check('empty record is safe', buildMarkers([], T(2020)).events.length === 0)

  const years = yearCounts(events)
  check('year counts include unlocated events', years.find((y) => y.year === 2005)?.count === 1)
  check('year counts keep empty years', years.length === 11 && years.find((y) => y.year === 2003)?.count === 0)
  check('year bounds', yearBounds(2013)[0] === T(2013) && yearBounds(2013)[1] === T(2014))
}

console.log('\nGLOBE AND FLYBY GEOMETRY')
{
  const aspect = 1300 / 620
  const pose = orbitPose(30, 40, 3.4)
  const screen = projectPoint(pose, latLonToVec(54.8, 61.1), aspect)
  const picked = screen ? pickSurface(pose, screen[0], screen[1], aspect) : null
  check('Chelyabinsk projects and picks back to itself', near(picked?.lat ?? 0, 54.8, 1e-5) && near(picked?.lon ?? 0, 61.1, 1e-5))

  const v = [3e6, -4e6, 12e6] as [number, number, number]
  const r = Math.hypot(...v)
  const log = compressVector(v, 'log')
  const logR = Math.hypot(...log)
  check('log mode keeps direction exactly', near(log[0] / logR, v[0] / r, 1e-9) && near(log[1] / logR, v[1] / r, 1e-9) && near(log[2] / logR, v[2] / r, 1e-9))
  check('log radius', near(logR, compressRadius(r, 'log'), 1e-9) && near(compressRadius(6371, 'log'), Math.log10(2), 1e-9))
  check('linear mode is unchanged', compressVector(v, 'linear').every((c, i) => near(c, v[i], 1e-6)))
  check('origin is safe', compressVector([0, 0, 0], 'log').every((c) => c === 0))
  const further: [number, number, number] = [6e6, -8e6, 24e6]
  check('log radius rises with distance', Math.hypot(...compressVector(further, 'log')) > logR)

  const path: [number, number, number][] = [[100, 0, 0], [40, 30, 0], [10, 0, 0], [100, 100, 0]]
  check('closest sample', closestIndex(path) === 2)
  check('sampling interpolates', near(samplePath(path, 0.5)[0], 70) && near(samplePath(path, 0.5)[1], 15))
  check('sampling clamps at the ends', samplePath(path, 99)[1] === 100 && samplePath(path, -5)[0] === 100)
  check('speed from neighbouring samples', near(speedAt([[0, 0, 0], [7200, 0, 0]], 0, 2), 1, 1e-9))
  check('speed at the last sample uses the last pair', near(speedAt([[0, 0, 0], [7200, 0, 0]], 1, 2), 1, 1e-9))
  check('speed with one sample is safe', speedAt([[1, 2, 3]], 0, 2) === 0)
}

console.log('\nRESPONSE SHAPES')
{
  const fb = parseFireballs({ events: [[1, 2, null, null, null, null]], stale: true })
  check('fireball row and stale flag', fb.events[0].kt === 2 && fb.events[0].lat === null && fb.stale)
  check('bad fireball row rejected', throwsShape(() => parseFireballs({ events: [[1, 2]] })))
  check('fireball without energy rejected', throwsShape(() => parseFireballs({ events: [[1, null, 0, 0, 0, 0]] })))
  check('flyby row', parseFlybys({ flybys: [['a', 'A', 1, 0.1, 0.05, 0.2, 5, 27, '00:01', true]] }).flybys[0].onRisk === true)
  check('unknown risk flag stays null', parseFlybys({ flybys: [['a', 'A', 1, 0.1, 0.05, 0.2, 5, 27, '00:01', null]] }).flybys[0].onRisk === null)
  check('risk row', parseRisk({ objects: [['a', 'A', 1e-4, -2, 0.1, 2030, 2040, 3, null, 8]], removedCount: 5 }).objects[0].torino === null)
  check('non-object rejected', throwsShape(() => parseRisk([])))
  const removed = parseObject({ des: 'a', orbit: null, sentry: { removed: '2021-02-21' } })
  check('removed object', removed.sentry?.removed === '2021-02-21' && removed.orbitClass === null)
  check('flyby with no Sentry record', parseObject({ des: 'a', orbit: { orbitClass: 'Apollo', hazardous: false }, sentry: null }).sentry === null)
  check('track', parseTrack({ des: 'a', startMs: 1, stepHours: 2, object: [[1, 2, 3]], moon: [] }).object[0][2] === 3)
  check('bad track rejected', throwsShape(() => parseTrack({ des: 'a', startMs: 1, stepHours: 2, object: [[1, 2]], moon: [] })))
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`)
if (failures > 0) throw new Error(`${failures} check(s) failed`)
