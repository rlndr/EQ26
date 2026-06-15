# land3r.net

A personal website built with React and TypeScript. The earthquake monitor is the first of several tools and projects hosted here.

## Pages

| Route | Description |
|---|---|
| `/` | Personal landing page |
| `/projects` | Project index |
| `/projects/earthquakes` | EQ26 — Global Earthquake Monitor |

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

## Technology Stack

| Layer | Technology |
|---|---|
| Build tool | [Vite](https://vitejs.dev/) v8 |
| Framework | [React](https://react.dev/) v19 + TypeScript |
| Routing | [React Router](https://reactrouter.com/) v7 |
| Data fetching & caching | [TanStack Query](https://tanstack.com/query) v5 |
| Styling | [Tailwind CSS](https://tailwindcss.com/) v3 (dark mode) |
| Charts | [Recharts](https://recharts.org/) v3 |
| Icons | [Lucide React](https://lucide.dev/) |

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
src/
├── components/
│   ├── EventsList.tsx       # Scrollable list of individual earthquake events
│   ├── Layout.tsx           # Shared nav, footer, and page shell
│   ├── MagnitudeChart.tsx   # Recharts bar chart by magnitude band
│   ├── MonthSelector.tsx    # Month/year picker dropdown
│   ├── RegionTable.tsx      # Top regions table with band breakdown
│   └── SummaryCards.tsx     # Top-line summary metric cards
├── lib/
│   ├── api.ts               # USGS API fetch, region parsing, magnitude banding
│   ├── process.ts           # Data aggregation and transformation
│   └── utils.ts             # Tailwind class merge utility
├── pages/
│   ├── EQPage.tsx           # Earthquake monitor dashboard
│   ├── LandingPage.tsx      # Personal home page
│   └── ProjectsPage.tsx     # Project index
├── App.tsx                  # Route definitions
├── main.tsx                 # React entry point, QueryClientProvider setup
└── index.css                # Tailwind directives, global styles
```
