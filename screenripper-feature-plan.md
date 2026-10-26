# ScreenRipper — Feature Plan

A screensaver for the browser: ten animated patterns, from rotating geometry to GPU fractals,
picked with the number keys, cycling on their own every minute, and taken fullscreen with `F`.

**Route:** `/projects/screenripper`

---

## 0. Does the current stack cut it?

**Yes, with no new dependencies. But it needs one renderer this site does not use yet, WebGL2,
which is built into the browser rather than installed.**

The patterns fall into two kinds, and they need different renderers:

| Kind | Examples | Renderer | Why |
|---|---|---|---|
| Vector | Wireframe solids, starfield, spirograph, fractal tree | **Canvas 2D** (as Arkanoid) | A few thousand lines and paths per frame is easy for Canvas 2D |
| Per-pixel | Mandelbrot, Julia, plasma, tunnel | **WebGL2 fragment shaders** | Out of reach for Canvas 2D at full screen |

The per-pixel case is what decides it. A 1080p screen is 2.07M pixels and 4K is 8.3M. A
Mandelbrot frame at around 50 iterations per pixel is roughly 100M iterations, or 6 billion a
second at 60 fps. Single-threaded JavaScript cannot do that. A fragment shader runs one copy per
pixel in parallel and does it easily, even on integrated graphics.

### The rule carried over from Arkanoid: React must not run the animation loop

React mounts the canvases and then leaves them alone. Each pattern is a plain object stepped from
a `requestAnimationFrame` loop. React re-renders only on discrete events: pattern change,
fullscreen change, pause. That is a few times a minute at most.

### Why no library

| Option | Size | Verdict |
|---|---|---|
| **Hand-rolled Canvas 2D + raw WebGL2** | 0 KB | **Recommended.** Full-screen shader setup is about 80 lines: compile, link, one triangle, a few uniforms. |
| three.js | ~150 KB gz | Built for lit 3D scenes. A wireframe cube is 20 lines of projection maths. Same reasoning as the speaker-box 3D view. |
| p5.js | ~1 MB | Owns its own loop, which breaks the rule above. |
| regl / PixiJS | 25–100 KB | Saves very little over the hand-written version for full-screen shaders. |
| WebGPU | 0 KB | Support is still uneven (Firefox on Linux especially). WebGL2 covers everything here. |

Shaders live in `.glsl` files and are imported as strings with Vite's `?raw` suffix. `vite/client`
types are already in `tsconfig.app.json`, so this needs no config change.

### What we don't need

No Lambda, no API, no Amplify rewrite, no TanStack Query, no `localStorage`. Entirely
client-side, works offline.

---

## 1. Controls and behaviour (agreed)

| Key | Action |
|---|---|
| `1`–`9`, `0` | Show pattern 1–9, `0` is pattern 10 |
| `F` | Toggle fullscreen: the pattern fills the screen, no site header or footer |
| `Esc` | Leave fullscreen (browser default) |
| `Space` | Pause / resume |

- **Number keys** read `ev.key`, not `ev.code`, so the number row and the numpad both work. Keys
  held with Ctrl, Alt or Meta are ignored, so `Ctrl+1` still switches browser tabs and `Ctrl+F`
  still opens find. Auto-repeat (`ev.repeat`) is ignored.
- **Auto-cycle:** every 60 seconds with no key pressed, ScreenRipper moves to the next pattern in
  key order, wrapping from `0` back to `1`. **Any keypress restarts the 60-second count**, so
  picking a pattern gives it a full minute before cycling continues from there.
- **The cycle clock is the animation loop's own clock, not `setInterval`.** It stops when the tab
  is hidden or the pattern is paused, so you never come back to find it has jumped three patterns.
- **Pattern name toast:** on every change the number and name show in a corner for two seconds,
  then fade. It is DOM, not canvas, which is fine because it changes once a minute.
- **Transitions:** fade to black over ~0.4 s, swap, fade in. Done with CSS opacity on the stage, so
  it works the same between a 2D and a WebGL pattern, and it hides the one-off shader compile
  hitch on first use.

### Fullscreen without the site chrome

The page renders inside the normal site layout like every other project, as a preview stage with
the controls listed beneath it. `F` calls `requestFullscreen()` on **the stage element, not the
document**, so only the stage fills the screen. Header, footer and page text are not part of it,
so they are not shown. A `fullscreenchange` listener keeps React's state in sync when the browser
exits fullscreen via `Esc`.

A keydown counts as the user gesture the Fullscreen API requires, so `F` works directly.

While fullscreen:

- **Screen Wake Lock** (`navigator.wakeLock.request('screen')`) is held so the OS screensaver or
  display sleep does not kick in over ours. The browser releases it when the tab is hidden, so it
  is re-requested on `visibilitychange`. It is held only in fullscreen: keeping your screen awake
  just because the page is open in a tab would be rude.
- **Cursor hides** after two seconds without mouse movement.

---

## 2. The patterns

Key map agreed 2026-10-26: six vector patterns, then four shader patterns. Swapping slots later
is a one-line change in `registry.ts`.

| Key | Pattern | Renderer | Notes |
|---|---|---|---|
| `1` | **Polyhedra** | 2D | Wireframe Platonic solids tumbling on three axes, morphing between shapes; hand-written perspective projection |
| `2` | **Starfield** | 2D | Warp-speed streaks from a vanishing point that drifts slowly |
| `3` | **Mystify** | 2D | The Windows classic: two bouncing quadrilaterals with colour-shifting trails |
| `4` | **Spirograph** | 2D | Hypotrochoid curves drawn live, parameters drifting so the figure keeps changing |
| `5` | **Fractal Tree** | 2D | Recursive branching that grows from a seed, sways in a wind field, then regrows with new angles |
| `6` | **Flow Field** | 2D | ~5,000 particles following a noise field, with fading trails |
| `7` | **Plasma** | GL | Classic demoscene sine plasma with a slowly rotating palette |
| `8` | **Mandelbrot Zoom** | GL | Continuous zoom into the Seahorse Valley with smooth colouring |
| `9` | **Julia Morph** | GL | Julia set whose constant `c` orbits the Mandelbrot boundary, so the shape keeps changing |
| `0` | **Tunnel** | GL | Kaleidoscope tunnel flying forward through a mirrored, twisting pattern |

### The Mandelbrot zoom has a depth limit, and it fits the minute

GPU shaders use 32-bit floats: about 7 significant digits. At around −0.74 on the real axis,
adjacent representable numbers are ~6×10⁻⁸ apart. Across 1920 pixels the view stops resolving
cleanly at roughly **5,000× magnification**. Past that, pixels collapse into blocks.

Unlimited deep zoom needs emulated double precision or perturbation theory, which is a project of
its own. For a screensaver the simple answer works: zoom at a constant exponential rate, then fade
and restart. Reaching about 4,000× in 55 seconds is a rate of `ln(4000)/55 ≈ 0.15` per second, so
**one zoom fills almost exactly one auto-cycle slot**. The exact limit is not taken on trust:
`verify.ts` measures it (see §6).

---

## 3. Architecture

### The Effect interface

```ts
interface Effect {
  name: string
  kind: '2d' | 'gl'
  init(ctx: CanvasRenderingContext2D | WebGL2RenderingContext, w: number, h: number): void
  frame(t: number, dt: number): void   // t = seconds since this effect started
  resize(w: number, h: number): void
  dispose(): void                      // free GL programs/buffers, drop particle arrays
}
```

### Two stacked canvases

**A canvas cannot change context type once it has one.** After `getContext('2d')` it can never
give a WebGL context, and the reverse. So the stage holds two canvases on top of each other, one
2D and one WebGL2, and shows whichever the active pattern uses. One WebGL context is shared by all
four shader patterns, each compiling its own program on first use.

### No fixed timestep

Arkanoid needed a 120 Hz fixed timestep because physics has to play the same on every monitor.
These patterns are mostly pure functions of time: position = f(t), so they are frame-rate
independent automatically and need no accumulator. The two with state (Flow Field particles,
Fractal Tree regrowth) step with `dt` clamped to 0.1 s, so a backgrounded tab cannot make them
jump.

### Resolution budget for shaders

On a 4K or retina screen, a full-resolution fragment shader is 8M+ pixels per frame for no visible
gain. The WebGL canvas is sized to a **pixel budget** (about 2.1M, i.e. 1080p) and the browser
scales it up:

```
scale = min(1, sqrt(BUDGET / (cssW * cssH * dpr²)))
```

The 2D canvas stays at full `devicePixelRatio`, because thin lines are where softness shows.

### Context loss

GPU driver resets and sleep/wake can drop a WebGL context. `webglcontextlost` is handled with
`preventDefault()`, and on `webglcontextrestored` the current pattern's program is recompiled, so
the result is a brief blink and not a permanent black screen.

### The Stage

Like Arkanoid's `Engine`, a plain class outside React owns everything per-frame: both canvases,
the loop, the active effect, the cycle clock, fades, resizing, and the fullscreen-only wake lock
and cursor hiding. React subscribes through `onChange`, which fires only on pattern change,
fullscreen change and pause.

---

## 4. File layout

```
src/pages/ScreenRipperPage.tsx        Route, page chrome, stage mount, name toast, key list
src/lib/screenripper/
  types.ts                            Effect interface
  registry.ts                         The ten effects in key order
  stage.ts                            Loop, canvases, switching, fades, cycle clock, fullscreen
  gl.ts                               WebGL2 helpers: compile/link, full-screen triangle, uniforms
  math.ts                             Seeded RNG, 2D noise, 3D rotation/projection
  effects/
    polyhedra.ts  starfield.ts  mystify.ts  spirograph.ts  tree.ts  flowfield.ts
    plasma.ts     plasma.frag.glsl
    mandelbrot.ts mandelbrot.frag.glsl
    julia.ts      julia.frag.glsl
    tunnel.ts     tunnel.frag.glsl
  verify.ts                           Numeric checks, not imported by the app
```

Plus the route in `App.tsx` and a card in `ProjectsPage.tsx` (lucide `MonitorPlay`, which this
version of lucide-react exports).

---

## 5. Build steps

Each step can be checked on its own.

1. **Shell:** route, `ProjectsPage` card, page scaffold, stage with both canvases sized correctly,
   `F` fullscreen on the stage, `fullscreenchange` sync.
2. **Stage loop and switching:** Effect interface, registry, number keys, fades, name toast,
   60-second auto-cycle on the loop clock, pause. Proven with two trivial placeholder effects, one
   2D and one GL.
3. **WebGL plumbing:** `gl.ts`, pixel budget, context loss handling, readable shader errors.
4. **First real pair:** Polyhedra (2D) and Plasma (GL). Both renderers are now proven end to end.
5. **Remaining 2D:** Starfield, Mystify, Spirograph, Fractal Tree, Flow Field.
6. **Remaining GL:** Mandelbrot Zoom, Julia Morph, Tunnel.
7. **Fullscreen polish:** wake lock and its re-request, idle cursor hide, `prefers-reduced-motion`.
8. **Verify and docs:** `verify.ts`, README entry, and a blog post if you want one.

---

## 6. Verification

`src/lib/screenripper/verify.ts`, run the same way as Arkanoid's (bundle with rolldown, then node):

- **Key map:** ten effects, keys `1`–`0` each map to exactly one, every name unique.
- **Cycle clock:** no change before 60 s, a change at 60 s, a keypress at 59 s restarts the count,
  hidden-tab time does not count, wrap from `0` to `1`.
- **Mandelbrot depth:** run the iteration in float32 with `Math.fround` alongside float64 at
  increasing zoom, find where they diverge visibly, and assert the chosen zoom ceiling sits below
  it. This replaces the estimated 5,000× with a measured number.
- **Pixel budget:** at 1080p@1×, 1440p@2× and 4K@2×, the GL canvas never exceeds the budget.
- **Geometry:** each polyhedron satisfies V − E + F = 2; the fully-swayed Fractal Tree stays inside
  the viewport; seeded RNG is deterministic.
- **Shader compile:** compile all four `.glsl` files as GLSL ES 3.00 with `glslangValidator`
  (`sudo apt install glslang-tools`; a system tool, not an npm dependency; agreed 2026-10-26).
  If it is not installed,
  this check is skipped with a message, not silently passed. Failures in the browser log the
  shader info log to the console and show the error on the stage instead of a black screen.

---

## 7. Risks and honest limits

- **I cannot see it.** This environment has no browser rendering, so I can verify the maths,
  timing and compile-ability but not whether a pattern looks good. Colours, speeds and density
  will need tuning by eye. Each effect keeps its tunables as constants at the top of its file.
- **Photosensitivity.** "Visually stimulating" has a limit: no pattern flashes large areas of the
  screen more than three times a second (WCAG 2.3.1). Plasma palette cycling and the Tunnel are
  the two to watch. `prefers-reduced-motion` slows every pattern through a global time scale.
- **Desktop only** (agreed 2026-10-26, as with Arkanoid). Keyboard control has no touch equivalent; the page
  will load on a phone but is not designed for it.
- **Bundle size.** Adds an estimated 20–40 KB to what is already a single 904 KB chunk. Not a
  problem on its own, but splitting routes with `React.lazy` would help the whole site. That is a
  separate change, not part of this plan (backlogged 2026-10-26).
- **Visual register.** Page chrome in brass and rose to match the site; patterns in full colour.
  In fullscreen there is no chrome, so only the patterns are seen.

---

## 8. Stretch goals

- Arrow keys for previous / next pattern
- A brass-and-rose palette option for every pattern, to match the site
- Deep Mandelbrot zoom with perturbation theory
- Randomised parameters per visit, so a pattern is never quite the same twice
- Audio-reactive mode using the microphone (Web Audio `AnalyserNode`)
- Shareable `?pattern=8` URL parameter
