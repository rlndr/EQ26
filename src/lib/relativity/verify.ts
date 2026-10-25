/**
 * Numerical verification for the special relativity and cosmic journey maths.
 *
 * Every benchmark value and worked example from time-dilation-feature-plan.md is asserted here
 * so the plan and code stay locked together. Not imported by the app. Run with:
 *
 *   node -e "import('rolldown').then(async r => { const b = await r.rolldown({ input: 'src/lib/relativity/verify.ts' }); await b.write({ file: '/tmp/verify-relativity.mjs', format: 'esm' }) })" && node /tmp/verify-relativity.mjs
 */

import {
  betaFromGamma,
  betaToSlider,
  C_KMS,
  DEFAULT_BETA,
  formatClockTime,
  lengthContraction,
  lorentzGamma,
  sliderToBeta,
  speedKms,
  tickRate,
} from './physics'
import { formatHumanDuration, solveJourney } from './journey'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `   ${detail}` : ''}`)
}
const near = (a: number, b: number, tol = 1e-4) => Math.abs(a - b) <= tol

console.log('\nLORENTZ FACTOR & TELEMETRY TABLE (§1)')
{
  check('Rest (β = 0) -> γ = 1, tickRate = 100%, speed = 0',
    lorentzGamma(0) === 1 && tickRate(0) === 1 && speedKms(0) === 0)

  const parkerG = lorentzGamma(0.00064)
  check('Parker Solar Probe (0.00064c) -> γ ≈ 1.0000002048, ~192 km/s',
    near(parkerG, 1.0000002048, 1e-9) && near(speedKms(0.00064), 191.867, 0.01),
    `γ = ${parkerG.toFixed(10)}, v = ${speedKms(0.00064).toFixed(1)} km/s`)

  check('0.10c -> γ = 1.0050, tickRate = 99.50%, v = 29,979 km/s',
    near(lorentzGamma(0.1), 1.005038, 1e-5) &&
    near(tickRate(0.1) * 100, 99.5, 0.01) &&
    near(speedKms(0.1), 29_979.25, 0.1))

  check('0.50c -> γ = 1.1547, tickRate = 86.60%, v = 149,896 km/s',
    near(lorentzGamma(0.5), 1.154701, 1e-5) &&
    near(tickRate(0.5) * 100, 86.6025, 0.01) &&
    near(speedKms(0.5), 149_896.23, 0.1))

  check('DEFAULT_BETA (√3/2 ≈ 0.8660254c) -> γ = 2.000000 exact, tickRate = 50.00%',
    near(lorentzGamma(DEFAULT_BETA), 2.0, 1e-12) &&
    near(tickRate(DEFAULT_BETA), 0.5, 1e-12) &&
    near(lengthContraction(DEFAULT_BETA), 0.5, 1e-12) &&
    near(speedKms(DEFAULT_BETA), 259_627.88, 0.05),
    `γ = ${lorentzGamma(DEFAULT_BETA).toFixed(6)}, v = ${Math.round(speedKms(DEFAULT_BETA))} km/s`)

  check('0.99c -> γ = 7.0888, tickRate = 14.11%, v = 296,795 km/s',
    near(lorentzGamma(0.99), 7.088812, 1e-5) &&
    near(tickRate(0.99) * 100, 14.1067, 0.01) &&
    near(speedKms(0.99), 296_794.53, 0.1))

  check('0.999c -> γ = 22.3663, tickRate = 4.47%, v = 299,493 km/s',
    near(lorentzGamma(0.999), 22.366272, 1e-5) &&
    near(tickRate(0.999) * 100, 4.471, 0.01) &&
    near(speedKms(0.999), 299_492.67, 0.1))

  check('0.9999c -> γ = 70.7124, tickRate = 1.41%, v = 299,762 km/s',
    near(lorentzGamma(0.9999), 70.712446, 1e-5) &&
    near(tickRate(0.9999) * 100, 1.4142, 0.01) &&
    near(speedKms(0.9999), 299_762.48, 0.1))

  check('0.99999c -> γ = 223.6074, tickRate = 0.45%, v = 299,789 km/s',
    near(lorentzGamma(0.99999), 223.607357, 1e-5) &&
    near(tickRate(0.99999) * 100, 0.4472, 0.01) &&
    near(speedKms(0.99999), 299_789.46, 0.1))
}

console.log('\nINVERSE & SLIDER ROUND-TRIPS')
{
  for (const b of [0, 0.1, 0.5, DEFAULT_BETA, 0.99, 0.999, 0.9999, 0.99999]) {
    const g = lorentzGamma(b)
    const recovered = betaFromGamma(g)
    check(`betaFromGamma(lorentzGamma(${b.toFixed(5)})) recovers β`,
      near(recovered, b, 1e-9), `${recovered.toFixed(7)}`)
  }

  for (const b of [0, 0.25, 0.5, DEFAULT_BETA, 0.9999]) {
    const s = betaToSlider(b, false)
    const back = sliderToBeta(s, false)
    check(`linear slider round-trip for β = ${b.toFixed(4)}`, near(back, b, 1e-9))
  }

  // Ultra-relativistic slider nines milestones: t = 0, 250, 500, 750, 1000
  const expectedNines: [number, number][] = [
    [0, 0.9],
    [250, 0.99],
    [500, 0.999],
    [750, 0.9999],
    [1000, 0.99999],
  ]
  for (const [sliderPos, expectedBeta] of expectedNines) {
    const b = sliderToBeta(sliderPos, true)
    const back = betaToSlider(b, true)
    check(`ultra-rel slider ${sliderPos} <-> ${expectedBeta}c`,
      near(b, expectedBeta, 1e-9) && near(back, sliderPos, 1e-6),
      `β = ${b.toFixed(6)}, slider = ${back.toFixed(2)}`)
  }
}

console.log('\nCOSMIC JOURNEY & TWIN PARADOX CALCULATOR (§4)')
{
  // 1. 5 years of ship time at β = √3/2 (γ = 2)
  const j1 = solveJourney({ mode: 'shipTime', value: 5, unit: 'years', beta: DEFAULT_BETA })
  check('5 yrs ship time @ 0.866c -> 10.00 yrs Earth, +5.00 yrs diff, 8.66 ly',
    near(j1.shipYears, 5, 1e-6) &&
    near(j1.earthYears, 10, 1e-6) &&
    near(j1.diffYears, 5, 1e-6) &&
    near(j1.distanceLy, 8.660254, 1e-4),
    `ship=${j1.shipYears.toFixed(2)}y, earth=${j1.earthYears.toFixed(2)}y, dist=${j1.distanceLy.toFixed(2)}ly`)

  // 2. Earth time mode inverse consistency: feeding 10 yrs Earth time gives 5 yrs ship time
  const j1Inv = solveJourney({ mode: 'earthTime', value: 10, unit: 'years', beta: DEFAULT_BETA })
  check('10 yrs Earth time @ 0.866c recovers 5.00 yrs ship time & 8.66 ly',
    near(j1Inv.shipYears, 5, 1e-6) && near(j1Inv.distanceLy, j1.distanceLy, 1e-6))

  // 3. Alpha Centauri (4.37 ly) at β = √3/2 (γ = 2)
  const alpha = solveJourney({ mode: 'distance', value: 4.37, unit: 'years', beta: DEFAULT_BETA })
  check('Alpha Centauri (4.37 ly) @ 0.866c -> Earth 5.05 yrs, Ship 2.52 yrs',
    near(alpha.earthYears, 5.046, 0.005) &&
    near(alpha.shipYears, 2.523, 0.005) &&
    near(alpha.diffYears, 2.523, 0.005),
    `earth=${alpha.earthYears.toFixed(2)}y, ship=${alpha.shipYears.toFixed(2)}y`)

  // 4. Length contraction consistency: shipYears === (distanceLy * lengthContraction) / beta
  const contractedDist = 4.37 * lengthContraction(DEFAULT_BETA)
  check('Length-contracted distance / β equals dilated ship time exactly',
    near(contractedDist / DEFAULT_BETA, alpha.shipYears, 1e-12))

  // 5. Galactic Center (26,000 ly) at 0.9999c (γ = 70.7124)
  const gal = solveJourney({ mode: 'distance', value: 26_000, unit: 'years', beta: 0.9999 })
  check('Galactic Center (26k ly) @ 0.9999c -> Earth 26,002.6 yrs, Ship 367.7 yrs',
    near(gal.earthYears, 26_002.6, 0.2) && near(gal.shipYears, 367.72, 0.05),
    `earth=${gal.earthYears.toFixed(1)}y, ship=${gal.shipYears.toFixed(2)}y`)

  // 6. Andromeda (2,537,000 ly) at 0.99999c (γ = 223.6074)
  const androm = solveJourney({ mode: 'distance', value: 2_537_000, unit: 'years', beta: 0.99999 })
  check('Andromeda (2.537M ly) @ 0.99999c -> Earth 2.54M yrs, Ship 11,346 yrs',
    formatHumanDuration(androm.earthYears) === '2.54M yrs' &&
    near(androm.shipYears, 11_345.9, 0.5),
    `earth=${formatHumanDuration(androm.earthYears)}, ship=${formatHumanDuration(androm.shipYears)}`)

  // 7. Guard at β = 0 in distance mode
  const restDist = solveJourney({ mode: 'distance', value: 4.37, unit: 'years', beta: 0 })
  check('Distance > 0 at β = 0 returns ∞ rather than NaN',
    restDist.earthYears === Infinity &&
    restDist.shipYears === Infinity &&
    formatHumanDuration(restDist.earthYears) === '∞')
}

console.log('\nFORMATTERS & CONSTANTS')
{
  check('C_KMS is exact SI 299,792.458 km/s', C_KMS === 299_792.458)
  check('formatClockTime(3661.25) -> 01:01:01.25', formatClockTime(3661.25) === '01:01:01.25', formatClockTime(3661.25))
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`)
if (failures > 0) throw new Error(`${failures} check(s) failed`)
