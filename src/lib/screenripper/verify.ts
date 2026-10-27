/**
 * ScreenRipper verification — run after changing the registry, the timing constants or (from
 * step 6) any shader.
 *
 * Patterns can only be judged by eye, but the parts around them can be checked numerically: the
 * key map; the timing of fades, pause and the 60-second auto-cycle, driven frame by frame
 * through Director exactly as the animation loop drives it; the GL pixel budget; shader error
 * formatting; every 2D pattern's real frame code against a recording context; and, for the
 * shader patterns, their uniforms over time and the Mandelbrot zoom limit in emulated float32.
 *
 * Not imported by the app. Run it through the runner, which also compiles every .glsl file
 * with glslangValidator (Arkanoid's one-line rolldown command cannot load `?raw` imports):
 *
 *   node scripts/verify-screenripper.mjs
 */

import { CYCLE_SECONDS, Director, FADE_SECONDS, MAX_DT, REDUCED_MOTION_SCALE } from './director'
import { CLEAR_SECONDS, FIELD_SECONDS, flowField, SPEED as FLOW_SPEED } from './effects/flowfield'
import { EDGES as T_EDGES, FACES, hypercube, VERTICES as T_VERTICES } from './effects/hypercube'
import { juliaC, ORBIT_SECONDS } from './effects/julia'
import { CENTER, DIVE_SECONDS, diveAt, iterationsAt, START_SCALE, ZOOM_MAX } from './effects/mandelbrot'
import { mystify } from './effects/mystify'
import { CAMERA, DUAL, morphAt, polyhedra, RADIUS, SHAPE_SECONDS, SOLIDS } from './effects/polyhedra'
import { CHUNKS, PENS, spirograph } from './effects/spirograph'
import { STARS, starfield } from './effects/starfield'
import { bounds, DEPTH, fitTree, fractalTree, growTree, layout, TREE_SECONDS, wind } from './effects/tree'
import { formatShaderLog, glBackingSize, PIXEL_BUDGET } from './gl'
import { noise2d, rng, rotate, rotate4 } from './math'
import { EFFECTS, keyLabel, keyToIndex } from './registry'
import type { Effect2D } from './types'
import { type LockSentinel, WakeLockKeeper } from './wakelock'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `   ${detail}` : ''}`)
}

console.log('\nKEY MAP')
check('ten patterns', EFFECTS.length === 10, `${EFFECTS.length}`)
check('names unique', new Set(EFFECTS.map((e) => e.name)).size === EFFECTS.length)
const keys = '1234567890'
check('keys 1–9, 0 map to indices 0–9',
  [...keys].every((k, i) => keyToIndex(k) === i))
check('keyLabel inverts keyToIndex', EFFECTS.every((_, i) => keyToIndex(keyLabel(i)) === i))
check('non-number keys are ignored',
  ['a', 'F', ' ', '10', '', 'Enter', 'Digit1', '¹'].every((k) => keyToIndex(k) === null))
check('each entry creates an effect of the kind it declares',
  EFFECTS.every((e) => e.create().kind === e.kind))

const COLOUR = /^(#000|(hsla|rgba)\((?:-?[\d.]+(?:%| |\/)*\s*)+\))$/

/**
 * A stand-in 2D context that records what an effect draws, so its real frame code runs here
 * without a browser. Counts path points per frame and flags any that are NaN or outside the
 * stage, and any colour string that is malformed. A plain object rather than a Proxy, so a
 * ten-minute run stays quick.
 */
class Recorder {
  w: number
  h: number
  margin: number
  points = 0
  strokes = 0
  bad = 0
  off = 0
  badColours = 0
  /** Full-stage opaque black fills: a frame that starts from nothing */
  clears = 0
  /** Furthest any point has been from the centre, along x or y, as a fraction of the short side */
  reach = 0
  /** moveTo positions this frame, x then y, when `trackMoves` is set */
  moves: number[] = []
  trackMoves = false
  lineWidth = 1
  lineCap = 'butt'
  lineJoin = 'miter'
  globalCompositeOperation = 'source-over'
  font = ''
  textAlign = 'start'
  textBaseline = 'alphabetic'
  private style = '#000'

  constructor(w: number, h: number, margin = 0) {
    this.w = w
    this.h = h
    this.margin = margin
  }
  get strokeStyle() { return this.style }
  set strokeStyle(v: string) { this.colour(v) }
  get fillStyle() { return this.style }
  set fillStyle(v: string) { this.colour(v) }
  private colour(v: string) {
    this.style = v
    if (!COLOUR.test(v) || v.includes('NaN')) this.badColours++
  }
  private see(x: number, y: number) {
    this.points++
    const m = this.margin
    if (!Number.isFinite(x) || !Number.isFinite(y)) this.bad++
    else if (x < -m || x > this.w + m || y < -m || y > this.h + m) this.off++
    else this.reach = Math.max(this.reach, Math.abs(x - this.w / 2) / Math.min(this.w, this.h), Math.abs(y - this.h / 2) / Math.min(this.w, this.h))
  }
  newFrame() {
    this.points = 0
    this.strokes = 0
    this.moves.length = 0
  }
  moveTo(x: number, y: number) {
    this.see(x, y)
    if (this.trackMoves) this.moves.push(x, y)
  }
  lineTo(x: number, y: number) { this.see(x, y) }
  arc(x: number, y: number) { this.see(x, y) }
  stroke() { this.strokes++ }
  fill() {}
  beginPath() {}
  closePath() {}
  fillRect(x: number, y: number, w: number, h: number) {
    if (x <= 0 && y <= 0 && w >= this.w && h >= this.h && this.style === '#000'
      && this.globalCompositeOperation === 'source-over') this.clears++
  }
  strokeRect() {}
  fillText() {}
  save() {}
  restore() {}
  translate() {}
  rotate() {}
  setTransform() {}
}

/**
 * Drive a 2D effect the way Stage does: init, then frame(t, dt) with dt = 0 on the first frame.
 * Returns the recorder plus the most path points drawn in any one frame (a cost proxy).
 */
function run2d(effect: Effect2D, w: number, h: number, seconds: number, hz: number, margin = 0,
  onFrame?: (rec: Recorder, t: number) => void) {
  const rec = new Recorder(w, h, margin)
  effect.init(rec as unknown as CanvasRenderingContext2D, w, h)
  let maxPoints = 0
  const frames = Math.round(seconds * hz)
  for (let f = 0; f <= frames; f++) {
    rec.newFrame()
    effect.frame(f / hz, f === 0 ? 0 : 1 / hz)
    maxPoints = Math.max(maxPoints, rec.points)
    onFrame?.(rec, f / hz)
  }
  return { rec, maxPoints }
}

/** Run `seconds` of frames at `hz`; returns each swap as [time it happened, index] */
function run(d: Director, seconds: number, hz = 60, start = 0) {
  const swaps: [number, number][] = []
  const frames = Math.round(seconds * hz)
  for (let f = 1; f <= frames; f++) {
    const swap = d.tick(1 / hz)
    if (swap !== null) swaps.push([start + f / hz, swap])
  }
  return swaps
}

/** A director that has shown its first pattern */
function started() {
  const d = new Director(EFFECTS.length)
  d.tick(1 / 60)
  return d
}

console.log('\nSTART AND FADES')
{
  const d = new Director(EFFECTS.length)
  check('first frame shows pattern 1', d.tick(1 / 60) === 0 && d.current === 0)
}
{
  const d = started()
  d.select(4)
  const swaps = run(d, 1)
  check('select swaps after one fade', swaps.length === 1 && swaps[0][1] === 4
    && Math.abs(swaps[0][0] - FADE_SECONDS) <= 1 / 60 + 1e-9, `at ${swaps[0]?.[0].toFixed(3)} s`)
}
{
  const d = started()
  d.select(4)
  run(d, 0.1)
  d.select(7)
  const swaps = run(d, 1)
  check('re-selecting mid-fade: latest wins, one swap, fade not restarted',
    swaps.length === 1 && swaps[0][1] === 7 && swaps[0][0] <= FADE_SECONDS - 0.1 + 1 / 60 + 1e-9)
}
{
  const d = started()
  d.select(0)
  check('selecting the pattern already showing does nothing', run(d, 1).length === 0 && !d.fading)
}

console.log('\nAUTO-CYCLE')
for (const hz of [30, 60, 144, 240]) {
  const d = started()
  const swaps = run(d, CYCLE_SECONDS + 1, hz)
  const at = swaps[0]?.[0] ?? NaN
  const expected = CYCLE_SECONDS + FADE_SECONDS
  check(`${String(hz).padStart(3)} Hz: moves on once, to pattern 2, at ${expected} s`,
    swaps.length === 1 && swaps[0][1] === 1 && Math.abs(at - expected) <= 1 / hz + 1e-6,
    `at ${at.toFixed(3)} s`)
}
{
  const d = started()
  run(d, 59)
  d.input()
  const early = run(d, 59)
  const later = run(d, 2)
  check('keypress at 59 s restarts the count', early.length === 0 && later.length === 1)
}
{
  const d = started()
  d.togglePause()
  const t0 = d.effectTime
  const swaps = run(d, 600)
  check('paused for 10 min: no change, effect time frozen', swaps.length === 0 && d.effectTime === t0)
  d.togglePause()
  check('after resume, the cycle continues from where it was', run(d, CYCLE_SECONDS + 1).length === 1)
}
{
  const d = started()
  d.select(5)
  d.togglePause()
  check('pausing mid-fade still completes the swap', run(d, 1).length === 1 && d.current === 5)
}
{
  const d = started()
  run(d, 30)
  d.tick(3600) // the first frame back after an hour in a background tab
  check('a long hidden-tab frame counts as MAX_DT only', Math.abs(d.idle - (30 + MAX_DT)) < 1e-6,
    `idle ${d.idle.toFixed(3)} s`)
}
{
  const d = started()
  d.select(9)
  run(d, 1)
  const swaps = run(d, CYCLE_SECONDS + 1)
  check('wraps from 0 back to 1', swaps.length === 1 && swaps[0][1] === 0)
}
{
  const d = started()
  const order = run(d, 10 * (CYCLE_SECONDS + FADE_SECONDS) + 1).map(([, i]) => i)
  check('ten minutes unattended visits every pattern in key order',
    order.join() === [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].join(), order.join())
}

{
  const d = started()
  d.timeScale = REDUCED_MOTION_SCALE
  const swaps = run(d, CYCLE_SECONDS + 1)
  check('reduced motion slows the pattern, not the auto-cycle',
    swaps.length === 1 && Math.abs(swaps[0][0] - (CYCLE_SECONDS + FADE_SECONDS)) <= 1 / 60 + 1e-6
      && Math.abs(d.effectTime - (1 - FADE_SECONDS) * REDUCED_MOTION_SCALE) < 0.05,
    `cycled at ${swaps[0]?.[0].toFixed(2)} s`)
}

console.log('\nWAKE LOCK')
{
  /** A lock whose request the test resolves, rejects or has the "browser" release, by hand */
  class FakeLock implements LockSentinel {
    released = false
    private listeners: (() => void)[] = []
    release() {
      this.released = true
      return Promise.resolve()
    }
    addEventListener(_: 'release', fn: () => void) {
      this.listeners.push(fn)
    }
    /** What the browser does when the tab is hidden */
    drop() {
      this.released = true
      this.listeners.forEach((fn) => fn())
    }
  }
  const harness = () => {
    const calls: { lock: FakeLock; grant: () => void; deny: () => void }[] = []
    const keeper = new WakeLockKeeper(() => new Promise<LockSentinel>((resolve, reject) => {
      const lock = new FakeLock()
      calls.push({ lock, grant: () => resolve(lock), deny: () => reject(new Error('denied')) })
    }))
    return { keeper, calls }
  }
  // Let promise callbacks run
  const settle = () => new Promise((r) => setTimeout(r, 0))

  {
    const { keeper, calls } = harness()
    keeper.set(true)
    calls[0].grant()
    await settle()
    const heldThen = keeper.held
    keeper.set(false)
    check('held while wanted, released when not', heldThen && !keeper.held && calls[0].lock.released)
  }
  {
    const { keeper, calls } = harness()
    keeper.set(true)
    keeper.set(false)
    calls[0].grant()
    await settle()
    check('leaving fullscreen before the lock arrives releases it on arrival',
      !keeper.held && calls[0].lock.released)
  }
  {
    const { keeper, calls } = harness()
    keeper.set(true)
    keeper.set(true)
    keeper.set(true)
    check('repeated requests while one is pending make only one call', calls.length === 1)
  }
  {
    const { keeper, calls } = harness()
    keeper.set(true)
    keeper.set(false)
    keeper.set(true)
    calls[0].grant()
    await settle()
    check('off then on again before arrival: one call, and the lock is kept',
      calls.length === 1 && keeper.held && !calls[0].lock.released)
  }
  {
    const { keeper, calls } = harness()
    keeper.set(true)
    calls[0].grant()
    await settle()
    calls[0].lock.drop()
    const heldAfterDrop = keeper.held
    keeper.set(true)
    calls[1]?.grant()
    await settle()
    check('browser drops it on a hidden tab; visible again asks afresh',
      !heldAfterDrop && calls.length === 2 && keeper.held)
  }
  {
    const { keeper, calls } = harness()
    keeper.set(true)
    calls[0].deny()
    await settle()
    const afterDeny = calls.length
    keeper.set(true)
    check('a refusal is not retried in a loop, only on the next set(true)',
      !keeper.held && afterDeny === 1 && calls.length === 2)
  }
  check('no wake lock API (older browser): does nothing, never throws', (() => {
    const keeper = new WakeLockKeeper(null)
    keeper.set(true)
    keeper.set(false)
    return !keeper.held
  })())
}

console.log('\nGL PIXEL BUDGET')
// Sizes are CSS pixels and devicePixelRatio, as the browser reports them
const screens: [string, number, number, number][] = [
  ['small window', 800, 600, 1],
  ['1080p monitor', 1920, 1080, 1],
  ['windowed stage, retina', 1152, 660, 2],
  ['ultrawide 3440×1440', 3440, 1440, 1],
  ['4K at 100%', 3840, 2160, 1],
  ['4K at 150%', 2560, 1440, 1.5],
  ['4K at 200%', 1920, 1080, 2],
  ['5K iMac', 2560, 1440, 2],
]
for (const [label, w, h, dpr] of screens) {
  const b = glBackingSize(w, h, dpr)
  const full = w * dpr * h * dpr
  const px = b.w * b.h
  const underBudget = full <= PIXEL_BUDGET
  // Under budget: exactly full resolution. Over: at most the budget, and within 1% of it
  const sizeOk = underBudget ? b.w === w * dpr && b.h === h * dpr : px <= PIXEL_BUDGET && px >= PIXEL_BUDGET * 0.99
  const aspectOk = Math.abs(b.w / b.h - w / h) < 2 / b.h
  check(`${label.padEnd(24)} -> ${b.w}×${b.h}`, sizeOk && aspectOk,
    `${(px / 1e6).toFixed(2)}M px, ${(Math.sqrt(px / full) * 100).toFixed(0)}% scale`)
}

console.log('\nSHADER ERROR LOG')
{
  const source = '#version 300 es\nprecision highp float;\nout vec4 c;\nvoid main() { c = vec4(foo); }'
  const log = "ERROR: 0:4: 'foo' : undeclared identifier\nERROR: 0:99: '' : compilation terminated\n"
  const out = formatShaderLog(log, source).split('\n')
  check('quotes the offending source line', out[1] === '    4 | void main() { c = vec4(foo); }', out[1])
  check('leaves out-of-range line numbers unquoted', out[2] === "ERROR: 0:99: '' : compilation terminated" && out.length === 3)
  check('passes through lines without a location', formatShaderLog('link failed', source) === 'link failed')
}

console.log('\nPOLYHEDRA')
// Known counts for the five Platonic solids: vertices, edges, faces, edges meeting at a vertex
const KNOWN: Record<string, [number, number, number, number]> = {
  tetrahedron: [4, 6, 4, 3],
  cube: [8, 12, 6, 3],
  octahedron: [6, 12, 8, 4],
  dodecahedron: [20, 30, 12, 3],
  icosahedron: [12, 30, 20, 5],
}
for (const s of SOLIDS) {
  const [V, E, F, deg] = KNOWN[s.name]
  const degrees = s.vertices.map((_, v) => s.edges.filter(([a, b]) => a === v || b === v).length)
  const lengths = s.edges.map(([a, b]) => Math.hypot(...s.vertices[a].map((c, i) => c - s.vertices[b][i])))
  const radii = s.vertices.map((v) => Math.hypot(...v))
  check(`${s.name.padEnd(13)} V ${V}, E ${E}, F ${F}: V − E + F = 2`,
    s.vertices.length === V && s.edges.length === E && V - s.edges.length + F === 2,
    `found V ${s.vertices.length}, E ${s.edges.length}`)
  check(`${s.name.padEnd(13)} ${deg} edges at every vertex, all edges equal, unit circumradius`,
    degrees.every((d) => d === deg)
      && Math.max(...lengths) - Math.min(...lengths) < 1e-9
      && radii.every((r) => Math.abs(r - 1) < 1e-9))
}
check('each dual has V and F swapped and the same E', SOLIDS.every((s, i) => {
  const [V, E, F] = KNOWN[s.name]
  const [dV, dE, dF] = KNOWN[SOLIDS[DUAL[i]].name]
  return dV === F && dF === V && dE === E
}))
{
  // The real effect for a full minute at 60 Hz. At t = 0: tetrahedron outside, its dual (another
  // tetrahedron) inside, 6 edges each, 2 strokes per edge
  let strokesAt0 = -1
  run2d(polyhedra(), 1280, 720, 60, 60, 0, (r) => {
    if (strokesAt0 < 0) strokesAt0 = r.strokes
  })
  check('frame at t=0 strokes both tetrahedra', strokesAt0 === (6 + 6) * 2, `${strokesAt0} strokes`)
  let frames = 0
  const { rec } = run2d(polyhedra(), 1280, 720, 10, 144, 0, () => frames++)
  check('clears to black every frame, so no trail pulsing or refresh-rate dependence',
    rec.clears === frames, `${rec.clears} clears in ${frames} frames at 144 Hz`)
}
check('five solids fill exactly one auto-cycle slot', SOLIDS.length * SHAPE_SECONDS === CYCLE_SECONDS)
{
  // Whichever solid is fully drawn just before a hand-over must be the one fully drawn after it
  let ok = true
  for (let k = 1; k <= 10; k++) {
    const before = morphAt(k * SHAPE_SECONDS - 1e-6)
    const after = morphAt(k * SHAPE_SECONDS + 1e-6)
    ok &&= before.blend > 0.999 && after.blend === 0 && before.next === after.index
  }
  check('hand-overs are seamless: shrink and grow meet at the boundary', ok)
}
{
  const out = new Float32Array(3)
  let maxLenErr = 0
  let maxExtent = 0
  for (let t = 0; t < 600; t += 0.05) {
    for (const s of SOLIDS) for (const [x, y, z] of s.vertices) {
      rotate(x, y, z, t * 0.31, t * 0.47, t * 0.13, out, 0)
      maxLenErr = Math.max(maxLenErr, Math.abs(Math.hypot(out[0], out[1], out[2]) - 1))
      const p = CAMERA / (CAMERA - out[2])
      maxExtent = Math.max(maxExtent, Math.abs(out[0] * p) * RADIUS, Math.abs(out[1] * p) * RADIUS)
    }
  }
  check('rotation preserves length', maxLenErr < 1e-6, `max error ${maxLenErr.toExponential(1)}`)
  check('tumbling solid stays on screen over 10 min', maxExtent < 0.48,
    `furthest vertex ${(maxExtent * 100).toFixed(1)}% of the short side from centre (edge is 50%)`)
}

console.log('\nHYPERCUBE')
{
  const degree = T_VERTICES.map((_, v) => T_EDGES.filter(([a, b]) => a === v || b === v).length)
  // 8 cubic cells: fix one axis at ±1. For a 4-polytope, V − E + F − C = 0
  check('tesseract: V 16, E 32, F 24, C 8, and V − E + F − C = 0',
    T_VERTICES.length === 16 && T_EDGES.length === 32 && FACES.length === 24
      && T_VERTICES.length - T_EDGES.length + FACES.length - 8 === 0)
  check('4 edges at every corner, every edge length 2', degree.every((d) => d === 4)
    && T_EDGES.every(([a, b]) => Math.hypot(...T_VERTICES[a].map((c, i) => c - T_VERTICES[b][i])) === 2))
  const isEdge = (a: number, b: number) => T_EDGES.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
  check('each face is a square of 4 real edges', FACES.every((f) => f.every((c, n) => isEdge(c, f[(n + 1) % 4]))))
  check('every edge borders exactly 3 faces', T_EDGES.every(([a, b]) => FACES.filter((f) => f.includes(a) && f.includes(b)).length === 3))
  {
    const v = new Float64Array([0.3, -0.7, 0.2, 0.9])
    const len = Math.hypot(...v)
    const planes = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]
    for (let k = 0; k < 1000; k++) {
      const [i, j] = planes[k % 6]
      rotate4(v, 0, i, j, Math.cos(k), Math.sin(k))
    }
    check('4D rotation preserves length', Math.abs(Math.hypot(...v) - len) < 1e-9)
  }
  {
    // Additive glass over faded trails got brighter with refresh rate and shimmered above 60 Hz
    // (see hypercube.ts). Clearing to black every frame rules both out
    let frames = 0
    const { rec } = run2d(hypercube(1), 1280, 720, 10, 144, 0, () => frames++)
    check('clears to black every frame, so no trail build-up or refresh-rate dependence',
      rec.clears === frames, `${rec.clears} clears in ${frames} frames at 144 Hz`)
  }
}

console.log('\nRANDOM AND NOISE')
{
  const a = rng(42), b = rng(42)
  const seqA = Array.from({ length: 1000 }, a)
  const seqB = Array.from({ length: 1000 }, b)
  check('same seed, same sequence', seqA.every((v, i) => v === seqB[i]))
  const r = rng(7)
  let sum = 0, lo = 1, hi = 0
  for (let i = 0; i < 100000; i++) {
    const v = r()
    sum += v
    lo = Math.min(lo, v)
    hi = Math.max(hi, v)
  }
  check('rng uniform on [0, 1)', lo >= 0 && hi < 1 && Math.abs(sum / 100000 - 0.5) < 0.005,
    `mean ${(sum / 100000).toFixed(4)}`)

  const n = noise2d(3)
  const r2 = rng(9)
  let peak = 0, jump = 0
  for (let i = 0; i < 100000; i++) {
    const x = r2() * 300, y = r2() * 300
    const v = n(x, y)
    peak = Math.max(peak, Math.abs(v))
    jump = Math.max(jump, Math.abs(n(x + 1e-3, y) - v), Math.abs(n(x, y + 1e-3) - v))
  }
  check('noise stays within [-1, 1]', peak <= 1, `peak |n| ${peak.toFixed(3)}`)
  check('noise is continuous (no jumps across cell edges)', jump < 0.005, `max change per 0.001 step ${jump.toFixed(5)}`)
  check('different seeds give different fields', noise2d(3)(10.5, 20.5) !== noise2d(4)(10.5, 20.5))
}

console.log('\nFLOW FIELD FADE-OUT')
{
  /** Opacity and stroke count every frame through the end of the first painting */
  const trace = (hz: number) => {
    const rows: { t: number; opacity: number; strokes: number }[] = []
    const e = flowField(1)
    run2d(e, 1280, 720, FIELD_SECONDS + 1, hz, 2, (r, t) => rows.push({ t, opacity: e.opacity ?? 1, strokes: r.strokes }))
    return rows
  }
  const start = FIELD_SECONDS - CLEAR_SECONDS
  const rates = [30, 60, 144, 240]
  const traces = rates.map(trace)
  check('full opacity while painting, falls steadily to 0, back to 1 for the next field', traces.every((rows) => {
    const before = rows.filter((r) => r.t <= start)
    const during = rows.filter((r) => r.t > start && r.t < FIELD_SECONDS)
    const after = rows.filter((r) => r.t >= FIELD_SECONDS)
    const falling = during.every((r, i) => i === 0 || r.opacity <= during[i - 1].opacity)
    return before.every((r) => r.opacity === 1) && falling && during[during.length - 1].opacity < 0.02
      && after.every((r) => r.opacity === 1)
  }))
  check('stops painting while it fades', traces.every((rows) => rows.filter((r) => r.t > start && r.t < FIELD_SECONDS).every((r) => r.strokes === 0)))
  const half = traces.map((rows) => rows.find((r) => r.t > start && r.opacity <= 0.5)?.t ?? NaN)
  check('same pace at every refresh rate', Math.max(...half) - Math.min(...half) <= 1 / 30 + 1e-9,
    `half opacity at ${half.map((t) => t.toFixed(3)).join('/')} s`)
}

console.log('\n2D PATTERNS: real frame code, one minute at 60 Hz, 1280×720')
/** How far past the edge a pattern may legitimately draw, for a w × h stage at hz */
type Margin = (w: number, h: number, hz: number) => number
const none: Margin = () => 0
const patterns: [string, () => Effect2D, Margin][] = [
  ['Polyhedra', () => polyhedra(), none],
  ['Hypercube', () => hypercube(1), none],
  ['Starfield', () => starfield(1), none],
  ['Mystify', () => mystify(1), none],
  ['Spirograph', () => spirograph(1), none],
  ['Fractal Tree', () => fractalTree(1), none],
  // A particle may take one step past the edge before it respawns; the canvas clips it
  ['Flow Field', () => flowField(1), (w, h, hz) => (FLOW_SPEED * Math.min(w, h)) / hz + 1e-6],
]
for (const [name, make, margin] of patterns) {
  const { rec, maxPoints } = run2d(make(), 1280, 720, 60, 60, margin(1280, 720, 60))
  check(`${name.padEnd(12)} no NaN, nothing off screen, colours valid`,
    rec.bad === 0 && rec.off === 0 && rec.badColours === 0,
    `${rec.bad} NaN, ${rec.off} off, ${rec.badColours} bad colours; up to ${maxPoints} path points/frame`)
  if (name === 'Hypercube') {
    check('Hypercube: big enough to read, and stays clear of the edges', rec.reach > 0.3 && rec.reach < 0.48,
      `reaches ${(rec.reach * 100).toFixed(1)}% of the short side from centre (edge is 50%)`)
  }
}
for (const [w, h, label] of [[720, 1280, 'portrait'], [2560, 1080, 'ultrawide'], [320, 200, 'tiny']] as const) {
  const offs = patterns.map(([name, make, margin]) => [name, run2d(make(), w, h, 30, 30, margin(w, h, 30)).rec] as const)
    .filter(([, r]) => r.bad || r.off)
  check(`all seven stay on screen at ${label} ${w}×${h}`, offs.length === 0, offs.map(([n]) => n).join(', '))
}

{
  let minVisible = Infinity
  run2d(starfield(1), 1280, 720, 60, 60, 0, (r, t) => {
    // Every visible streak starts with one moveTo
    r.trackMoves = true
    if (t >= 1) minVisible = Math.min(minVisible, r.moves.length / 2)
  })
  check('Starfield: field stays full', minVisible >= STARS * 0.5,
    `at least ${minVisible} of ${STARS} stars on screen in every frame`)
}

{
  // The tail end of each pen must not whirl faster as time goes on (see spirograph.ts)
  const tailSpeed = (startAt: number) => {
    const e = spirograph(1)
    const rec = new Recorder(1280, 720)
    e.init(rec as unknown as CanvasRenderingContext2D, 1280, 720)
    let t = 0
    for (; t < startAt; t += 0.1) e.frame(t, t === 0 ? 0 : 0.1)
    rec.trackMoves = true
    let prev: number[] = []
    let max = 0
    for (let f = 0; f < 60 * 60; f++, t += 1 / 60) {
      rec.newFrame()
      e.frame(t, 1 / 60)
      const tails = Array.from({ length: PENS }, (_, p) => [rec.moves[p * CHUNKS * 2], rec.moves[p * CHUNKS * 2 + 1]]).flat()
      if (prev.length) {
        for (let p = 0; p < PENS; p++) {
          max = Math.max(max, Math.hypot(tails[p * 2] - prev[p * 2], tails[p * 2 + 1] - prev[p * 2 + 1]) * 60)
        }
      }
      prev = tails
    }
    return max
  }
  const early = tailSpeed(0)
  const late = tailSpeed(540)
  check('Spirograph: tail does not whirl faster over time', late < early * 2,
    `tail end max ${early.toFixed(0)} px/s in minute 1, ${late.toFixed(0)} px/s in minute 10`)
}

{
  // Every tree, fully grown and at the extremes of the wind, inside the stage
  const W = 1280, H = 720
  const seg = new Float32Array((2 ** (DEPTH + 1) - 1) * 4)
  const still = new Float32Array(DEPTH + 1)
  const bend = new Float32Array(DEPTH + 1)
  let outside = 0
  let tightest = Infinity
  for (let seed = 0; seed < 300; seed++) {
    const shape = growTree(seed)
    layout(shape, still, 0, seg)
    const { scale, ox, oy } = fitTree(bounds(seg), W, H)
    for (let t = 0; t < TREE_SECONDS; t += 0.5) {
      wind(t, bend)
      for (const flutter of [-0.04, 0.04]) {
        layout(shape, bend, flutter, seg)
        for (let i = 0; i < seg.length; i += 2) {
          const x = ox + seg[i] * scale
          const y = oy - seg[i + 1] * scale
          if (x < 0 || x > W || y < 0 || y > H) outside++
          tightest = Math.min(tightest, x, W - x, y, H - y)
        }
      }
    }
  }
  check('Fractal Tree: 300 trees in full wind all stay on screen', outside === 0,
    `${outside} points outside; closest approach to an edge ${tightest.toFixed(1)} px`)
}
check('three trees and three paintings each fill one auto-cycle slot',
  TREE_SECONDS * 3 === CYCLE_SECONDS && FIELD_SECONDS * 3 === CYCLE_SECONDS)

console.log('\nSHADER PATTERNS')
{
  /**
   * One Mandelbrot pixel exactly as mandelbrot.frag.glsl computes it, with `r` applied after
   * every operation: Math.fround for the GPU's float32, identity for the float64 reference.
   * Returns the smooth escape count, or -1 inside. (The shader's slow rotation is left out; it
   * moves which pixels are sampled, not how precise they are.)
   */
  const pixel = (fx: number, fy: number, w: number, h: number, scale: number, iters: number, r: (v: number) => number) => {
    const px = r(r(fx + 0.5 - r(0.5 * w)) / h)
    const py = r(r(fy + 0.5 - r(0.5 * h)) / h)
    const cx = r(r(CENTER[0]) + r(px * r(scale)))
    const cy = r(r(CENTER[1]) + r(py * r(scale)))
    const qx = r(cx - 0.25)
    const q = r(r(qx * qx) + r(cy * cy))
    const cy2 = r(cy * cy)
    if (r(q * r(q + qx)) <= r(0.25 * cy2) || r(r(r(cx + 1) * r(cx + 1)) + cy2) <= 0.0625) return -1
    let x = 0, y = 0
    for (let i = 0; i < iters; i++) {
      const xx = r(x * x), yy = r(y * y)
      if (r(xx + yy) > 256) return i + 1 - Math.log2(Math.log2(xx + yy) * 0.5)
      const ny = r(r(r(2 * x) * y) + cy)
      x = r(r(xx - yy) + cx)
      y = ny
    }
    return -1
  }
  /** Over 6 full rows of a 1920×1080 frame: share of pixels whose colour would differ, and share of distinct c values */
  const precisionAt = (zoom: number) => {
    const w = 1920, h = 1080, scale = START_SCALE / zoom, iters = iterationsAt(zoom)
    let wrong = 0, total = 0, distinct = 0
    for (let row = 0; row < 6; row++) {
      const fy = Math.round(((row + 0.5) * h) / 6)
      const seen = new Set<number>()
      for (let fx = 0; fx < w; fx++) {
        const a = pixel(fx, fy, w, h, scale, iters, Math.fround)
        const b = pixel(fx, fy, w, h, scale, iters, (v) => v)
        seen.add(Math.fround(Math.fround(CENTER[0]) + Math.fround(Math.fround(Math.fround(fx + 0.5 - 960) / h) * Math.fround(scale))))
        total++
        // A smooth count more than 2 apart is a visibly different colour band
        if ((a < 0) !== (b < 0) || (a >= 0 && Math.abs(a - b) > 2)) wrong++
      }
      distinct += seen.size
    }
    return { wrong: wrong / total, distinct: distinct / total }
  }
  const atMax = precisionAt(ZOOM_MAX)
  const beyond = precisionAt(ZOOM_MAX * 10)
  check(`Mandelbrot at ZOOM_MAX ${ZOOM_MAX}×: float32 matches float64 on 95%+ of pixels, no blocks`,
    atMax.wrong <= 0.05 && atMax.distinct === 1,
    `${(atMax.wrong * 100).toFixed(1)}% differ, ${(atMax.distinct * 100).toFixed(1)}% distinct`)
  check('… and the check can tell: 10× deeper fails it', beyond.wrong > 0.05,
    `${(beyond.wrong * 100).toFixed(1)}% differ at ${ZOOM_MAX * 10}×`)

  const start = diveAt(0), mid = diveAt(DIVE_SECONDS / 2), end = diveAt(DIVE_SECONDS - 1e-6)
  check('dive starts at 1×, ends at ZOOM_MAX, fades in and out',
    Math.abs(start.zoom - 1) < 1e-9 && Math.abs(end.zoom - ZOOM_MAX) / ZOOM_MAX < 1e-3
      && start.fade === 0 && end.fade < 1e-3 && mid.fade === 1,
    `${start.zoom.toFixed(2)}× → ${end.zoom.toFixed(0)}×`)
  check('one dive fills one auto-cycle slot, and restarts on black', DIVE_SECONDS === CYCLE_SECONDS
    && diveAt(DIVE_SECONDS).fade === 0 && Math.abs(diveAt(DIVE_SECONDS).zoom - 1) < 1e-9)
  check('iteration count stays under the shader\'s MAX_ITER (512)', iterationsAt(ZOOM_MAX) <= 512,
    `${iterationsAt(1)} → ${iterationsAt(ZOOM_MAX)}`)

  // Julia: c should spend real time both inside the Mandelbrot set (connected Julia set) and
  // outside it (dust), or the morph would only ever show one kind
  const inMandelbrot = (cx: number, cy: number) => {
    let x = 0, y = 0
    for (let i = 0; i < 1000; i++) {
      const nx = x * x - y * y + cx
      y = 2 * x * y + cy
      x = nx
      if (x * x + y * y > 4) return false
    }
    return true
  }
  let inside = 0, samples = 0, maxAbs = 0
  for (let t = 0; t < ORBIT_SECONDS * 3; t += 0.25) {
    const [cx, cy] = juliaC(t, 0)
    if (inMandelbrot(cx, cy)) inside++
    samples++
    maxAbs = Math.max(maxAbs, Math.hypot(cx, cy))
  }
  check('Julia: c crosses the Mandelbrot edge, connected and dust both get screen time',
    inside / samples > 0.2 && inside / samples < 0.8, `inside ${((inside / samples) * 100).toFixed(0)}% of the time`)
  check('Julia: c stays near the set (|c| ≤ 0.8)', maxAbs <= 0.8, `max |c| ${maxAbs.toFixed(3)}`)
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`)
