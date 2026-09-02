/**
 * Physics verification harness — run this after changing anything in constants.ts.
 *
 * The game cannot be checked by playing it in CI, and tuning constants by feel is easy to get
 * subtly wrong: too fast and the ball tunnels through bricks, and a level can quietly become
 * unclearable. This simulates real play and asserts the invariants instead.
 *
 * Not imported by the app — it is a standalone script, and it replaces Math.random with a
 * seeded generator so runs are reproducible. Run it with:
 *
 *   node -e "import('rolldown').then(async r => { const b = await r.rolldown({ input: 'src/lib/arkanoid/verify.ts' }); await b.write({ file: '/tmp/verify.mjs', format: 'esm' }) })" && node /tmp/verify.mjs
 */

import {
  BALL_R, BALL_SPEED_MAX, BALL_SPEED_START, BRICK_H, DT, MAX_BOUNCE_DEG,
  PADDLE_H, PADDLE_Y, PLAY_LEFT, PLAY_RIGHT, PLAY_TOP,
} from './constants'
import { Engine } from './engine'
import { buildLevel, LEVELS } from './levels'
import type { Input } from './types'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `   ${detail}` : ''}`)
}

let seed = 1
Math.random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}
const input = (x: number | null): Input => ({ pointerX: x, left: false, right: false })

console.log(`\nSPEEDS: start ${BALL_SPEED_START}, max ${BALL_SPEED_MAX}`)

console.log('\nLEVEL DATA')
for (let i = 0; i < LEVELS.length; i++) {
  try {
    const bricks = buildLevel(i)
    const destructible = bricks.filter((b) => b.kind !== 'gold').length
    check(`level ${i + 1} parses`, destructible > 0,
      `${bricks.length} bricks (${bricks.length - destructible} gold)`)
  } catch (err) {
    check(`level ${i + 1} parses`, false, String(err))
  }
}

console.log('\nTUNNELLING HEADROOM')
const perTick = BALL_SPEED_MAX * DT
check('travel/tick < brick height', perTick < BRICK_H, `${perTick.toFixed(2)} vs ${BRICK_H}`)
check('travel/tick < paddle height', perTick < PADDLE_H, `${perTick.toFixed(2)} vs ${PADDLE_H}`)
check('start speed is not clamped by max', BALL_SPEED_START < BALL_SPEED_MAX,
  `${BALL_SPEED_START} < ${BALL_SPEED_MAX}`)

console.log('\nPADDLE REFLECTION')
function reflect(t: number) {
  const e = new Engine()
  e.paddleX = 112
  e.launch()
  const b = e.balls[0]
  const speed = Math.hypot(b.vx, b.vy)
  b.x = e.paddleX + t * (e.paddleW / 2)
  b.y = PADDLE_Y - BALL_R + 0.5
  b.vx = 0
  b.vy = speed
  e.step(DT, input(e.paddleX))
  return { deg: (Math.atan2(b.vx, -b.vy) * 180) / Math.PI, speed: Math.hypot(b.vx, b.vy), speed0: speed, up: b.vy < 0 }
}
for (const t of [-1, 0, 1]) {
  const r = reflect(t)
  check(`hit at ${t >= 0 ? '+' : ''}${t} reflects ${(t * MAX_BOUNCE_DEG).toFixed(0)}°`,
    Math.abs(r.deg - t * MAX_BOUNCE_DEG) < 0.5 && r.up, `got ${r.deg.toFixed(1)}°`)
}
check('launch speed matches BALL_SPEED_START', Math.abs(reflect(0).speed0 - BALL_SPEED_START) < 1e-9,
  `${reflect(0).speed0.toFixed(1)}`)

console.log('\nFRAMERATE INDEPENDENCE')
function runAt(frameHz: number, seconds: number) {
  seed = 777
  const e = new Engine()
  e.paddleX = 112
  e.launch()
  let acc = 0
  let steps = 0
  for (let f = 0; f < Math.round(seconds * frameHz); f++) {
    acc += 1 / frameHz
    while (acc >= DT) {
      e.step(DT, input(112))
      acc -= DT
      steps++
    }
  }
  const b = e.balls[0]
  return { steps, x: b?.x ?? NaN, y: b?.y ?? NaN }
}
for (const hz of [30, 60, 144, 240]) {
  const r = runAt(hz, 10)
  check(`${String(hz).padStart(3)} Hz -> ${r.steps} steps in 10 s`, Math.abs(r.steps - 1200) <= 1)
}
for (const secs of [4, 40]) {
  const a = runAt(60, secs)
  const b = runAt(144, secs)
  const drift = Math.hypot(a.x - b.x, a.y - b.y)
  check(`drift after ${secs} s within one step`, drift <= perTick + 1e-6, `${drift.toFixed(3)} units`)
}

console.log('\nPLAYTHROUGH')
function play(levelIndex: number, maxSeconds = 400) {
  seed = 4242 + levelIndex
  const e = new Engine()
  e.lives = 9999
  e.startLevel(levelIndex)
  e.launch()
  let ticks = 0
  let escaped = false
  let nan = false
  let speedGain = false
  const maxTicks = Math.round(maxSeconds / DT)
  const baseSpeed = e.baseSpeed
  while (e.status !== 'levelComplete' && ticks < maxTicks) {
    if (e.status === 'ready') e.launch()
    let target = 112
    let lowest = -Infinity
    for (const b of e.balls) if (b.y > lowest) { lowest = b.y; target = b.x }
    e.step(DT, input(target + Math.sin(ticks / 90) * 10))
    for (const b of e.balls) {
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) nan = true
      if (b.x < PLAY_LEFT - 1 || b.x > PLAY_RIGHT + 1 || b.y < PLAY_TOP - 1) escaped = true
      if (Math.hypot(b.vx, b.vy) > baseSpeed + 1e-6) speedGain = true
    }
    ticks++
  }
  return { cleared: e.status === 'levelComplete', seconds: ticks * DT, escaped, nan, speedGain }
}
let anyBad = false
for (let i = 0; i < LEVELS.length; i++) {
  const r = play(i)
  check(`level ${i + 1} cleared`, r.cleared, `${r.seconds.toFixed(0)}s of bot play`)
  if (r.escaped || r.nan || r.speedGain) anyBad = true
}
check('no NaN / wall escapes / speed gain across all levels', !anyBad)

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`)
