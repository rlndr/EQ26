import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MAGNITUDE_BANDS, type RegionRow } from '../lib/process'

interface RegionTableProps {
  byRegion: RegionRow[]
  selectedRegion: string | null
  onSelectRegion: (region: string) => void
}

const BAND_TEXT: Record<string, string> = {
  'M5.x': 'text-amber-400',
  'M6.x': 'text-orange-400',
  'M7.x': 'text-red-400',
  'M8+': 'text-purple-400',
}

const PAGE_SIZE = 15

export default function RegionTable({ byRegion, selectedRegion, onSelectRegion }: RegionTableProps) {
  const [page, setPage] = useState(0)

  // Reset to first page whenever the dataset changes (month switch)
  useEffect(() => { setPage(0) }, [byRegion])

  const totalPages = Math.max(1, Math.ceil(byRegion.length / PAGE_SIZE))
  const rows = byRegion.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const globalOffset = page * PAGE_SIZE

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3">
      <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
        Top Regions by Event Count
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left py-2 pr-3 text-zinc-500 font-medium text-xs w-full">
                Region
              </th>
              <th className="text-right py-2 px-2 text-zinc-500 font-medium text-xs whitespace-nowrap">
                Total
              </th>
              {MAGNITUDE_BANDS.map((band) => (
                <th
                  key={band}
                  className={`text-right py-2 px-2 font-medium text-xs whitespace-nowrap ${BAND_TEXT[band]}`}
                >
                  {band}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-zinc-600 text-xs">
                  No data available
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const globalIdx = globalOffset + idx
                const isSelected = row.region === selectedRegion
                return (
                  <tr
                    key={row.region}
                    onClick={() => onSelectRegion(row.region)}
                    className={`border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors cursor-pointer ${
                      isSelected ? 'bg-zinc-700/40 ring-1 ring-inset ring-zinc-600' : globalIdx === 0 ? 'bg-zinc-800/20' : ''
                    }`}
                  >
                    <td className="py-2 pr-3 text-zinc-200 truncate max-w-[140px]">
                      <span className="text-zinc-600 mr-1.5 text-xs">{globalIdx + 1}.</span>
                      {row.region}
                    </td>
                    <td className="py-2 px-2 text-right text-zinc-100 font-semibold tabular-nums">
                      {row.total}
                    </td>
                    {MAGNITUDE_BANDS.map((band) => (
                      <td
                        key={band}
                        className={`py-2 px-2 text-right tabular-nums text-xs ${
                          row.bands[band] > 0 ? BAND_TEXT[band] : 'text-zinc-700'
                        }`}
                      >
                        {row.bands[band] > 0 ? row.bands[band] : '—'}
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {byRegion.length > 0 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-zinc-600">
            {byRegion.length} regions total
          </span>
          <div className="inline-flex items-center border border-zinc-700 rounded-md overflow-hidden bg-zinc-950 text-xs select-none">
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page === 0}
              aria-label="Previous page"
              className="flex items-center justify-center w-7 h-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 active:bg-zinc-700 disabled:opacity-25 disabled:cursor-not-allowed transition-colors border-r border-zinc-800"
            >
              <ChevronLeft size={13} strokeWidth={2} />
            </button>
            <span className="font-mono text-zinc-300 px-3 whitespace-nowrap">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page === totalPages - 1}
              aria-label="Next page"
              className="flex items-center justify-center w-7 h-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 active:bg-zinc-700 disabled:opacity-25 disabled:cursor-not-allowed transition-colors border-l border-zinc-800"
            >
              <ChevronRight size={13} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
