/**
 * Numerical verification for the enclosure maths — run after changing anything in this folder.
 *
 * These are pure formulas with no UI, so they can be checked exactly. Every expected value here
 * comes from speaker-box-feature-plan.md, so the plan and the code cannot drift apart silently.
 * Not imported by the app. Run with:
 *
 *   node -e "import('rolldown').then(async r => { const b = await r.rolldown({ input: 'src/lib/enclosure/verify.ts' }); await b.write({ file: '/tmp/verify.mjs', format: 'esm' }) })" && node /tmp/verify.mjs
 */

import { BUTTERWORTH_Q, cuFtToLitres, litresToCuFt, portedTarget, sealedTarget, type Driver } from './alignment'
import { boardArea, cutList, isExactCutList } from './cutlist'
import { lengthForTuning, portDisplacement, tuningFrequency } from './ports'
import { baffleLength, grossVolume, interior, netVolume, topDepth, validate, type Enclosure } from './volume'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `   ${detail}` : ''}`)
}
const near = (a: number, b: number, tol = 0.001) => Math.abs(a - b) <= tol

const BOX: Enclosure = { width: 24, height: 16, depth: 14, thickness: 0.75, angle: 0 }

console.log('\nGROSS VOLUME')
{
  const i = interior(BOX)
  check('24x16x14 @ 3/4" inner dims are 22.5 x 14.5 x 12.5',
    near(i.width, 22.5) && near(i.height, 14.5) && near(i.meanDepth, 12.5),
    `${i.width} x ${i.height} x ${i.meanDepth}`)
  check('24x16x14 @ 3/4" gross = 2.360 ft^3', near(grossVolume(BOX), 2.36, 0.001),
    grossVolume(BOX).toFixed(4))
  check('24x16x14 @ 1" gross = 2.139 ft^3',
    near(grossVolume({ ...BOX, thickness: 1 }), 2.139, 0.001))
  check('18x14x12 @ 3/4" gross = 1.253 ft^3',
    near(grossVolume({ width: 18, height: 14, depth: 12, thickness: 0.75, angle: 0 }), 1.253, 0.001))
  check('18x14x12 @ 1" gross = 1.111 ft^3',
    near(grossVolume({ width: 18, height: 14, depth: 12, thickness: 1, angle: 0 }), 1.111, 0.001))
}

console.log('\nDEGENERATE INPUT GUARD')
check('6x6x1.5 @ 3/4" is rejected',
  validate({ width: 6, height: 6, depth: 1.5, thickness: 0.75, angle: 0 }).length > 0,
  validate({ width: 6, height: 6, depth: 1.5, thickness: 0.75, angle: 0 })[0] ?? '')
check('zero depth is rejected',
  validate({ width: 24, height: 16, depth: 0, thickness: 0.75, angle: 0 }).length > 0)
check('a sane box passes', validate(BOX).length === 0)
check('net volume never goes negative',
  netVolume(0.5, { driver: 2, ports: 0, bracing: 0 }) === 0)

console.log('\nPORTS')
{
  const ports = { diameter: 3, length: 10, count: 2 }
  const disp = portDisplacement(ports)
  check('2 x 3" x 10" displaces 0.082 ft^3', near(disp, 0.082, 0.001), disp.toFixed(4))
  check('  = 3.5% of gross', near((disp / grossVolume(BOX)) * 100, 3.5, 0.1))

  const net = netVolume(grossVolume(BOX), { driver: 0.15, ports: disp, bracing: 0 })
  check('net Vb = 2.128 ft^3', near(net, 2.128, 0.001), net.toFixed(4))
  const fb = tuningFrequency(ports, net)
  check('tunes to 40.2 Hz', fb !== null && near(fb, 40.2, 0.05), fb?.toFixed(2) ?? 'null')

  // Port count at fixed length, from the plan's table
  const expected: Record<number, number> = { 1: 28.4, 2: 40.2, 3: 49.2, 4: 56.8 }
  for (const count of [1, 2, 3, 4]) {
    const f = tuningFrequency({ ...ports, count }, net)
    check(`${count} x 3" -> ${expected[count]} Hz`, f !== null && near(f, expected[count], 0.05),
      f?.toFixed(1) ?? 'null')
  }
}

console.log('\nPORT FORWARD/INVERSE ROUND-TRIP')
for (const [dia, count] of [[4, 1], [3, 2], [2, 4]] as const) {
  const len = lengthForTuning(dia, count, 28.7, 1.94)
  const back = len === null ? null : tuningFrequency({ diameter: dia, length: len, count }, 1.94)
  check(`${count} x ${dia}" recovers 28.70 Hz`, back !== null && near(back, 28.7, 0.01),
    len === null ? 'unreachable' : `len ${len.toFixed(2)}" -> ${back?.toFixed(2)} Hz`)
}
// A 1" port in a 5 ft^3 box cannot tune as high as 100 Hz: the end correction alone already
// exceeds the required length, so the tube would have to be negative.
check('unreachable target returns null', lengthForTuning(1, 1, 100, 5) === null)

console.log('\nTHIELE-SMALL ALIGNMENT')
{
  const drivers: [string, Driver, number, number, number, number][] = [
    // name, driver, sealed vb, sealed f3, ported vb, ported f3
    ['12" sub', { vas: 2.0, qts: 0.4, fs: 30 }, 0.94, 53, 1.94, 28],
    ['10" sub', { vas: 1.2, qts: 0.35, fs: 34 }, 0.39, 69, 0.75, 38],
    ['high-Q', { vas: 1.5, qts: 0.55, fs: 40 }, 2.3, 51, 4.17, 24],
  ]
  for (const [name, d, sVb, sF3, pVb, pF3] of drivers) {
    const s = sealedTarget(d)
    const p = portedTarget(d)
    check(`${name} sealed Vb ${sVb} ft^3 / F3 ${sF3} Hz`,
      s !== null && near(s.vb, sVb, 0.01) && near(s.f3, sF3, 0.5),
      s ? `${s.vb.toFixed(2)} / ${s.f3.toFixed(1)}` : 'null')
    check(`${name} ported Vb ${pVb} ft^3 / F3 ${pF3} Hz`,
      p !== null && near(p.vb, pVb, 0.01) && near(p.f3, pF3, 0.5),
      p ? `${p.vb.toFixed(2)} / ${p.f3.toFixed(1)}` : 'null')
  }

  // Butterworth identity: at Qtc 0.707 the -3 dB point IS the system resonance
  const b = sealedTarget({ vas: 2.0, qts: 0.4, fs: 30 }, BUTTERWORTH_Q)
  check('Butterworth: F3 === Fc at Qtc 1/sqrt(2)', b !== null && near(b.f3, b.f, 1e-9),
    b ? `${b.f3.toFixed(4)} vs ${b.f.toFixed(4)}` : 'null')

  check('Qts >= Qtc returns null, not a negative volume',
    sealedTarget({ vas: 2.0, qts: 0.75, fs: 30 }, 0.707) === null)
  check('ported Vb lands near 2x sealed for the same driver', (() => {
    const s = sealedTarget({ vas: 2.0, qts: 0.4, fs: 30 })
    const p = portedTarget({ vas: 2.0, qts: 0.4, fs: 30 })
    return s !== null && p !== null && p.vb / s.vb > 1.5 && p.vb / s.vb < 2.5
  })())
}

console.log('\nUNITS')
check('1 ft^3 = 28.3168 litres', near(cuFtToLitres(1), 28.3168, 0.001))
check('litres -> ft^3 round-trips', near(litresToCuFt(cuFtToLitres(2.5)), 2.5, 1e-9))

console.log('\nCUT LIST')
{
  const panels = cutList(BOX)
  // The strongest possible check: panel material plus the cavity must exactly refill the shell
  const panelVolume = panels.reduce((s, p) => s + p.qty * p.width * p.height * BOX.thickness, 0)
  const i = interior(BOX)
  const cavity = i.width * i.height * i.meanDepth
  const shell = BOX.width * BOX.height * BOX.depth
  check('panels + cavity exactly refill the outer box', near(panelVolume + cavity, shell, 1e-9),
    `${panelVolume.toFixed(2)} + ${cavity.toFixed(2)} = ${(panelVolume + cavity).toFixed(2)} vs ${shell}`)
  check('board area is 12.02 ft^2', near(boardArea(panels), 12.02, 0.01), boardArea(panels).toFixed(2))
}

console.log('\nANGLED BAFFLE')
{
  // Independent check: integrate the offset cavity numerically over the side profile rather
  // than trusting the closed form. Analytic in width, 2D grid over height and depth.
  const numericVolume = (e: Enclosure, N = 3000) => {
    const r = (e.angle * Math.PI) / 180
    const cos = Math.cos(r), sin = Math.sin(r)
    const t = e.thickness
    const dy = e.height / N, dz = e.depth / N
    let cells = 0
    for (let j = 0; j < N; j++) {
      const y = (j + 0.5) * dy
      if (y < t || y > e.height - t) continue
      for (let k = 0; k < N; k++) {
        const z = (k + 0.5) * dz
        if (z < t) continue
        if (e.depth * cos - (z * cos + y * sin) < t) continue
        cells++
      }
    }
    return (cells * dy * dz * (e.width - 2 * t)) / 1728
  }

  check('0 deg equals the rectangular formula exactly',
    near(grossVolume({ ...BOX, angle: 0 }), 2.360026, 1e-6))

  for (const angle of [5, 10, 15, 20, 30]) {
    const e = { ...BOX, angle }
    const closed = grossVolume(e)
    const numeric = numericVolume(e)
    check(`${String(angle).padStart(2)} deg matches numerical integration`,
      Math.abs(closed - numeric) < 0.004,
      `closed ${closed.toFixed(4)} vs numeric ${numeric.toFixed(4)}`)
  }

  check('angle reduces volume monotonically',
    [0, 5, 10, 15, 20, 30].every((a, idx, arr) =>
      idx === 0 || grossVolume({ ...BOX, angle: a }) < grossVolume({ ...BOX, angle: arr[idx - 1] })))

  check('top depth shrinks with angle', near(topDepth({ ...BOX, angle: 15 }), 14 - 16 * Math.tan(Math.PI / 12), 1e-9),
    topDepth({ ...BOX, angle: 15 }).toFixed(3))
  check('baffle is longer than the box is tall',
    baffleLength({ ...BOX, angle: 15 }) > BOX.height, baffleLength({ ...BOX, angle: 15 }).toFixed(2))
  check('baffle length equals height at 0 deg', near(baffleLength(BOX), 16, 1e-9))

  // A slanted wall costs t/cos(theta) of depth, always more than a vertical one
  const i15 = interior({ ...BOX, angle: 15 })
  check('cavity is shallower at the top than the bottom', i15.depthTop < i15.depthBottom,
    `${i15.depthBottom.toFixed(2)}" -> ${i15.depthTop.toFixed(2)}"`)

  check('over-steep angle is rejected',
    validate({ ...BOX, angle: 44 }).length > 0,
    validate({ ...BOX, angle: 44 })[0] ?? '')
  check('angle beyond the cap is rejected', validate({ ...BOX, angle: 60 }).length > 0)
  check('a sane angle passes', validate({ ...BOX, angle: 15 }).length === 0)
}

console.log('\nANGLED CUT LIST')
{
  const e = { ...BOX, angle: 15 }
  const panels = cutList(e)
  check('sloped box has a trapezoidal side panel',
    panels.some((p) => p.width2 !== undefined))
  check('sloped baffle panel is longer than the height',
    panels.some((p) => p.name.startsWith('Baffle') && p.height > e.height))
  check('board area is positive and sane', boardArea(panels) > 5 && boardArea(panels) < 30,
    `${boardArea(panels).toFixed(2)} ft^2`)
  check('exact-refill only claimed for square boxes',
    isExactCutList(BOX) && !isExactCutList(e))
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`)
