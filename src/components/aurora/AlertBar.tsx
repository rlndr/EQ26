import { useQuery } from '@tanstack/react-query'
import { alertsQuery } from '../../lib/aurora/feeds'
import { timeAgo } from '../../lib/aurora/format'

const RECENT_MS = 48 * 3600_000

export default function AlertBar({ now }: { now: number }) {
  const { data, isError } = useQuery(alertsQuery)
  const latest = data?.find((a) => now - a.issuedAt < RECENT_MS)

  if (isError && !data) {
    return <p className="text-xs text-zinc-500">NOAA alerts are unavailable right now.</p>
  }
  if (!data) return <p className="text-xs text-zinc-500">Checking NOAA alerts…</p>
  if (!latest) return <p className="text-xs text-zinc-500">No NOAA alerts in the last 48 hours.</p>

  return (
    <details className="group text-xs">
      <summary className="cursor-pointer list-none flex flex-wrap items-baseline gap-x-2 text-zinc-300 hover:text-brass transition-colors">
        <span className="uppercase tracking-[0.15em] text-zinc-500">Latest alert</span>
        <span>{latest.headline}</span>
        <span className="text-zinc-500">{timeAgo(latest.issuedAt, now)}</span>
        <span className="text-zinc-600 group-open:hidden">Details</span>
      </summary>
      {/* NOAA's own bulletin text, shown as plain text */}
      <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs text-zinc-400 bg-zinc-950/60 border border-zinc-800 rounded p-3">{latest.message}</pre>
    </details>
  )
}
