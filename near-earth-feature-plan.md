# Near Earth — Feature Plan ✓ Complete (2026-11-08)

Everything that has hit Earth, is passing it now, or might hit it one day, on one page. Replay 38
years of fireballs flaring across a 3D globe, watch the real path of an asteroid passing the Earth
and Moon this month, then explore the list of objects NASA is watching, with the risk put in plain
terms.

**Route:** `/projects/near-earth`

---

## 0. Fit with the current stack and site architecture

**No new npm dependencies. One new Lambda and one Amplify rewrite.** None of the JPL APIs allow
direct browser requests (no `Access-Control-Allow-Origin` header, tested 2026-11-08), so they go
through a Lambda, following `lambda/planet-positions/`.

**The Content Security Policy does not change.** The browser only talks to the same-origin path
`/api/near-earth/...` and loads the Earth maps Aurora Watch already ships in `public/aurora/`, both
of which `'self'` covers. Adding any other external host later means updating `index.html`.

### Rules carried over from existing projects

1. **Pure maths and parsing live in `src/lib/nearearth/` with a `verify.ts` harness.**
2. **Animation stays out of React state.** The globe and flyby canvases run from
   `requestAnimationFrame` in classes outside React, like `globe.ts` and `solarWind.ts`.
3. **Reuse what is already there:**
   - `src/lib/aurora/camera.ts` for orbit camera, picking and projection
   - `src/lib/aurora/astro.ts` for coordinates
   - `src/lib/screenripper/gl.ts` for shader building and the pixel budget
   - the context-loss, reduced-motion and off-screen handling from `globe.ts`
   - `public/aurora/earth-day.webp` and `earth-night.webp`
4. **Same-origin API path.** Ad blockers block `*.lambda-url.on.aws`, so the browser never calls the
   Lambda URL directly.

### Theme

The page shell and cards follow the site's zinc and brass conventions, with one colour per section:

| Element | Colour |
|---|---|
| Headings, active controls | Brass |
| Past: fireballs | Orange (`#f97316`) to pale yellow for the brightest |
| Now: flybys | Sky (`#38bdf8`), matching Earth in the Orrery |
| Future: risk list | Rose (`#f472b6`), the site's accent |

---

## 1. Data sources

All under `https://ssd-api.jpl.nasa.gov` except Horizons. None need a key.

| Purpose | Endpoint | Sampled 2026-11-08 |
|---|---|---|
| Past impacts | `/fireball.api` | 1,074 events since 1988, 888 with a location |
| Flybys | `/cad.api` | 35 within 0.05 AU in the next 60 days |
| Risk list | `/sentry.api` | 2,242 objects, 587 KB raw |
| One risk object | `/sentry.api?des=` | Impact energy, mass, every possible impact date |
| Cleared objects | `/sentry.api?removed=1` | 3,597 objects removed from the list |
| Orbit class, hazard flag | `/sbdb.api?sstr=` | Per object, on selection |
| Real flyby path | `ssd.jpl.nasa.gov/api/horizons.api` | Earth-centred positions, 169 rows for 14 days at 2-hour steps |

### Feed traps to handle in the Lambda

All observed in live responses on 2026-11-08.

- **Numbers are strings.** Nearly every value in all three feeds. Convert once, in the Lambda.
- **Fireball locations are unsigned.** `"41.8","S","173.1","W"` must become `−41.8, −173.1`.
- **Fireball gaps are normal.** 186 events have no location, and only 363 have a speed. Only `date`,
  `energy` and `impact-e` are guaranteed.
- **Two energies.** `energy` is radiated light in 10¹⁰ joules and `impact-e` is total energy in
  kilotons. Use `impact-e` throughout.
- **Close Approach has no sizes.** `diameter=true` returned `null` for all 35 objects, so estimate
  from brightness (§4). `h` was present on every row.
- **Close Approach dates.** Send two explicit dates. A fixed `date-min` with a relative `date-max` of
  `+60` returned 86 rows where `now` to `+60` returned 35. Use `jd` for time rather than parsing
  `cd`, which is TDB and formatted `2026-Nov-09 21:06`.
- **Time uncertainty format.** `t_sigma_f` looks like `2_00:46` (days, hours, minutes), `13:02` or
  `< 00:01`.
- **`fullname` is padded** with leading spaces.
- **Sentry `last_obs` varies:** `2013-01-12` and `2020-10-3.80160` both occur. Use `last_obs_jd`.
- **Sentry `ts_max` is `null`** when an impact is more than 100 years out, which is not the same as 0.
- **Removed objects return HTTP 200** with `{"error":"specified object removed", ...}`, so check the
  body. Empty results are also 200.
- **Horizons needs two query forms.** Provisional designations use `DES=2025 UF5;`, numbered ones use
  `29075;`. `DES=29075;` finds nothing. A failed lookup is still HTTP 200, with no `$$SOE` block.
- **Check `signature.version`** and log a warning on a mismatch: fireball 1.2, Close Approach 1.5,
  Sentry 2.0.

---

## 2. The Lambda

`lambda/near-earth/index.mjs`, called through `/api/near-earth/<route>`.

| Route | Returns | Cache |
|---|---|---|
| `/fireballs` | Compact event arrays | 6 h |
| `/flybys` | The last 7 and next 60 days, with Sentry flag | 1 h |
| `/risk` | Compact summary of all objects, plus the removed count | 6 h |
| `/object/<des>` | Sentry detail if listed, plus orbit class and hazard flag | 6 h, 200 entries |
| `/track/<des>` | Earth-centred path of the object and the Moon | 6 h, 50 entries |

- **Not an open proxy.** `<des>` must be on the current flyby or risk list, or the route returns 404.
  The Function URL is public, so user input must never reach JPL unchecked.
- **Track window comes from the server.** ±7 days around the close approach time in the cached flyby
  list, at 2-hour steps, so requests cannot ask for arbitrary ranges.
- **Sequential Horizons calls.** Object first, then Moon, as `planet-positions` does, since Horizons
  returns 503 for concurrent requests.
- **Stale over broken.** Each entry falls back to its last good copy with `stale: true`. With nothing
  cached it returns 502.
- **One upstream call at a time per key.** A cold start with several visitors shares one fetch.
- **Small responses.** Dropping unused fields and converting strings brings Sentry from 587 KB to
  about 160 KB and fireballs to about 63 KB.
- **Local development without AWS.** `lambda/near-earth/dev-server.mjs` wraps the handler on port
  8787, and the Vite proxy points there by default. The whole feature can be built and tested before
  anything is deployed.

### Deployment (done by hand, as with `planetPositions`)

1. Create the Lambda: Node.js 22.x, 60-second timeout, Function URL with no auth.
2. Add an Amplify 200 rewrite from `/api/near-earth/<*>` to `https://<function-url>/<*>`.
3. Confirm a sub-path such as `/api/near-earth/risk` reaches the Lambda. The existing `/api/planets`
   rewrite is a single fixed path, so wildcard forwarding is new here.

---

## 3. Page structure

```
┌───────────────────────────────────────────────────────────┐
│  IMPACT GLOBE (full width, about 75vh)                    │
│  Title + Right Now stats                                  │
│  Play ▶  ──────●──────────────────  1988 … today          │
├───────────────────────────────────────────────────────────┤
│  Sticky nav:  Past 1,074 · Now 35 · Future 2,242          │
├────────────────────────────┬──────────────────────────────┤
│  Selected fireball         │  Fireballs per year          │
│  Largest events            │                              │
├────────────────────────────┴──────────────────────────────┤
│  NOW: pass chart                                          │
│  Flyby view for the selected object                       │
├───────────────────────────────────────────────────────────┤
│  FUTURE: risk chart, table, object detail                 │
├───────────────────────────────────────────────────────────┤
│  Energy ladder                                            │
├───────────────────────────────────────────────────────────┤
│  How it works · Data credits                              │
└───────────────────────────────────────────────────────────┘
```

**Right Now stats** use only live data: last fireball, next close pass, and how many objects on the
risk list rate above 0 on the Torino scale.

---

## 4. Past: the Impact Globe

A WebGL2 Earth like Aurora Watch, but simpler: no ray-marched shell, one fragment shader for the
surface and atmosphere, plus an instanced point layer for fireballs.

- **Markers** are one static buffer of position, normalised time and log energy. The vertex shader
  does the rest from a single `uCursor` uniform, so playback needs no per-frame buffer updates.
- **Playback** runs 1988 to today in about 40 seconds. Each fireball flares when the cursor reaches
  it, then settles to an ember sized by energy. Drag the scrubber to move through time.
- **Interaction:** drag to orbit, Ctrl+wheel or pinch to zoom, hover for a label, click to select.
  Picking projects the 888 points on the CPU with `projectPoint`.
- **Filters:** minimum energy, and year from the histogram.
- **Largest events** list, with one click flying the camera there. Chelyabinsk (441 kt, 2013) leads
  by a factor of nine.
- **Events with no location** are counted in the stats and histogram, and the page says how many are
  missing from the globe.

---

## 5. Now: flybys

### Pass chart

Time across, distance up on a log scale, one point per object:

- **Uncertainty bars** from `dist_min` to `dist_max`. These matter: `2019 XF2` passes at a nominal 3.1
  lunar distances, but could be anywhere from 1.2 to 24.8.
- **Reference lines:** geostationary orbit (0.11 LD), the Moon (1 LD), and the search limit (19.5 LD).
- **Point size** from estimated diameter, and a rose ring if the object is also on the risk list.
  Today that is `2026 VX1` and `2010 VQ`.
- A "today" line divides the last 7 days from the next 60.

### Size estimate

```
D (km) = 1329 / √p · 10^(−H / 5)
```

Sentry assumes `p = 0.154`, so the page uses the same for its central value and shows a range from
`p = 0.25` to `p = 0.05`. `H = 27.7` reads "about 10 m (8–17 m)".

### Flyby view

Selecting an object fetches its real path and animates it on a Canvas 2D stage:

- **Earth-centred 3D**, drag to rotate, with Earth, the Moon's actual path over the same days, and the
  object's track.
- **Log or linear distance.** Log is the default so Earth, Moon and a path millions of kilometres out
  all fit. Direction is always true.
- **Play and scrub** across the 14 days, with live distance, speed and date.
- A label at closest approach, using the Close Approach feed's values.

The Close Approach feed gives no direction, so the pass chart deliberately doesn't invent angles.
Only this view, which has real positions, draws in space.

---

## 6. Future: the risk list

### Risk chart

Scatter of all 2,242 objects: years from now (log) across, Palermo scale up, point size by diameter.
Hover for a name, click to select. Bands mark the meaning of the scale:

- Below −2: no likely consequences
- −2 to 0: merits careful monitoring
- Above 0: more threatening than the background hazard

Only two objects sit above −2: `1950 DA` at −0.98 (year 2880) and Bennu at −1.40.

### Table and detail

Sortable by Palermo, probability, size and year, with search. Selecting an object shows:

- **Odds in words.** `3.401e-4` reads "1 in 2,940".
- **Impact energy** from the per-object feed, placed on the energy ladder.
- **Possible impact dates**, orbit class and hazard flag.
- **"Also passing soon"** linking to the flyby view if it is in the Close Approach list.

### Tone

This section must not be alarming, because the data isn't. Every headline figure comes from the live
feed, never hard-coded:

- "No object currently rates above 0 on the Torino scale" appears only while that is true. It must be
  replaced by an accurate statement if `ts_max` is ever above 0.
- "3,597 objects have been cleared from this list", usually because more observations ruled out the
  impact.
- JPL warns that probabilities can be off by a factor of a few or more, which the page repeats.

---

## 7. Energy ladder

A shared log scale connecting the three sections:

| Reference | Energy | Source |
|---|---|---|
| Hiroshima bomb | 15 kt | Historical |
| Chelyabinsk, 2013 | 441 kt | Fireball feed |
| Tunguska, 1908 | About 10 Mt | Estimate, usually quoted at 3–15 Mt |
| Tsar Bomba | 50 Mt | Historical |
| 1950 DA, if it hit | 75,210 Mt | Sentry feed |
| Chicxulub | About 100 million Mt | Estimate |

Selecting a fireball or risk object adds a marker, so any event can be compared directly.

---

## 8. File layout

```
lambda/near-earth/
  index.mjs       Routes, cache, upstream calls
  transform.mjs   Pure feed conversion
  verify.mjs      Checks for transform.mjs, with trimmed real responses
  dev-server.mjs  Local wrapper on port 8787
src/lib/nearearth/
  api.ts          Query options and fetchers
  parse.ts        Shape checks on Lambda responses
  scale.ts        Lunar distances, size from H, odds, Palermo bands, time uncertainty
  energy.ts       Ladder references, unit conversion, log positions
  markers.ts      Fireball buffers, energy levels, yearly counts
  sections.ts     Scrolling between Past, Now and Future
  impactGlobe.ts  WebGL2 renderer, playback, picking
  earth.frag.glsl  markers.vert.glsl  markers.frag.glsl
  flybyStage.ts   Canvas 2D flyby view and its projection
  verify.ts       Numerical verification
src/components/nearearth/
  ImpactGlobeStage.tsx  SectionNav.tsx  FireballPanel.tsx  YearHistogram.tsx
  PassChart.tsx  FlybyTable.tsx  FlybyView.tsx  RiskChart.tsx  RiskTable.tsx
  RiskDetail.tsx  EnergyLadder.tsx  useWidth.ts
src/pages/
  NearEarthPage.tsx
scripts/
  verify-near-earth.mjs   Runs both verify files, compiles GLSL
```

Plus wiring:

- `vite.config.ts`: proxy `/api/near-earth` to the local server, overridable with an environment
  variable.
- `src/App.tsx`: add the route.
- `src/pages/ProjectsPage.tsx`: add the **Near Earth** card with the `Radar` icon.
- `README.md`: route, features, data sources, deployment.

---

## 9. Failure and fallback states

| Situation | Behaviour |
|---|---|
| No WebGL2 | Flat map from `earth-night.webp` with SVG dots, still selectable |
| Reduced motion | No auto-rotate or flares; playback steps; camera cuts instead of flying |
| GL context lost | Rebuild on restore, as `globe.ts` does |
| Off-screen or hidden | Rendering pauses |
| One feed fails | That section shows an error; the others keep working |
| Lambda serving old data | "Data may be delayed" notice from `stale: true` |
| Object has no Horizons path | Flyby view explains, pass chart still works |
| Object removed from Sentry mid-session | Detail panel says it has been cleared |

---

## 10. Verification

**Lambda (`verify.mjs`), on trimmed real responses:**

- Signed coordinates: `41.8 S, 173.1 W` becomes `−41.8, −173.1`
- Null locations and speeds stay null
- Numeric strings convert; `2020-10-3.80160` does not break anything
- `removed` responses are recognised despite HTTP 200
- Horizons command: `2025 UF5` gives `DES=2025 UF5;`, `29075` gives `29075;`
- Horizons response with no `$$SOE` is treated as not found
- Allow-list rejects unknown designations, including ones with `;` or quotes
- Cache: fresh hit, expired refetch, stale fallback, and shared in-flight request

**Front end (`verify.ts`):**

| Check | Expected |
|---|---|
| Size, `H = 22`, `p = 0.154` | 134.8 m |
| Size, `H = 25` | 33.9 m |
| Size, `H = 27.7` | 9.8 m, range 8–17 m |
| Size, `H = 30` | 3.4 m |
| `0.00795386` AU | 3.10 LD |
| `0.05` AU | 19.46 LD |
| Geostationary orbit | 0.11 LD |
| Probability `3.401e-4` | "1 in 2,940" |
| `75,210` Mt | `7.521 × 10⁷` kt |
| `2_00:46` | 2 days 46 minutes |
| `< 00:01` | under a minute |

Also: Palermo band edges, ladder positions rising with energy, marker time normalisation, globe
project-then-pick round trips, and flyby projection preserving direction in log mode. Shaders compile
as GLSL ES 3.00.

`verify` can't judge appearance, so each visual step also gets checked in a real browser.

---

## 11. Build steps

Each step leaves the site working and could ship alone.

1. ✓ **Lambda:** transforms, routes, cache, allow-list, local dev server and checks.
2. ✓ **Data layer:** Vite proxy, `api.ts`, `parse.ts`, `scale.ts`, `energy.ts`, `verify.ts`.
3. ✓ **Page scaffold:** route, projects card, section nav, Right Now stats, histogram, and tables for all
   three feeds.
4. ✓ **Impact Globe:** Earth, atmosphere, orbit and zoom, fireball markers.
5. ✓ **Playback and selection:** scrubber, flares, hover, click, largest events, filters.
6. ✓ **Pass chart:** uncertainty bars, reference lines, risk-list rings.
7. ✓ **Flyby view:** real paths, 3D rotation, log and linear modes, play and scrub.
8. ✓ **Risk explorer and ladder:** chart, detail panel, odds, energy comparison, cleared count.
9. ✓ **Finish:** fallbacks, reduced motion, phone layout, credits, README, a blog post, then
   `npm run lint`, `npm run build` and `node scripts/verify-near-earth.mjs`.
10. ✓ **Deploy:** the Lambda and Amplify rewrite from §2, then confirm every route in production.

**Built 2026-11-08.** `node scripts/verify-near-earth.mjs` passes all checks and compiles the shaders. The
Lambda is deployed in `us-west-2` as `nearEarth`, and every route was confirmed through
`land3r.net/api/near-earth/`. Appearance and failure states were checked in headless Chromium on software
rendering, so frame rate on real GPUs is still to be judged by eye.

---

## 12. Honest limits

Worth a short "How it works" note on the page.

- **The fireball record is not a complete list.** CNEOS says it covers only the brightest events
  seen by US Government sensors. Early years are sparse (five events before 1994), so the histogram
  must not be read as a trend.
- **Impact energies are estimates**, derived from radiated light by an empirical relation.
- **Locations are for peak brightness**, not where anything landed.
- **Most sizes are estimates.** They come from brightness and an assumed reflectivity, which can be
  wrong by a factor of two either way.
- **Flyby paths are nominal.** Poorly observed objects have wide uncertainty, which the pass chart
  shows and the path alone does not.
- **Impact probabilities can be off by a factor of a few or more**, according to JPL, and usually
  fall to zero as observations accumulate.
- **Log distance distorts apparent speed and shape** in the flyby view. Direction stays true.
- **The Torino scale only covers the next 100 years**, so an object with no rating beyond that isn't
  the same as one rated 0.

---

## 13. Deferred / stretch goals

- **Entry direction streaks.** The fireball feed offers `vx`, `vy` and `vz`, but the exact reference
  frame needs confirming before drawing them.
- **Impact effects:** crater and blast estimates for a chosen object and location.
- **Orbit view:** a selected object's full orbit around the Sun, using the SBDB elements.
- **Link from Aurora Watch or the Orrery** to objects passing soon.
- **Close approach alerts** for anything passing inside the Moon's orbit.
