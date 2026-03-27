import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity } from 'lucide-react'
import { fetchEarthquakes } from './lib/api'
import { processEarthquakes } from './lib/process'
import MonthSelector, { getDefaultMonth } from './components/MonthSelector'
import SummaryCards from './components/SummaryCards'
import MagnitudeChart from './components/MagnitudeChart'
import RegionTable from './components/RegionTable'
import EventsList from './components/EventsList'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function SkeletonCard() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3 animate-pulse">
      <div className="h-3 bg-zinc-800 rounded w-24" />
      <div className="h-7 bg-zinc-800 rounded w-16" />
      <div className="h-3 bg-zinc-800 rounded w-32" />
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 animate-pulse" style={{ height: 300 }}>
          <div className="h-3 bg-zinc-800 rounded w-40 mb-4" />
          <div className="flex items-end gap-4 h-48">
            {[60, 35, 15, 5].map((h, i) => (
              <div key={i} className="flex-1 bg-zinc-800 rounded-t" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 animate-pulse" style={{ height: 300 }}>
          <div className="h-3 bg-zinc-800 rounded w-48 mb-4" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-3 py-2 border-b border-zinc-800/50">
              <div className="h-3 bg-zinc-800 rounded flex-1" />
              <div className="h-3 bg-zinc-800 rounded w-8" />
            </div>
          ))}
        </div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 animate-pulse" style={{ height: 200 }}>
        <div className="h-3 bg-zinc-800 rounded w-24 mb-4" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 py-2.5 border-b border-zinc-800/50">
            <div className="h-5 bg-zinc-800 rounded w-14" />
            <div className="h-5 bg-zinc-800 rounded flex-1" />
            <div className="h-5 bg-zinc-800 rounded w-32" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function App() {
  const defaultMonth = getDefaultMonth()
  const [year, setYear] = useState(defaultMonth.year)
  const [month, setMonth] = useState(defaultMonth.month)
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)

  const { data: features, isLoading, isError, error } = useQuery({
    queryKey: ['earthquakes', year, month],
    queryFn: () => fetchEarthquakes(year, month),
  })

  const processed = features ? processEarthquakes(features) : null

  function handleMonthChange(y: number, m: number) {
    setYear(y)
    setMonth(m)
    setSelectedRegion(null)
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Activity size={20} className="text-rose-500" />
              <span className="text-lg font-bold text-zinc-100 tracking-tight">EQ26</span>
            </div>
            <span className="text-zinc-500 text-sm hidden sm:block">Earthquake Monitor</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500 hidden sm:block">
              Data: USGS Earthquake Hazards Program
            </span>
            <MonthSelector year={year} month={month} onChange={handleMonthChange} />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-5 flex flex-col gap-4">
        {/* Period title */}
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-semibold text-zinc-100">
            {MONTH_NAMES[month - 1]} {year}
          </h1>
          <span className="text-sm text-zinc-500">Monthly Seismic Report — M5.0+</span>
        </div>

        {isLoading && <LoadingSkeleton />}

        {isError && (
          <div className="bg-red-950/40 border border-red-900/60 rounded-lg p-6 text-center">
            <p className="text-red-400 font-medium mb-1">Failed to load earthquake data</p>
            <p className="text-red-500/70 text-sm">
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </p>
            <p className="text-zinc-600 text-xs mt-3">
              Check your internet connection or try a different time period.
            </p>
          </div>
        )}

        {processed && features && (
          <>
            {/* Summary cards */}
            <SummaryCards data={processed} totalEvents={features.length} />

            {/* Chart + Region table */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <MagnitudeChart byBand={processed.byBand} />
              <RegionTable
                byRegion={processed.byRegion}
                selectedRegion={selectedRegion}
                onSelectRegion={(r) => setSelectedRegion(r === selectedRegion ? null : r)}
              />
            </div>

            {/* Events list */}
            <EventsList
              features={features}
              selectedRegion={selectedRegion}
              onClearFilter={() => setSelectedRegion(null)}
            />
          </>
        )}

        {/* No data state (loaded but empty) */}
        {!isLoading && !isError && features && features.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
            <p className="text-zinc-400 font-medium mb-1">No earthquakes recorded</p>
            <p className="text-zinc-600 text-sm">
              No M5.0+ events were recorded for {MONTH_NAMES[month - 1]} {year}.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 mt-8 py-4">
        <div className="max-w-6xl mx-auto px-4 text-center text-xs text-zinc-700">
          Data sourced from the{' '}
          <a
            href="https://earthquake.usgs.gov/fdsnws/event/1/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-600 hover:text-zinc-400 underline transition-colors"
          >
            USGS Earthquake Hazards Program API
          </a>
          . EQ26 — {new Date().getUTCFullYear()}
        </div>
      </footer>
    </div>
  )
}
