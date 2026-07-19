# Planetary Orrery — Feature Plan

## Goal
Add a live top-down view of the solar system: the eight planets drawn at their current positions around the Sun, using real ephemeris data from NASA JPL's Horizons system. A date scrubber lets visitors wind time forward/backward to watch alignments form.

**Route:** `/projects/planets`

---

## 1. Architecture

```
┌─────────────────┐          ┌──────────────────────┐          ┌────────────────────────┐
│   Browser/UI     │ ──fetch──▶│  AWS Lambda Function  │ ──query──▶│  JPL Horizons API       │
│  (SVG orrery)    │◀──JSON───│  (parse + cache)      │◀──text───│  ssd.jpl.nasa.gov/api   │
└─────────────────┘          └──────────────────────┘          └────────────────────────┘
```

Same proxy pattern as the ISS tracker, but for different reasons:
- Horizons wraps its ephemeris data in a **plain-text blob inside the JSON response** (between `$$SOE` and `$$EOE` markers) — parsing that belongs server-side, not in the browser
- Horizons needs **one request per body** (8 planets = 8 upstream calls), and it returns **HTTP 503 for concurrent requests** from the same client (verified 2026-07-18) — the calls must run sequentially, which the Lambda does once, then caches
- Planet positions change slowly, so a cache TTL of **hours, not seconds** means NASA sees almost no traffic from us
- Sidesteps any CORS uncertainty on the NASA endpoint
- The browser never calls the Lambda Function URL directly: ad blockers block fetches to
  `*.lambda-url.on.aws` (hit this in practice, 2026-07-18). The frontend fetches the
  same-origin path `/api/planets`, proxied by Vite in dev and an Amplify 200 rewrite in prod

---

## 2. Data Source — JPL Horizons

**Endpoint:** `https://ssd.jpl.nasa.gov/api/horizons.api` — free, no API key. Verified working (2026-07-18).

Query per planet (example: Mars):

```
?format=json
&COMMAND='499'          ← planet ID: 199 Mercury, 299 Venus, 399 Earth, 499 Mars,
                          599 Jupiter, 699 Saturn, 799 Uranus, 899 Neptune
&EPHEM_TYPE='VECTORS'   ← Cartesian state vectors
&CENTER='500@10'        ← origin at the Sun (heliocentric)
&VEC_TABLE='1'          ← position only (x, y, z), no velocities
&START_TIME='2026-07-18'
&STOP_TIME='2026-07-19'
&STEP_SIZE='1d'
```

The `result` field contains X/Y/Z in km between `$$SOE`/`$$EOE` markers. The Z component is tiny (planets orbit near the ecliptic plane), so the top-down view only needs X and Y.

**Key trick for the date scrubber:** one request per planet with `START_TIME`/`STOP_TIME` spanning a whole year at `STEP_SIZE='1d'` returns ~365 positions in a single call. Eight requests fetch a full year of solar-system motion — the scrubber then animates entirely client-side with zero extra API traffic.

---

## 3. Frontend

- **Orrery:** SVG (no library needed) — Sun at center, orbit circles, planet dots with labels
- **Scale:** real distances span 0.39 AU (Mercury) to 30 AU (Neptune), so a linear scale squashes the inner planets into the Sun. Use a **compressed radial scale** (e.g. `r ∝ √AU` or log) and keep the **angles exact** — alignment is about angle, not distance, so the picture stays truthful
- **Alignment readout:** compute each planet's heliocentric ecliptic longitude (`atan2(y, x)`); show angular separations and highlight clusters (e.g. "4 planets within 40°")
- **Date scrubber:** slider ± 6 months from today, animating positions from the pre-fetched daily data
- **Info panel:** per-planet distance from Sun (AU) and ecliptic longitude; hover/tap a planet to highlight it

---

## 4. Backend — AWS Lambda (same setup as `issPosition`)

**Route:** `GET /api/planet-positions`

The Lambda queries Horizons for all 8 planets over a ±6-month window, parses the `$$SOE`/`$$EOE` blocks, converts km → AU, and returns compact JSON. Cache the parsed result for ~24 h (in-memory + optionally S3 so cold starts don't re-fan-out).

**Response:**
```json
{
  "generated": "2026-07-18T00:00:00Z",
  "startDate": "2026-01-18",
  "stepDays": 1,
  "stale": false,
  "planets": {
    "mercury": [[0.31, 0.12], [0.30, 0.14], ...],
    "venus":   [[-0.52, 0.48], ...]
  }
}
```
(Each entry is `[x, y]` in AU; index = days since `startDate`. Whole payload ≈ a few hundred KB, gzips well.)

If Horizons is unreachable, serve the last cached payload with `"stale": true` — the ISS tracker's delayed-data banner pattern carries over directly.

---

## 5. Build Steps

1. ✓ **Parse locally** — Script that queries Horizons for one planet, parses the `$$SOE` blob, prints AU coordinates. Confirms the data pipeline before any UI exists.
2. ✓ **Static orrery** — SVG with Sun, orbit rings, and planets at hard-coded positions. Nail the radial scale here. (Also: reference ring with 30° ticks, 0° = vernal equinox.)
3. ✓ **Lambda** — Deployed 2026-07-18 as `planetPositions` (console-created, us-west-2, Node 22, 60s timeout), source in `lambda/planet-positions/index.mjs`. Served same-origin at `/api/planets` via Amplify 200 rewrites (both slash variants, ordered above the SPA catch-all) because ad blockers block `*.lambda-url.on.aws`.
4. ✓ **Live positions** — Frontend fetches once on load (React Query, no polling needed), renders today's positions.
5. ✓ **Date scrubber** — Slider indexes into the pre-fetched daily arrays; requestAnimationFrame "play" mode at 20 days/sec, wrapping at the end of the window; "Today" button resets.
6. ✓ **Alignment readout** — Ecliptic longitudes, cluster highlight ("N planets within X°").
7. **Polish** — Mostly done (colors, hover tooltips, stale-data banner); mobile layout still unchecked.

---

## 6. Deferred / Stretch Goals

- ✓ Toggle between inner-planet zoom and full-system view — inner view includes the Moon
  (served geocentric at 6 decimals from the Lambda; drawn in its true direction from Earth
  at an exaggerated distance, since ~0.0026 AU is invisible at orrery scale)
- Include Pluto or a famous comet
- "Next great alignment" finder — scan future ephemeris for tight clusters
- Geocentric night-sky view ("which planets can I see tonight?") — different projection, same data
