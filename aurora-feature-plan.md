# Aurora Watch — Feature Plan ✓ Complete (2026-11-08)

A live, explorable aurora: a WebGL Earth with NOAA's current forecast rendered as glowing curtains
at their real altitude. Spin the globe, click anywhere to find out whether you could see it from
there tonight, then drop down to the ground and look up at the sky that location would have. Below
the globe, follow the solar wind from the Sun to Earth, and replay history's great storms on the
same globe.

**Route:** `/projects/aurora`

---

## 0. Fit with the current stack and site architecture

**No new npm dependencies, no Lambda, no Amplify changes.** Every NOAA and Open-Meteo feed used here
sends `Access-Control-Allow-Origin: *` (tested 2026-11-08), so the browser fetches them directly with
TanStack Query, the way the earthquake page reaches USGS. The hosts do need adding to the Content
Security Policy in `index.html`: `connect-src` for the feeds and `img-src` for NOAA's solar images.

The globe is hand-written WebGL2 rather than Three.js. One fragment shader ray-traces the sphere and
the aurora shell, so a scene graph would add bundle weight without saving much code.

### Rules carried over from existing projects

1. **Pure maths and parsing in `src/lib/aurora/` with a `verify.ts` harness** (from
   `src/lib/enclosure/` and `src/lib/relativity/`). Feed parsing, grid sampling, sun and moon
   position, visibility scoring and the storm model are pure functions asserted before any UI uses
   them.
2. **Animation stays out of React state** (from `src/lib/arkanoid/`). React renders the panels and
   controls. The globe and solar wind canvases run from `requestAnimationFrame` and read a mutable
   scene object.
3. **Reuse the ScreenRipper GL plumbing.** Import `createProgram` and `glBackingSize` from
   `src/lib/screenripper/gl.ts`. `fullscreenShader` has no texture lifecycle, so the globe gets its
   own small renderer. Copy the context-loss, `ResizeObserver` and reduced-motion handling from
   `stage.ts`, and add pausing when the canvas is off-screen.

### Theme

The page shell and cards follow the site's zinc and brass conventions. `Layout` does not constrain
page width, so the globe can run edge to edge above a `max-w-6xl` content column.

| Element | Colour |
|---|---|
| Headings, active controls | Brass (`text-brass`, `border-brass bg-brass/10`) |
| Aurora, positive signal | Emerald (`#34d399`) |
| Southward Bz, storm conditions | Rose (`#f472b6`), matching the site's accent |
| Earth, northward Bz | Sky (`#38bdf8`), matching the Orrery's Earth |
| G1 to G5 severity | Yellow, amber, orange, red, deep red |

---

## 1. Data sources

All paths are under `https://services.swpc.noaa.gov`. None need a key.

| Purpose | Path | Compressed | Poll | Notes |
|---|---|---|---|---|
| Aurora grid | `/json/ovation_aurora_latest.json` | 148 KB | 5 min | 360×181 cells, 0–100 |
| Solar wind now | `/products/geospace/propagated-solar-wind-1-hour.json` | 2 KB | 1 min | Includes arrival time at Earth |
| Solar wind history | `/json/rtsw/rtsw_wind_1m.json`, `/json/rtsw/rtsw_mag_1m.json` | 103 + 162 KB | 5 min, on demand | Only for the 24-hour scrubber |
| Kp with forecast | `/products/noaa-planetary-k-index-forecast.json` | 0.5 KB | 5 min | 81 three-hour rows |
| G/S/R scales | `/products/noaa-scales.json` | 0.2 KB | 5 min | Keys `-1`, `0`, `1`–`3` |
| Alerts | `/products/alerts.json` | 5 KB | 5 min | Plain text messages |
| X-ray flux | `/json/goes/primary/xrays-1-day.json` | 105 KB | 5 min, on demand | Flare chart |
| Sun image | `/images/animations/suvi/primary/{094,131,171,195,284,304}/latest.png` | 0.6–1.3 MB | On selection | No polling |
| 24-hour replay | `/products/animations/ovation_{north,south}_24h.json` | 2 KB | On demand | Lists 5-minute JPEG frames |

Outside NOAA:

| Purpose | Endpoint | Notes |
|---|---|---|
| Cloud cover | `api.open-meteo.com/v1/forecast?...&hourly=cloud_cover` | Free for non-commercial use, CC BY 4.0 attribution |
| Place search | `geocoding-api.open-meteo.com/v1/search` | Same terms |
| Day map | NASA Blue Marble, reduced to about 4096×2048 | Static file in `public/aurora/`, from `assets.science.nasa.gov/.../bmng/bmng-topography-bathymetry/december/` |
| Night lights | NASA Black Marble `BlackMarble_2016_01deg.jpg`, 3600×1800, 780 KB | Static file, from `assets.science.nasa.gov` |

### Feed traps to handle in `parse.ts`

These were all observed in live responses on 2026-11-08.

- **Timestamps without a zone.** `rtsw` and Kp `time_tag` values have no `Z`, so `new Date()` reads
  them as local time. Treat them as UTC. The aurora, propagated and X-ray feeds do include `Z`.
- **Grid order is longitude-first.** Rows run `[lon, lat, value]` with `index = lon·181 + (lat+90)`.
  A GL texture needs `index = (lat+90)·360 + lon`, so transpose it.
- **`rtsw` mixes spacecraft.** Of 3,651 rows, 1,436 were `active: true`, across `SOLAR1`, `ACE` and
  `IMAP`. Keep active rows only, otherwise the series jumps between instruments.
- **Inconsistent shapes.** `rtsw` is newest-first and Kp is oldest-first. The propagated feed is an
  array of arrays with a header row. The Kp field is `Kp` in one feed and `kp` in another.
- **X-ray has two bands.** Keep `0.1-0.8nm`, the band used for flare classes.
- **Null readings.** Instrument values can be `null`. Show gaps in the charts rather than zeros.
- **Validate at the boundary.** Older tutorials show different shapes for some of these feeds, so a
  feed that fails its shape check shows that panel's error state and never reaches the renderer.

---

## 2. The globe

A full-bleed WebGL2 canvas about 75vh tall. It draws one fullscreen triangle, and the fragment
shader does all the work.

### Layers, back to front

1. **Stars:** procedural background, dimmed near the Sun.
2. **Earth:** Blue Marble on the day side and Black Marble city lights on the night side, blended
   across a soft terminator from the true sub-solar point at the current UTC.
3. **Atmosphere:** a blue limb glow that reddens along the terminator.
4. **Aurora shell:** ray-marched between 100 and 300 km above the surface.

### Rendering the aurora

- The grid uploads as an `R8` 360×181 texture with linear filtering, repeat wrapping in longitude
  and clamped latitude. Sample with a half-texel offset, `u = (lon + 0.5) / 360`.
- Each new grid goes in a second texture and cross-fades over 3 seconds, so updates look like the
  aurora moving rather than a redraw.
- Colour follows real emission altitudes: purple at the lower border (nitrogen, about 100 km), green
  through the main body (oxygen 557.7 nm, about 110–200 km), red at the top (oxygen 630 nm, above
  about 200 km).
- Curtains come from a tiled noise texture sliding slowly along the oval. Noise is held constant
  along each radial line, which produces the vertical rays seen in photographs.
- The shell height is exaggerated ×2.5 from orbit so it reads at globe scale, and is true scale from
  the ground.

### A fixed brightness curve

On the day this was checked, the grid peaked at **21** and no cell reached 50, so quiet days are the
normal case. Use one fixed curve and never normalise to the grid's own maximum, or every quiet day
would look like a major storm:

```
I = min(1, P / 60) ^ 0.6 · smoothstep(3, 8, P)
```

That gives `P = 10 → 0.34`, `P = 21 → 0.53`, `P ≥ 60 → 1`, so a quiet oval is visible and a storm is
clearly brighter. The fade-in from 3 to 8 stops the oval's outline showing as a hard step at the 1°
cell size.

### Interaction

- **Drag** to orbit with inertia. It auto-rotates when idle and stops on first touch.
- **Zoom** with buttons, pinch or Ctrl+wheel. Plain wheel keeps scrolling the page, matching
  `scrollWheelZoom={false}` on the ISS map.
- **Hover** shows latitude, longitude and forecast percentage.
- **Click** sets the location for the viewing panel and drops a pin.
- **Quick views:** North, South, Strongest now, My location.
- **Keyboard:** arrow keys orbit, `+` and `-` zoom.
- **Overlay readout:** G-level badge, Kp, wind speed, Bz, and how old the data is.

### Implementation traps

- `atan` jumps at the ±180° seam, which produces a visible line with mipmapping. The shader works out
  the mip level from the geometry and uses `textureLod`.
- Earth maps are centred on 0° with longitude running −180 to 180, while the aurora grid runs 0 to
  359. Keep one longitude convention in the shader.
- Start at 24 ray-march steps. A frame-time governor reduces steps, then resolution, on slow GPUs.

---

## 3. "Can I see it?"

Choose a location by clicking the globe, searching, using a preset (Tromsø, Fairbanks, Reykjavík,
Yellowknife, Hobart) or pressing **Use my location**.

### Scoring

Everything except cloud cover is calculated locally, so this panel has only one extra network call.

```
A = min(1, Pview / 50)              Pview: best weighted grid value in view
D = 0    if sun > −6°
    0.35 if −12° < sun ≤ −6°
    0.8  if −18° < sun ≤ −12°
    1    if sun ≤ −18°
C = 1 − 0.9 · (cloud% / 100)
M = 1 − 0.25 · moonIllumination     if the Moon is up, otherwise 1

score = A · D · C · M
```

- **`Pview` looks beyond the zenith.** NOAA says bright aurora can be seen from as far as 1000 km
  away. Scan cells within that radius, weighted `P · (1 − 0.5 · d / 1000)`.
- **Bands:** below 0.05 Unlikely, up to 0.2 Slight, up to 0.5 Possible, otherwise Good. These bands
  are this site's heuristic, and the page says so.
- The panel shows each factor next to the verdict, such as "Dark enough, 80% cloud, oval 400 km to
  your north", so a low score explains itself.

### Tonight strip

Twelve hourly cells show darkness, cloud and the Kp forecast. Clicking an hour moves the Sun on the
globe to that time and switches the aurora to the modelled oval for that hour's Kp (§5), with the
Simulated label showing. The NOAA grid only reaches 30–90 minutes ahead, so later hours can't use it.

### Privacy

- Geolocation runs only when the button is pressed.
- Coordinates are rounded to 0.1° before going to Open-Meteo.
- A shareable `?lat=&lon=` link is written only when the viewer presses Share.

---

## 4. Sun to Earth

A full-width Canvas 2D strip under the globe, showing what is driving the aurora right now.

```
 [Sun]  · · · · ·  solar wind  · · · · ·  [L1 craft]  · · ·  )) [Earth]
  ^ live image      speed and density       measures here    ^ shield flexes
```

- **Sun:** the current SUVI image, with chips to switch between six wavelengths.
- **Particles:** speed, count and colour come from the propagated feed. Colour shows Bz: rose when
  southward, sky when northward. Sustained southward Bz is what opens the door to aurora, so the
  strip draws a reconnection flash at the nose of the shield.
- **Magnetosphere:** the shield compresses with live pressure, using the standard estimate
  `R ≈ 107.4 · (n · v²)^(−1/6)` Earth radii (`n` in cm⁻³, `v` in km/s).
- **Arrival countdown:** "The wind measured now reaches Earth at 23:29", read directly from
  `propagated_time_tag`, with no assumed distance or speed.
- **24-hour scrubber:** drag along the timeline and the particles replay what the wind was doing.
- **Hover notes:** a sentence of plain explanation on each part of the strip.

### Charts

Recharts, in a tabbed card below the strip:

- **Kp:** 3-hourly bars coloured by G-level, separating observed, estimated and predicted values.
  Clicking a predicted bar previews that Kp on the globe.
- **Solar wind:** speed, density and Bz, for the last 24 hours.
- **X-ray flux:** log scale with bands for A, B, C, M and X flare classes.

---

## 5. Storm Time Machine

A Kp slider and presets drive the same globe, ground view and viewing panel:

| Preset | Setting | Equatorward edge |
|---|---|---|
| Quiet | Kp 1 | 64° |
| G1 minor | Kp 5 | 56° |
| G3 strong | Kp 7 | 52° |
| G5, May 2024 | Kp 9 | 48° |
| Carrington, 1859 | Beyond the scale | About 25° (illustrative) |

- **Model:** NOAA's rule of thumb puts the edge near 66° magnetic latitude at Kp 0, moving about 2°
  equatorward per Kp level: `edge = 66 − 2·Kp`. The oval is a Gaussian band poleward of that edge
  with extra reach around magnetic midnight.
- **Coordinates:** convert geographic to geomagnetic latitude with a tilted dipole. Take the pole
  position from the current IGRF model when building, roughly 80.8°N, 72.7°W.
- **Shared pipeline:** the model writes the same 360×181 array as the live feed, so every downstream
  view works unchanged and transitions cross-fade.
- **Always labelled:** a persistent "Simulated, not a forecast" banner is on screen whenever modelled
  data is showing, with a one-click return to Live.

---

## 6. Ground view

The showpiece. **Look up from here** flies the camera from orbit down to the chosen location and
turns toward the pole.

- Uses the same shader and aurora shell, with the camera on the surface and height exaggeration at
  1×. Because the geometry is real, the view is honest: under the oval the curtains fill the sky,
  and hundreds of kilometres south they sit low on the horizon.
- Reference geometry, for the lower border at 110 km: 5° above the horizon is 743 km away, 10° is
  502 km and 20° is 280 km.
- Drag to look around. A compass strip shows heading and points to the brightest part of the sky.
- Sky colour follows the real sun altitude, and the Moon adds glow when it is up. Treeline silhouette
  with procedural stars.
- The Storm Time Machine works here too. Stand in a mid-latitude city, pick Carrington, and watch the
  sky change.

---

## 7. Page layout

```
┌───────────────────────────────────────────────────────────┐
│  GLOBE / GROUND VIEW (full width, about 75vh)             │
│  Title + overlay readout      Quick views, Storm presets  │
├───────────────────────────────────────────────────────────┤
│  Live | Simulated banner · Latest alert                   │
├────────────────────────────┬──────────────────────────────┤
│  Can I see it?             │  G / S / R scales            │
│  Verdict, factors, search  │  Today plus 3-day outlook    │
│  Tonight strip             │                              │
├────────────────────────────┴──────────────────────────────┤
│  SUN TO EARTH strip with 24-hour scrubber                 │
├───────────────────────────────────────────────────────────┤
│  Charts: Kp | Solar wind | X-ray                          │
├───────────────────────────────────────────────────────────┤
│  How it works · Data credits                              │
└───────────────────────────────────────────────────────────┘
```

On phones the sections stack, the globe drops to about 60vh, and the ray-march and pixel budgets are
halved.

### Failure and fallback states

| Situation | Behaviour |
|---|---|
| No WebGL2 | NOAA's polar forecast image in place of the globe; data panels still work |
| Reduced motion | No auto-rotate or curtain drift; camera moves cut instead of fly |
| GL context lost | Rebuild on restore, as `stage.ts` does |
| Tab hidden or globe off-screen | Rendering pauses; TanStack stops background polling by default |
| One feed fails | That panel shows an error and keeps the last good data with its age |
| Solar wind stale over 15 min | Amber notice. NOAA's model falls back to Kp in this case, with no lead time |

---

## 8. File layout

```
src/lib/aurora/
  feeds.ts        URLs, fetchers, polling intervals
  parse.ts        Shape checks and normalisation for each feed
  grid.ts         AuroraField type, transpose, sampling, Pview scan
  astro.ts        Sun and Moon position, sub-solar point, illumination
  geomag.ts       Geographic to geomagnetic latitude
  stormModel.ts   Kp to synthetic grid, presets
  visibility.ts   Scoring, verdict bands, factor explanations
  magnetosphere.ts  Standoff distance, particle mapping
  camera.ts       Orbit and ground cameras, flight path, screen-to-lat/lon
  globe.ts        WebGL2 renderer: textures, uniforms, quality governor
  globe.frag.glsl Earth, atmosphere, shell ray-march, ground sky
  noise.ts        Tiling curtain noise, generated at start-up instead of shipping an image
  format.ts       Display helpers shared by the panels
  solarWind.ts    Canvas 2D Sun-to-Earth strip
  verify.ts       Numerical verification
src/components/aurora/
  GlobeStage.tsx  ViewingPanel.tsx  TonightStrip.tsx  ScalesPanel.tsx
  SolarWindStrip.tsx  ChartsTabs.tsx  StormControls.tsx  AlertBar.tsx
src/pages/
  AuroraPage.tsx
scripts/
  verify-aurora.mjs   Bundles verify.ts, compiles GLSL (modelled on verify-screenripper.mjs)
public/aurora/
  earth-day.webp  earth-night.webp
```

Plus wiring:

- `src/App.tsx`: add `<Route path="aurora" element={<AuroraPage />} />` under `/projects`.
- `src/pages/ProjectsPage.tsx`: add the **Aurora Watch** card with the `Sparkles` icon.
- `README.md`: route, features, data sources and credits.

---

## 9. Verification (`verify.ts`)

- **Parsers:** small fixtures trimmed from real responses, covering each trap in §1. That includes
  UTC parsing, inactive-row filtering, null readings and malformed shapes.
- **Grid:** transposing round-trips, wrap-around at 359°→0° samples correctly, and `Pview` finds a
  known hot cell at a known distance.
- **Sun and Moon:** positions compared against USNO values captured into fixtures, within 0.5°.
- **Brightness curve:** `P = 10`, `21` and `60` give `0.34`, `0.53` and `1.00`.
- **Viewing geometry:** the elevation distances in §6.
- **Scoring:** `P = 21`, full dark, clear sky, Moon down gives `A = 0.42` and "Possible". Sun at
  `−3°` gives "Unlikely" whatever the aurora is doing.
- **Magnetosphere:**

  | Density (cm⁻³) | Speed (km/s) | Standoff (Earth radii) |
  |---|---|---|
  | 5 | 400 | 11.15 |
  | 1.76 | 714 | 10.94 |
  | 20 | 800 | 7.02 |
  | 50 | 1500 | 4.89 |

- **Storm model:** the edge is 64° at Kp 1 and 48° at Kp 9, and the output array is exactly 65,160
  cells in range.
- **Shaders:** compiled as GLSL ES 3.00 with `glslangValidator`; a missing tool reports SKIP, never
  a pass.

`verify.ts` can't judge appearance, so each visual step also gets checked in a real browser, on both
a quiet-day grid and a simulated storm.

---

## 10. Build steps

Each step leaves the site working and could ship alone.

1. ✓ **Data layer:** `feeds.ts`, `parse.ts`, `grid.ts`, `astro.ts`, `verify.ts` and its runner.
2. ✓ **Page scaffold:** route, projects card, scales panel, Kp chart and alerts, using live data with
   no globe yet.
3. ✓ **Earth:** textures, `globe.ts`, day and night blend, atmosphere, drag, zoom and hover.
4. ✓ **Live aurora:** grid texture, shell ray-march, curtains, cross-fade and the quality governor.
5. ✓ **Can I see it?:** click-to-pick, search, presets, cloud cover, scoring and the Tonight strip.
6. ✓ **Sun to Earth:** particle strip, SUVI images, magnetosphere, arrival countdown, scrubber and the
   remaining chart tabs.
7. ✓ **Storm Time Machine:** geomagnetic conversion, the model, presets and the Simulated banner.
8. ✓ **Ground view:** camera flight, ground sky, look-around and compass.
9. ✓ **Finish:** fallbacks, reduced motion, phone tuning, credits, README, a blog post, then
   `npm run lint`, `npm run build` and `node scripts/verify-aurora.mjs`.

**Built 2026-11-08.** `node scripts/verify-aurora.mjs` passes all checks and compiles the shader.
Appearance and the failure states in §7 were checked in headless Chromium on software rendering, so
frame rate on real GPUs is still to be judged by eye.

---

## 11. Honest limits

Worth a short "How it works" note on the page, matching the disclaimers on Speaker Box Designer.

- **The forecast is a probability, not a brightness.** NOAA's value estimates the chance of seeing
  aurora, so mapping it to glow is an artistic choice.
- **Curtain detail is invented.** The data is on a 1° grid, about 111 km across. Where the aurora is
  and how strong it looks come from NOAA, while individual folds and rays are procedural.
- **Colour is camera-like.** Faint aurora often looks grey-green to the eye.
- **The Storm Time Machine is an illustration.** The Kp rule is an average, and the Carrington
  preset is an estimate from historical accounts.
- **The forecast is short-range.** It looks 30–90 minutes ahead, and storms can arrive or fade faster
  than the 3-hourly Kp forecast suggests.
- **The magnetosphere is schematic.** The standoff calculation is real, but the strip is not to
  scale.
- **Scoring ignores local conditions** such as terrain, light pollution and how far north the sky
  is open.

---

## 12. Deferred / stretch goals

- **Own history:** a scheduled Lambda saving grids to S3 would allow true 24-hour globe replay, since
  NOAA only publishes the past day as polar JPEGs. Until then, a lazy-loaded flipbook of every sixth
  frame (48 frames, about 5.8 MB) can cover it.
- **Sonification:** map wind speed and Bz to a Web Audio drone, reusing ideas from
  `src/lib/arkanoid/audio.ts`.
- **Real star positions** in the ground view, so constellations appear in the right place.
- **Web push alerts** when the score passes a threshold for a saved location.
- **ISS overlay:** the station's live position on the globe, as seen in astronaut aurora photos.
