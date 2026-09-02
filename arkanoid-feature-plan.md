# Arkanoid — Feature Plan

A playable Arkanoid-style block breaker, in keeping with the 1986 Taito original: the Vaus
paddle, a ball, a wall of bricks, catchable power-up capsules.

**Route:** `/projects/arkanoid`

---

## 0. Does the current stack cut it?

**Yes, and it needs no new dependencies.** But there is one architectural rule that has to hold,
and it cuts against how every other page on this site is written.

### The rule: React must not run the game loop

Every existing page drives its visuals through React state — `useQuery`, `useState`, re-render.
A game cannot work that way. Calling `setState` with a new ball position 60 times a second means
60 full reconciliations a second, fresh objects each frame for the garbage collector, and frame
timing handed to React's scheduler — which in React 19 is explicitly allowed to batch and defer
work. That is the correct behaviour for a dashboard and the wrong behaviour for a ball.

The split instead:

| Layer | Owner | Update rate |
|---|---|---|
| Ball, paddle, bricks, capsules, score | Plain mutable object in a `useRef` | 120 Hz fixed tick |
| Drawing | `requestAnimationFrame` → Canvas 2D | Display refresh |
| HUD (score, lives, level) | Drawn **on the canvas** | Same frame |
| Menus, pause, game over, route chrome | React + Tailwind | Only on discrete events |

React mounts one `<canvas>` and then leaves it alone. It re-renders on game-over, level-complete
and pause — a handful of times per minute. The hot path never touches it.

Drawing the HUD on the canvas rather than in DOM is deliberate: it keeps the entire game in one
render path, makes a pixel-font retro look straightforward, and removes the last reason to touch
React per-frame.

### Why no game engine

| Option | Size | Verdict |
|---|---|---|
| **Hand-rolled Canvas 2D** | 0 KB | **Recommended.** Arkanoid's physics is circle-vs-AABB reflection — roughly 50 lines. |
| Kontra.js | ~15 KB | Tiny, but saves ~50 lines of collision code. Not worth a dependency. |
| Phaser | ~1.1 MB | Would more than double the current 824 KB bundle, brings its own game loop and DOM ownership, and its arcade physics is built for platformers. Wrong tool. |
| WebGL / PixiJS | — | Overkill. Peak load is ~100 rectangles and 3 balls; Canvas 2D does that with room to spare. |

Canvas 2D is not a compromise here. A few hundred draw calls per frame is comfortably inside its
budget on any device that can load the site.

### What we don't need

No Lambda, no API, no Amplify rewrite, no TanStack Query. The game is entirely client-side, so
unlike the orrery there is no backend, no cache and no running cost. A global leaderboard would
change that — see stretch goals.

---

## 1. Scope for v1

"It needs to work and it needs to be fast" — so v1 is the complete core loop, not a tech demo,
and explicitly not all 33 stages.

**In:**
- Vaus paddle: mouse (primary — closest analogue to the arcade rotary knob) and arrow keys
- Ball with angle-off-paddle reflection — the detail that makes it feel like Arkanoid rather than Pong
- Brick grid: one-hit coloured bricks, multi-hit **silver**, indestructible **gold**
- 3 lives, score, level clear → next level, game over, restart
- 4–5 hand-authored levels
- 6 power-up capsules (see below)
- Pause
- High score in `localStorage`

**Out (deferred):**
- Enemies (the drifting cones/spheres/pyramids)
- DOH boss fight
- All 33 stages
- The `B` warp capsule (needs the exit-gate mechanic)

### Power-up capsules

Capsules fall from destroyed bricks and take effect when caught on the Vaus. The Wikipedia page
lists the effects but not the letter/colour coding, so these come from the game itself:

| Letter | Colour | Effect | v1 |
|---|---|---|---|
| `E` | Blue | Enlarge — Vaus grows wider | **Yes** |
| `S` | Orange | Slow — ball speed reduced | **Yes** |
| `D` | Cyan | Disruption — ball splits into three | **Yes** |
| `C` | Green | Catch — ball sticks to the paddle | Deferred |
| `L` | Red | Laser — Vaus can fire | Deferred |
| `P` | Grey | Player — extra life | Deferred |
| `B` | Magenta | Break — opens warp gate, skip level | Deferred |

Three chosen for v1 (agreed 2026-07-19). `E` and `S` are simple property changes. `D` is kept
because it forces the engine to hold balls as a collection from the outset — much cheaper than
retrofitting multi-ball later. `C` and `L` are the two that add genuinely new mechanics (held-ball
state, projectiles and a second collision path), so they are the right ones to defer.

As in the original, only one capsule falls at a time, and effects last until the ball is lost or
the level ends.

### Scoring

Coloured bricks score by colour (white 50 through yellow 120, stepping by 10). Silver bricks
score 50 × level. Ball loss costs a life; clearing the wall advances the level.

---

## 2. The three things that make it fast — and correct

These are the failure modes worth designing against up front, not debugging later.

### Fixed timestep, or the game runs at different speeds on different monitors

Moving the ball by `speed * deltaTime` each frame sounds right and is a classic trap: on a 144 Hz
display everything runs 2.4× faster than on 60 Hz. The fix is a fixed-timestep accumulator —
physics ticks at a constant 120 Hz regardless of display refresh, with the renderer interpolating
between the last two states:

```
accumulator += min(realDelta, 0.25)      // clamp so a tab-switch can't spiral
while (accumulator >= DT) { step(DT); accumulator -= DT }
render(accumulator / DT)                  // interpolation factor
```

The clamp matters: without it, returning to a backgrounded tab tries to simulate the missing
minutes in one frame and locks the page.

### Tunnelling, or the ball passes straight through a brick

A fast ball moving more than one brick-height per tick can be on one side before the step and the
far side after, never overlapping anything. Two defences, both cheap:

- Tick at 120 Hz rather than 60, halving per-step movement
- Cap ball speed so movement per tick stays below the thinnest brick dimension

If that proves insufficient at high speeds, the fallback is swept AABB collision — more code, so
worth avoiding unless testing shows it is needed.

### Retina blur and per-frame allocation

The canvas backing store must be sized to CSS pixels × `devicePixelRatio` with the context scaled
to match, or the whole game renders soft on every modern display. And nothing in the loop should
allocate — no object or array literals per frame — since GC pauses read as stutter in a game in a
way they never do in a dashboard.

**Fixed logical resolution.** The playfield is a constant coordinate space (the arcade original
was 224×256, portrait) scaled to fit its container. Physics then never depends on window size,
and the retro look survives scaling.

---

## 3. File layout

```
src/pages/ArkanoidPage.tsx        Route, React chrome, canvas mount, overlays
src/lib/arkanoid/
  types.ts                        Shared shapes
  engine.ts                       State + fixed-timestep loop
  physics.ts                      Circle-vs-AABB collision and reflection
  levels.ts                       Level layouts as string grids
  powerups.ts                     Capsule spawn, fall, effects, expiry
  render.ts                       All canvas drawing, including HUD
  audio.ts                        WebAudio blips
```

Levels author best as string grids — readable and editable directly:

```
'WWWWWWWWWWW'   W/O/C/G/R/B/M/Y = coloured, S = silver, X = gold, . = empty
'OOOOOOOOOOO'
'..SS...SS..'
```

**Audio** is synthesised with WebAudio oscillators rather than shipped as files — a few lines,
zero bytes of assets, and a square-wave blip is the correct sound for this game. Muted until a
user gesture, which browser autoplay policy requires anyway.

---

## 4. Build steps

Each step is independently verifiable, so we can stop and look at any point.

1. ✓ **Canvas shell** — route, `ProjectsPage` card, page scaffold, canvas mounted with correct
   `devicePixelRatio` sizing and integer-scaled container fit.
2. ✓ **Loop and paddle** — fixed-timestep loop, mouse + keyboard paddle, wall bounces, floor death.
3. ✓ **Bricks** — grid, collision, destruction, score.
4. ✓ **Game states** — lives, level clear, game over, restart, pause.
5. ✓ **Levels and brick types** — 5 layouts, silver multi-hit, gold indestructible.
6. ✓ **Power-ups** — capsule drop, catch, the three v1 effects, reset on ball loss.
7. ✓ **Polish** — canvas HUD, `localStorage` high score, WebAudio blips with mute, README.
   (Touch controls dropped — desktop only, agreed 2026-07-19.)

**Built 2026-07-19.** Verified by simulation rather than by playing (see §5): all five levels
cleared by a tracking bot, paddle reflection exact at ±60°, step rate held at 120/s across
displays from 30 to 240 Hz, positional drift between 60 Hz and 144 Hz still bounded by a single
step after 40 s of play (i.e. not accumulating), and no NaN, wall escapes, speed gain or
tunnelling across the runs. The tunnelling threshold is now guarded by a runtime check in
`constants.ts`, since raising `BALL_SPEED_MAX` while tuning is the easy way to break it.

---

## 4b. Verifying after a tuning change

`src/lib/arkanoid/verify.ts` simulates real play and asserts the invariants that are easy to
break by adjusting constants — tunnelling headroom, exact paddle reflection angles, a constant
120 steps/sec across display refresh rates, non-accumulating drift, and every level still being
clearable by a tracking bot. It is not imported by the app.

```bash
node -e "import('rolldown').then(async r => { const b = await r.rolldown({ input: 'src/lib/arkanoid/verify.ts' }); await b.write({ file: '/tmp/verify.mjs', format: 'esm' }) })" && node /tmp/verify.mjs
```

---

## 5. Risks

- **I cannot verify how it feels.** This environment has no working browser rendering, so I can
  test physics numerically — reflection angles, framerate independence, tunnelling at max speed,
  collision correctness — but whether the paddle feels right, whether the ball speed is fun, and
  whether the difficulty curve works are things only playing it will answer. Expect to tune
  constants by feel; the plan puts them in one place for that reason.
- **Keyboard input scrolls the page.** Arrow keys need `preventDefault`, scoped to the canvas so
  the rest of the site keeps normal keyboard behaviour.
- **Mobile is out of scope** (agreed 2026-07-19). Desktop only: mouse and keyboard. No touch
  handlers, and the page will not be tuned for small screens.
- **Visual register.** The site is art deco brass; an arcade cabinet is not. The plan is brass and
  rose for the page chrome and HUD, classic Arkanoid colours inside the playfield — the frame
  matches the site, the game looks like the game.

---

## 6. Stretch goals

- Enemies — drifting cones/spheres/pyramids that perturb the ball
- The DOH boss fight
- More of the 33 stages
- `B` warp capsule and the exit gate
- Global leaderboard — the one feature that would need a Lambda, reusing the `planetPositions`
  pattern plus DynamoDB, and the one that would introduce a running cost and abuse surface
- Ghost replay of the current high-score run
