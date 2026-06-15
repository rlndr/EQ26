import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchEarthquakes } from '../lib/api'
import { processEarthquakes } from '../lib/process'
import MonthSelector, { getDefaultMonth } from '../components/MonthSelector'
import SummaryCards from '../components/SummaryCards'
import MagnitudeChart from '../components/MagnitudeChart'
import RegionTable from '../components/RegionTable'
import EventsList from '../components/EventsList'

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

export default function EQPage() {
  const defaultMonth = getDefaultMonth()
  const [year, setYear] = useState(defaultMonth.year)
  const [month, setMonth] = useState(defaultMonth.month)
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)

  const { data: features, isLoading, isError, error } = useQuery({
    queryKey: ['earthquakes', year, month],
    queryFn: () => fetchEarthquakes(year, month),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  })

  const processed = features ? processEarthquakes(features) : null

  function handleMonthChange(y: number, m: number) {
    setYear(y)
    setMonth(m)
    setSelectedRegion(null)
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-semibold text-zinc-100">
            {MONTH_NAMES[month - 1]} {year}
          </h1>
          <span className="text-sm text-zinc-500">Monthly Seismic Report — M5.0+</span>
        </div>
        <MonthSelector year={year} month={month} onChange={handleMonthChange} />
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
          <SummaryCards data={processed} totalEvents={features.length} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MagnitudeChart byBand={processed.byBand} />
            <RegionTable
              byRegion={processed.byRegion}
              selectedRegion={selectedRegion}
              onSelectRegion={(r) => setSelectedRegion(r === selectedRegion ? null : r)}
            />
          </div>
          <EventsList
            features={features}
            selectedRegion={selectedRegion}
            onClearFilter={() => setSelectedRegion(null)}
          />
        </>
      )}

      {!isLoading && !isError && features && features.length === 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
          <p className="text-zinc-400 font-medium mb-1">No earthquakes recorded</p>
          <p className="text-zinc-600 text-sm">
            No M5.0+ events were recorded for {MONTH_NAMES[month - 1]} {year}.
          </p>
        </div>
      )}
    </main>
  )
}
