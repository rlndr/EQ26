/**
 * Verification for the earthquake replay globe's marker logic.
 *
 * Not imported by the app. Run it through the runner:
 *
 *   node scripts/verify-earthquakes.mjs
 */

import { getMagnitudeBand, type EarthquakeFeature } from '../api'
import { fractionToMs } from '../nearearth/markers'
import { BAND_COLORS, type MagnitudeBand } from '../process'
import { buildQuakeMarkers, dayLabel, magnitudeLevel, monthBounds } from './markers'
import MARKERS_FRAG from '../nearearth/markers.frag.glsl?raw'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `   ${detail}` : ''}`)
}
const near = (a: number, b: number, tol = 1e-4) => Math.abs(a - b) <= tol

const quake = (time: number, mag: number | null, place = 'Somewhere', lon = 0, lat = 0): EarthquakeFeature => ({
  properties: { mag: mag as number, place, time, url: '', title: '' },
  geometry: { type: 'Point', coordinates: [lon, lat, 10] },
})

console.log('\nMAGNITUDE LEVEL')
{
  check('M4.9 → 0 (clamped)', magnitudeLevel(4.9) === 0)
  check('M5 → 0', magnitudeLevel(5) === 0)
  check('M6.5 → 0.5', near(magnitudeLevel(6.5), 0.5, 1e-12))
  check('M8 → 1', magnitudeLevel(8) === 1)
  check('M9.1 → 1 (clamped)', magnitudeLevel(9.1) === 1)
}

console.log('\nMONTH BOUNDS')
{
  const [leapStart, leapEnd] = monthBounds(2024, 2)
  check('Feb 2024 starts 1 Feb', leapStart === Date.UTC(2024, 1, 1))
  check('Feb 2024 (leap) ends 29 Feb 23:59:59.999', leapEnd === Date.UTC(2024, 1, 29, 23, 59, 59, 999))
  const [, plainEnd] = monthBounds(2023, 2)
  check('Feb 2023 ends 28 Feb 23:59:59.999', plainEnd === Date.UTC(2023, 1, 28, 23, 59, 59, 999))
  const [decStart, decEnd] = monthBounds(2024, 12)
  check('Dec 2024 starts 1 Dec 2024', decStart === Date.UTC(2024, 11, 1))
  check('Dec 2024 ends just before 1 Jan 2025', decEnd === Date.UTC(2025, 0, 1) - 1 && new Date(decEnd).getUTCFullYear() === 2024)
}

console.log('\nMARKERS')
{
  const [start, end] = monthBounds(2025, 3)
  const mid = start + (end - start) / 2
  const m = buildQuakeMarkers([
    quake(end, 7.2, 'Last'),
    quake(start, 5.1, 'First'),
    quake(mid, 6.5, 'Middle', 140.1, 35.6),
    quake(start - 60_000, 5.4, 'Before'),
    quake(end + 60_000, 5.5, 'After'),
  ], 2025, 3)
  check('startMs and endMs are the month', m.startMs === start && m.endMs === end)
  check('oldest first', m.events.map((e) => e.place).join(',') === 'Before,First,Middle,Last,After', m.events.map((e) => e.place).join(','))
  check('first instant of the month → 0', m.times[1] === 0)
  check('mid-month → 0.5', near(m.times[2], 0.5, 1e-6), String(m.times[2]))
  check('last instant of the month → 1', m.times[3] === 1)
  check('before the month clamps to 0', m.times[0] === 0)
  check('after the month clamps to 1', m.times[4] === 1)
  check('energies from magnitudeLevel', near(m.energies[2], 0.5, 1e-6) && near(m.energies[3], magnitudeLevel(7.2), 1e-6))
  check('positions are unit vectors', near(Math.hypot(m.positions[6], m.positions[7], m.positions[8]), 1, 1e-5))
  const e = m.events[2]
  check('events carry lat, lon, mag, place and time', e.lat === 35.6 && e.lon === 140.1 && e.mag === 6.5 && e.place === 'Middle' && e.time === mid)

  const skipped = buildQuakeMarkers([
    quake(start, null, 'No magnitude'),
    quake(start, Number.NaN, 'NaN magnitude'),
    quake(start, 5.2, 'No location', Number.NaN, 10),
    quake(start + 1000, 5.3, 'Kept'),
  ], 2025, 3)
  check('skips a null magnitude, a non-finite magnitude and non-finite coordinates', skipped.events.length === 1 && skipped.events[0].place === 'Kept')

  const empty = buildQuakeMarkers([], 2025, 3)
  check('empty feature list', empty.events.length === 0 && empty.positions.length === 0 && empty.times.length === 0 && empty.startMs === start)

  check('steps: Feb 2024 has 29 days', buildQuakeMarkers([], 2024, 2).steps === 29)
  check('steps: Feb 2023 has 28 days', buildQuakeMarkers([], 2023, 2).steps === 28)
  check('steps: Mar 2025 has 31 days', m.steps === 31)
  check('steps: Apr 2025 has 30 days', buildQuakeMarkers([], 2025, 4).steps === 30)
  check('steps: Dec 2024 has 31 days', buildQuakeMarkers([], 2024, 12).steps === 31)
}

console.log('\nDATE LABELS')
{
  const [start, end] = monthBounds(2025, 3)
  check('"1 Mar"', dayLabel(Date.UTC(2025, 2, 1)) === '1 Mar', dayLabel(Date.UTC(2025, 2, 1)))
  check('"14 Mar"', dayLabel(Date.UTC(2025, 2, 14, 18, 30)) === '14 Mar', dayLabel(Date.UTC(2025, 2, 14, 18, 30)))
  check('"31 Mar"', dayLabel(Date.UTC(2025, 2, 31, 23, 59)) === '31 Mar', dayLabel(Date.UTC(2025, 2, 31, 23, 59)))
  check('timeline start reads "1 Mar"', dayLabel(fractionToMs(0, start, end)) === '1 Mar')
  check('timeline end reads "31 Mar", not "1 Apr"', dayLabel(fractionToMs(1, start, end)) === '31 Mar', dayLabel(fractionToMs(1, start, end)))
  check('UTC, not local time: 1 Mar 00:00 UTC', dayLabel(Date.UTC(2025, 2, 1, 0, 0)) === '1 Mar' && dayLabel(Date.UTC(2025, 1, 28, 23, 59)) === '28 Feb')
}

console.log('\nBAND COLOURS (BAND_COLORS, getMagnitudeBand and markers.frag.glsl)')
{
  // The shader's bandColor(): thresholds, the rounding allowance and one colour per band
  const body = MARKERS_FRAG.slice(MARKERS_FRAG.indexOf('vec3 bandColor'))
  const allowance = Number(/3\.0 \* level \+ ([\d.]+)/.exec(body)?.[1])
  const rows = [...body.matchAll(/(?:if \(mag >= ([\d.]+)\) )?return vec3\(([\d.]+), ([\d.]+), ([\d.]+)\);/g)]
    .map((r) => ({ min: r[1] === undefined ? -Infinity : Number(r[1]), rgb: [Number(r[2]), Number(r[3]), Number(r[4])] }))
  check('shader has four bands', rows.length === 4 && Number.isFinite(allowance), `${rows.length} bands, allowance ${allowance}`)

  const hexRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  // As the GPU sees it: the level goes through a Float32Array
  const shaderRgb = (mag: number) => {
    const m = 5 + 3 * Math.fround(magnitudeLevel(mag)) + allowance
    return rows.find((r) => m >= r.min)?.rgb ?? [0, 0, 0]
  }
  for (const mag of [5.0, 5.99, 6.0, 7.0, 8.0]) {
    const band = getMagnitudeBand(mag) as MagnitudeBand
    const want = hexRgb(BAND_COLORS[band])
    const got = shaderRgb(mag)
    check(`M${mag}: ${band} ${BAND_COLORS[band]} in BAND_COLORS and the shader`, got.every((c, i) => near(c, want[i], 0.002)), got.join(', '))
  }
  check('allowance is within 0.01 magnitude', allowance > 0 && allowance < 0.01)
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`)
