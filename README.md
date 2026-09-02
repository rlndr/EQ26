# land3r.net

A personal website for testing new technologies.
The earthquake monitor is the first of several tools and projects hosted here.

## Pages

| Route | Description |
|---|---|
| `/` | Personal landing page |
| `/projects` | Project index |
| `/projects/earthquakes` | EQ26 — Global Earthquake Monitor |
| `/projects/iss` | ISS Tracker — Live position of the International Space Station |
| `/projects/planets` | Planetary Orrery — Positions of the planets around the Sun |
| `/projects/arkanoid` | Arkanoid — A block-breaker arcade game |
| `/blog` | Blog post index |
| `/blog/:slug` | Individual blog post |

## EQ26 — Earthquake Monitor

Explores the frequency and severity of earthquakes worldwide. Data is sourced in real time from the USGS Earthquake Hazards Program public API. Only earthquakes with a magnitude of **5.0 or higher** are included.

### Features

- **Month selector** — browse any month going back 2 years
- **Summary cards** — total events, max magnitude, regions affected, and strongest event location
- **Magnitude chart** — bar chart breaking down event counts by magnitude band (M5.x, M6.x, M7.x, M8+)
- **Region table** — top 15 affected regions with per-band counts
- **Events list** — full scrollable list of events sorted by magnitude, each linking to the USGS event page

### Data Source

All earthquake data is fetched directly from the **USGS Earthquake Hazards Program FDSNWS API**:

```
https://earthquake.usgs.gov/fdsnws/event/1/
```

No API key is required. Data is fetched client-side on demand.

## ISS Tracker

Displays the live position of the International Space Station on a world map, updating every 5 seconds. Position data is fetched via an AWS Lambda proxy (required to bridge the HTTP-only Open Notify API to the HTTPS site).

### Features

- **Live map** — Leaflet.js world map with ISS position marker
- **Auto-polling** — position updates every 5 seconds via TanStack Query
- **Smooth animation** — marker glides between poll positions via CSS transition
- **Info panel** — live latitude/longitude, plus altitude and speed
- **Stale/error states** — banner shown if the upstream API is unreachable

### Data Source

Position data is sourced from the **Open Notify ISS API** via an AWS Lambda Function URL proxy:

```
http://api.open-notify.org/iss-now.json
```

## Planetary Orrery

A top-down view of the solar system: the eight planets drawn at their real positions around the Sun, viewed from above the ecliptic. Angles are astronomically exact; orbit distances are compressed (square-root scale) so the inner planets stay visible next to Neptune.

### Features

- **Live orrery** — SVG solar system with a reference ring (30° ticks, 0° at the vernal equinox ♈)
- **Date scrubber** — slider spanning ±6 months, with a play mode that animates 20 days per second
- **View toggle** — full-system view, or an inner-planet view that adds the Moon (drawn in its true direction from Earth, at an exaggerated distance for visibility)
- **Alignment readout** — highlights the tightest grouping of planets within a 60° arc
- **Info table** — per-planet distance from the Sun (AU) and heliocentric ecliptic longitude
- **Stale/error states** — banner shown if the upstream API is unreachable

### Data Source

Ephemeris data comes from the **NASA JPL Horizons API** (free, no API key):

```
https://ssd.jpl.nasa.gov/api/horizons.api
```

An AWS Lambda (source in `lambda/planet-positions/`) queries Horizons once per day for daily positions of the planets and Moon across a ±6-month window, parses the ephemeris text blocks, and serves the result as compact JSON. Two upstream quirks it absorbs: Horizons returns 503s for concurrent requests (queries run sequentially), and ad blockers block `*.lambda-url.on.aws` fetches, so the browser reaches the Lambda through the same-origin path `/api/planets` — a Vite proxy in dev, an Amplify 200 rewrite in production.

## Arkanoid

A block breaker after the 1986 Taito original. The Vaus paddle is driven by mouse or arrow keys; where the ball strikes the paddle sets the angle it leaves at. Silver bricks take multiple hits, gold cannot be broken, and capsules fall for a wider paddle (E), a slower ball (S) or three balls at once (D).

### Features

- **Canvas 2D renderer** at a fixed 224×288 logical resolution, integer-scaled to fit and sized for `devicePixelRatio`
- **Fixed 120 Hz timestep** with an accumulator, so the game plays identically on a 60 Hz and a 144 Hz display, with render interpolation between ticks
- **Five levels**, authored as string grids in `levels.ts`, looping with rising ball speed
- **Power-up capsules** — one falling at a time, effects lasting until the ball is lost
- **High score** kept in `localStorage`, and synthesised WebAudio blips with a mute toggle

### Architecture note

The game deliberately does **not** hold its state in React. Game state is a plain mutable object stepped from a `requestAnimationFrame` loop, and the score and lives are drawn onto the canvas — driving React at 60 fps would spend the frame budget on reconciliation and hand frame timing to React's scheduler. React mounts the canvas and re-renders only on discrete events (pause, level complete, game over).

No backend, no API and no dependencies beyond what the site already ships; the whole game adds roughly 34 KB to the bundle.

## Blog

Markdown-based blog sourced from `.md` files in `src/content/blog/`. Adding a post is as simple as dropping a `.md` file with the required frontmatter and rebuilding.

### Frontmatter format

```yaml
---
title: Post Title
date: 2026-06-19
description: One-line summary shown on the index page.
---
```

## Technology Stack

| Layer | Technology |
|---|---|
| Build tool | [Vite](https://vitejs.dev/) v8 |
| Framework | [React](https://react.dev/) v19 + TypeScript |
| Routing | [React Router](https://reactrouter.com/) v7 |
| Data fetching & caching | [TanStack Query](https://tanstack.com/query) v5 |
| Styling | [Tailwind CSS](https://tailwindcss.com/) v3 (dark mode) |
| Charts | [Recharts](https://recharts.org/) v3 |
| Map | [Leaflet](https://leafletjs.com/) + [react-leaflet](https://react-leaflet.js.org/) |
| Markdown | [marked](https://marked.js.org/) |
| Icons | [Lucide React](https://lucide.dev/) |
| Backend proxy | AWS Lambda (Node.js) via Function URL / Amplify rewrite |

## Prerequisites

- [Node.js](https://nodejs.org/) v22 or higher (see `.nvmrc`)
- npm v9 or higher

## Getting Started

**1. Install dependencies**

```bash
npm install
```

**2. Start the development server**

```bash
npm run dev
```

The app will be available at [http://localhost:5173](http://localhost:5173).

## Other Commands

```bash
# Type-check and build for production
npm run build

# Preview the production build locally
npm run preview

# Run the linter
npm run lint
```

## Project Structure

```
lambda/
└── planet-positions/
    └── index.mjs            # planetPositions Lambda — JPL Horizons proxy + daily cache
src/
├── components/
│   ├── EventsList.tsx       # Scrollable list of individual earthquake events
│   ├── Layout.tsx           # Shared nav, footer, and page shell
│   ├── MagnitudeChart.tsx   # Recharts bar chart by magnitude band
│   ├── MonthSelector.tsx    # Month/year picker dropdown
│   ├── RegionTable.tsx      # Top regions table with band breakdown
│   └── SummaryCards.tsx     # Top-line summary metric cards
├── content/
│   └── blog/                # Markdown blog posts (drop .md files here)
├── lib/
│   ├── arkanoid/            # Game engine: constants, physics, levels, render, audio
│   ├── api.ts               # USGS API fetch, region parsing, magnitude banding
│   ├── blog.ts              # Blog post loader and frontmatter parser
│   ├── process.ts           # Data aggregation and transformation
│   └── utils.ts             # Tailwind class merge utility
├── pages/
│   ├── BlogPage.tsx         # Blog post index
│   ├── ArkanoidPage.tsx     # Arkanoid game (canvas host + overlays)
│   ├── BlogPostPage.tsx     # Individual blog post renderer
│   ├── EQPage.tsx           # Earthquake monitor dashboard
│   ├── ISSPage.tsx          # ISS live tracker
│   ├── LandingPage.tsx      # Personal home page
│   ├── PlanetsPage.tsx      # Planetary orrery
│   └── ProjectsPage.tsx     # Project index
├── App.tsx                  # Route definitions
├── main.tsx                 # React entry point, QueryClientProvider setup
└── index.css                # Tailwind directives, global styles
```
