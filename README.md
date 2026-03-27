# EQ26 — Earthquake Monitor

A dark, compact web application for exploring the frequency and severity of earthquakes worldwide. Data is sourced in real time from the USGS Earthquake Hazards Program public API.

## Features

- **Month selector** — browse any month going back 2 years
- **Summary cards** — total events, max magnitude, regions affected, and strongest event location
- **Magnitude chart** — bar chart breaking down event counts by magnitude band (M5.x, M6.x, M7.x, M8+)
- **Region table** — top 15 affected regions with per-band counts
- **Events list** — full scrollable list of events sorted by magnitude, each linking to the USGS event page

Only earthquakes with a magnitude of **5.0 or higher** are included.

## Data Source

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
| Data fetching & caching | [TanStack Query](https://tanstack.com/query) v5 |
| Styling | [Tailwind CSS](https://tailwindcss.com/) v3 (dark mode) |
| Charts | [Recharts](https://recharts.org/) v3 |
| Icons | [Lucide React](https://lucide.dev/) |

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
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
│   ├── MagnitudeChart.tsx   # Recharts bar chart by magnitude band
│   ├── MonthSelector.tsx    # Month/year picker dropdown
│   ├── RegionTable.tsx      # Top regions table with band breakdown
│   └── SummaryCards.tsx     # Top-line summary metric cards
├── lib/
│   ├── api.ts               # USGS API fetch, region parsing, magnitude banding
│   ├── process.ts           # Data aggregation and transformation
│   └── utils.ts             # Tailwind class merge utility
├── App.tsx                  # Root component, query orchestration, layout
├── main.tsx                 # React entry point, QueryClientProvider setup
└── index.css                # Tailwind directives, global styles
```
