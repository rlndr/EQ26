# Time Dilation Explorer — Feature Plan

An interactive special relativity lab: dial a spacecraft's velocity from rest up to `0.99999c`,
watch a stationary Earth clock and a moving ship clock drift apart in real time, see *why* time
slows down through a split-frame photon light clock, and run mission calculations across cosmic
distances.

**Route:** `/projects/time-dilation`

---

## 0. Fit with the current stack and site architecture

**No new dependencies, no backend, no Lambda, no Amplify changes.** Like Arkanoid and the Speaker
Box Designer, everything runs client-side in React 19 + TypeScript + Tailwind CSS using native
Canvas 2D and inline SVG. The page works offline and adds zero third-party bundle weight.

### The two rules we carry over from existing projects

1. **Pure physics and maths in `src/lib/relativity/` with a `verify.ts` harness** (from
   `src/lib/enclosure/`). Every formula, unit conversion, slider curve and mission calculation is a
   pure function asserted against worked examples before any UI touches it.
2. **60 fps animation stays out of React state** (from `src/lib/arkanoid/`). React renders the
   controls, presets, telemetry cards and mission calculator when the user moves a slider or clicks
   a button. The continuous clock hands, digital stopwatch readouts, starfield streaks and bouncing
   photon are stepped from a single `requestAnimationFrame` loop writing directly to DOM/SVG refs
   and Canvas 2D contexts — never calling `setState` at 60 Hz.

### Theme and visual consistency (`land3r.net`)

The standalone prototype (`Timedilation/index.html`) used custom CSS variables, glassmorphism cards
(`backdrop-filter`), neon pink/purple text-shadow glows, and raw `$LaTeX$` strings that rendered as
literal dollar signs without KaTeX. For `land3r.net` we strip all custom CSS and adopt the site's
established palette and component grammar:

| Element | Site convention |
|---|---|
| Page shell | `max-w-6xl mx-auto px-4 py-12`, `<h1 className="text-3xl font-bold text-brass mb-2">` |
| Section cards | `bg-zinc-900 border border-zinc-800 rounded-lg p-4` with `text-xs uppercase tracking-[0.15em] text-zinc-500` headers |
| Active buttons / toggles | `border-brass bg-brass/10 text-brass` (inactive: `border-zinc-700 text-zinc-400 hover:text-brass`) |
| Inputs & selects | `rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-sm text-zinc-100 focus:border-brass` |
| Stationary Observer (Earth) | Sky (`#38bdf8` / `text-sky-400`) — matches Earth in the Planetary Orrery |
| High-Speed Traveler (Ship) | Rose (`#f472b6` / `text-rose-400`) — matches the site's `rose-500` accent |
| Lorentz factor `γ` & Photon | Brass (`#d8b553` / `text-brass`) — ties the physics highlights to the site header |
| Math notation | Clean HTML/Unicode (`γ`, `β = v/c`, `Δt`, `Δt'`, `L/L₀`, `√(1 − β²)`) — no unrendered TeX strings |

---

## 1. Core physics & telemetry

With velocity expressed as a fraction of the speed of light, `β = v / c` (`0 ≤ β < 1`), the
Lorentz factor is:

```
γ = 1 / √(1 − β²)
```

From `β` and `γ` the four live telemetry figures follow immediately:

- **Lorentz factor (`γ`)** — how many seconds pass on Earth for each second aboard the ship
  (`Δt = γ · Δt'`).
- **Traveler tick rate (`1 / γ`)** — the ship clock's rate relative to Earth (`50.00%` at `γ = 2`).
- **Velocity in physical units** — `v = β · c` with exact SI `c = 299,792.458 km/s`
  (`670,616,629 mph`).
- **Length contraction (`L / L₀ = 1 / γ`)** — the spacecraft's length along its direction of motion
  as measured by the stationary observer.

Verified benchmark presets (`verify.ts` asserts each to four significant figures):

| Preset | `β = v/c` | `γ` | Tick rate `1/γ` | Speed (`km/s`) |
|---|---|---|---|---|
| Rest | `0.00000` | `1.000×` | `100.00%` | `0 km/s` |
| Parker Solar Probe | `0.00064` | `1.0000002×` | `99.99998%` | `192 km/s` |
| `0.10c` | `0.10000` | `1.005×` | `99.50%` | `29,979 km/s` |
| `0.50c` | `0.50000` | `1.155×` | `86.60%` | `149,896 km/s` |
| `0.866c` (default) | `0.8660254` (`√3/2`) | `2.000×` | `50.00%` | `259,628 km/s` |
| `0.99c` | `0.99000` | `7.089×` | `14.11%` | `296,795 km/s` |
| `0.999c` | `0.99900` | `22.366×` | `4.47%` | `299,493 km/s` |
| `0.9999c` | `0.99990` | `70.712×` | `1.41%` | `299,762 km/s` |
| `0.99999c` (max zoom) | `0.99999` | `223.607×` | `0.45%` | `299,789 km/s` |

### Slider mapping and the Ultra-Relativistic Zoom

Because `γ` stays near `1` for the first 80% of a linear `0 → c` slider and then explodes in the
final 1%, a plain linear slider makes `0.99c → 0.99999c` nearly impossible to dial by hand. We keep
both modes from the prototype:

- **Standard linear mode (`t ∈ [0, 1]`):** `β = 0.9999 · t`
- **Ultra-relativistic log zoom (`t ∈ [0, 1]`):**
  ```
  β(t) = 1 − 0.1 × 10^(−4t)
  t(β) = −log10((1 − β) / 0.1) / 4
  ```
  This maps `t = 0, 0.25, 0.5, 0.75, 1.0` cleanly onto the "nines" (`0.90c`, `0.99c`, `0.999c`,
  `0.9999c`, `0.99999c`).

**Fix over the prototype:** `beta` is stored directly in React state as a floating-point number
rather than quantized through integer slider steps (`0..1000`). Clicking the `0.866c` preset holds
`β = √3/2` (`γ = 2.000` exact), and toggling Ultra-Relativistic mode on and off no longer drifts the
value by rounding through the slider attribute.

---

## 2. Live dual-frame clocks stage

Two side-by-side reference frames driven by a shared `requestAnimationFrame` loop:

- **Stationary Observer (Earth, `v = 0`):** advances by `dObs = dt · simMultiplier` each frame.
- **High-Speed Traveler (Spaceship, `v = βc`):** advances by `dTrv = dObs / γ` each frame.

Each frame card shows:
1. **SVG analog clock** — minute and second hands updated imperatively via SVG line attributes.
2. **Digital stopwatch (`HH:MM:SS.ss`)** — plus total elapsed seconds and cumulative time lag
   (`Δt − Δt'`) on the ship card.
3. **Biological / mechanical rhythm (60 BPM proper time)** — a heartbeat indicator pulsing once per
   proper second in each frame (`60.0 BPM` on Earth vs `60 / γ BPM` apparent rate for the ship).
4. **Starfield canvas behind the traveler card** — stars drift and stretch into streaks proportional
   to `β`, sized via `ResizeObserver` and scaled by `devicePixelRatio` (fixing the missing retina
   scaling and per-frame `getBoundingClientRect()` calls in the prototype).

Simulation toolbar controls: **Pause / Resume**, **Reset Elapsed Time**, and **Simulation Rate**
multipliers (`1×`, `10×`, `1 min/s`, `1 hr/s`).

---

## 3. Visual intuition: Photon Light Clock & Lorentz Curve

### 3a. The Photon Light Clock (`lightClockCanvas`)

A split-screen Canvas 2D animation showing *why* a constant speed of light forces moving clocks to
tick slower:

- **Left (Ship rest frame):** A photon bounces vertically between two mirrors separated by height
  `H`. One full up-and-down bounce is one clock tick.
- **Right (Observer frame):** As the ship moves horizontally at `βc`, the photon must travel a
  longer diagonal sawtooth path at the same invariant speed `c`. Its vertical velocity component is
  reduced to `c · √(1 − β²) = c / γ`, and the mirrors themselves are Lorentz-contracted to width
  `W / γ`.

**Bug fix over the prototype:**
In `Timedilation/index.html`, the observer photon's vertical phase and horizontal position were
computed by multiplying the already-modulo-wrapped `photonPhase % 2` by `1/γ` and `0.32 · β`. Every
two seconds when `photonPhase` wrapped from `2 → 0`, `obsPhase` and `currX` jumped discontinuously,
teleporting the photon mid-bounce. In addition, `Math.max(0.12, beta)` forced the ship to drift
horizontally even at `β = 0` (at rest).

The fix is to integrate three independent phase accumulators in the animation ref:
```
shipPhase = (shipPhase + dt * bounceRate) % 2
obsPhase  = (obsPhase  + dt * bounceRate / γ) % 2
obsX      = β === 0 ? center : (obsX + dt * horizSpeed * β) % trackWidth
```
Now changing `β` smoothly alters the diagonal slope without teleporting the photon, `β = 0` keeps
the right-hand clock genuinely stationary (matching the left-hand clock tick-for-tick), and the
sawtooth trail only clears when `obsX` wraps around the right edge of the canvas.

### 3b. Lorentz Dilation Curve (`lorentzCurveCanvas`)

Plots `γ(β)` against `β ∈ [0, 1)` with a highlighted crosshair and dot at the user's current `(β, γ)`:

- In standard mode, the vertical axis spans `1× → 10×` so the knee around `0.80c–0.99c` is easy to
  read.
- **Enhancement over the prototype:** When `γ > 10` (or when Ultra-Relativistic Zoom is enabled),
  the vertical axis dynamically expands (up to `250×` against a log-nine horizontal axis) instead of
  pinning the marker dot against the top border of the chart.

---

## 4. Cosmic Journey & Twin Paradox Calculator

Solves relativistic one-way voyages at the currently selected velocity `β` across three input modes
(measuring distance in light-years `ly` and time in years `yr`, where `c = 1 ly/yr`):

| Mode ("Specify journey by") | Given | Earth time `Δt` | Ship time `Δt'` | Distance `d` (`ly`) |
|---|---|---|---|---|
| **Ship time (`Δt'`)** | `Δt'` | `γ · Δt'` | `Δt'` | `β · γ · Δt'` |
| **Earth time (`Δt`)** | `Δt` | `Δt` | `Δt / γ` | `β · Δt` |
| **Destination distance (`d`)** | `d` (`ly`) | `d / β` | `d / (β · γ)` | `d` |

 Note on length contraction consistency: from the traveler's perspective, the distance to the star is
Lorentz-contracted to `d' = d / γ`, so crossing it at speed `βc` takes `Δt' = d' / β = d / (β · γ)`
— identical to the time-dilation derivation from Earth's frame.

**Worked examples asserted in `verify.ts`:**
- **5 years of ship time at `β = √3/2` (`γ = 2.000`):** Earth waits `10.00 yrs`, twin age difference
  is `+5.00 yrs`, distance covered is `8.66 ly`.
- **Alpha Centauri (`4.37 ly`) at `β = √3/2` (`γ = 2.000`):** Earth waits `5.05 yrs`, traveler
  experiences `2.52 yrs`, twin age difference `+2.52 yrs`.
- **Galactic Center (`26,000 ly`) at `0.9999c` (`γ = 70.712`):** Earth waits `26,003 yrs`, traveler
  experiences `367.7 yrs`.
- **Andromeda (`2,537,000 ly`) at `0.99999c` (`γ = 223.607`):** Earth waits `2.54M yrs`, traveler
  experiences `11,346 yrs`.
- **Guard at `β = 0` in Distance mode:** dividing `d / β` returns `Infinity`, formatted cleanly as
  `∞` rather than `NaN`.

Destination quick-select buttons:
- **Alpha Centauri** (`4.37 ly`)
- **Sirius** (`8.6 ly`)
- **TRAPPIST-1** (`39.5 ly`)
- **Galactic Center** (`26,000 ly`)
- **Andromeda Galaxy** (`2,537,000 ly`)

---

## 5. File layout

```
src/lib/relativity/
  physics.ts       C constants, lorentzGamma, betaFromGamma, sliderToBeta, betaToSlider, presets
  journey.ts       solveJourney (shipTime / earthTime / distance), duration & distance formatters
  verify.ts        numerical verification of all table values, round-trips, and edge guards
src/pages/
  TimeDilationPage.tsx   Page layout, controls, dual clocks, canvas visualizers, calculator
```

Plus route & index wiring:
- `src/App.tsx` — add `<Route path="time-dilation" element={<TimeDilationPage />} />` under `/projects`
- `src/pages/ProjectsPage.tsx` — add the **Time Dilation Explorer** card (`Clock` icon from `lucide-react`)
- `README.md` — document the route, features, and architecture notes

---

## 6. Build steps

1. ✓ **`src/lib/relativity/` + `verify.ts`** — implement the pure relativity and mission calculator
   functions and run `verify.ts` via Rolldown + Node to confirm every identity and worked example.
2. ✓ **Page scaffold & Velocity/Telemetry panel** — create `TimeDilationPage.tsx`, wire up `/projects/time-dilation`
   in `App.tsx` and `ProjectsPage.tsx`, build the slider, preset buttons, Ultra-Relativistic toggle,
   and 4 telemetry cards in the `land3r.net` zinc/brass/rose/sky theme.
3. ✓ **Dual-frame clocks stage** — add the Earth and Spaceship clock cards, SVG analog hands, digital
   timers, heartbeat pulse, simulation speed toolbar, and `ResizeObserver`-backed starfield canvas.
4. ✓ **Photon Light Clock & Lorentz Curve canvases** — implement the continuous phase-accumulated
   light clock animation and adaptive Lorentz curve plot.
5. ✓ **Cosmic Journey & Twin Paradox Calculator** — wire the three calculation modes, unit selector,
   destination presets, and result cards.
6. ✓ **Verification & build check** — run `verify.ts`, `npm run lint`, and `npm run build` to ensure
   zero TypeScript or ESLint issues, and update `README.md`.

**Built 2026-10-24.** `src/lib/relativity/verify.ts` passes all 30 checks across the §1 telemetry
table, inverse `β ↔ γ` and linear/logarithmic slider round-trips, and the §4 cosmic journey
calculations.

---

## 7. Honest limits

- **Special relativity only (constant velocity, flat spacetime).** A real twin-paradox turnaround or
  Earth launch involves acceleration (`general relativity / Rindler coordinates`), whereas this
  calculator models instantaneous cruising at constant `v`. Worth a one-line footnote at the bottom
  of the page, matching the disclaimers on Speaker Box Designer.
- **No optical Doppler or Terrell rotation rendering.** The starfield and contracted mirror width
  show Lorentz contraction `L = L₀ / γ`, not relativistic aberration or Doppler colour shift.

