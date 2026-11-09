import { useState, type FormEvent } from 'react'
import { Copy, Eye, LocateFixed, Search } from 'lucide-react'
import { searchPlaces } from '../../lib/aurora/feeds'
import { BAND_STYLE, formatLatLon } from '../../lib/aurora/format'
import type { Place } from '../../lib/aurora/parse'
import type { Band, Factor, Tone } from '../../lib/aurora/visibility'
import type { ReactNode } from 'react'

export interface Spot {
  lat: number
  lon: number
  name: string
}

const PRESETS: Spot[] = [
  { name: 'Tromsø', lat: 69.65, lon: 18.96 },
  { name: 'Fairbanks', lat: 64.84, lon: -147.72 },
  { name: 'Reykjavík', lat: 64.15, lon: -21.94 },
  { name: 'Yellowknife', lat: 62.45, lon: -114.37 },
  { name: 'Hobart', lat: -42.88, lon: 147.33 },
]

const TONE_DOT: Record<Tone, string> = { good: 'bg-emerald-400', fair: 'bg-amber-400', poor: 'bg-zinc-600' }

const chip = 'px-2.5 py-1 rounded border border-zinc-700 text-xs text-zinc-300 hover:text-brass hover:border-brass transition-colors'

interface Props {
  spot: Spot | null
  onChoose: (spot: Spot) => void
  band: Band | null
  factors: Factor[]
  simulated: boolean
  onLookUp: () => void
  canLookUp: boolean
  globeAvailable: boolean
  onShare: () => void
  shared: boolean
  children?: ReactNode
}

export default function ViewingPanel({ spot, onChoose, band, factors, simulated, onLookUp, canLookUp, globeAvailable, onShare, shared, children }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)

  const search = async (ev: FormEvent) => {
    ev.preventDefault()
    const name = query.trim()
    if (name.length < 2) return
    setSearching(true)
    setMessage(null)
    try {
      const places = await searchPlaces(name)
      setResults(places)
      if (places.length === 0) setMessage(`No places found for “${name}”.`)
    } catch {
      setResults(null)
      setMessage('Place search is unavailable right now. You can still click the globe.')
    } finally {
      setSearching(false)
    }
  }

  // Only ever runs from this button: the browser's permission prompt should not greet a page load
  const locate = () => {
    if (!navigator.geolocation) {
      setMessage('This browser cannot share a location. Try searching instead.')
      return
    }
    setLocating(true)
    setMessage(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        onChoose({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: 'Your location' })
      },
      () => {
        setLocating(false)
        setMessage('Could not get your location. Try searching instead.')
      },
      { maximumAge: 600_000, timeout: 15_000 },
    )
  }

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h2 className="text-xs uppercase tracking-[0.15em] text-zinc-500 mb-3">Can I see it?</h2>

      <form onSubmit={search} className="flex gap-2 mb-2">
        <input
          value={query}
          onChange={(ev) => setQuery(ev.target.value)}
          placeholder="Search for a place"
          aria-label="Search for a place"
          className="flex-1 min-w-0 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-brass"
        />
        <button type="submit" disabled={searching} aria-label="Search" className="px-2.5 rounded border border-zinc-700 text-zinc-400 hover:text-brass hover:border-brass transition-colors disabled:opacity-50">
          <Search size={15} />
        </button>
        <button type="button" onClick={locate} disabled={locating} aria-label="Use my location" title="Use my location" className="px-2.5 rounded border border-zinc-700 text-zinc-400 hover:text-brass hover:border-brass transition-colors disabled:opacity-50">
          <LocateFixed size={15} />
        </button>
      </form>

      {message && <p className="text-xs text-zinc-500 mb-2">{message}</p>}

      {results && results.length > 0 && (
        <ul className="mb-3 divide-y divide-zinc-800 border border-zinc-800 rounded">
          {results.map((place) => (
            <li key={place.id}>
              <button
                onClick={() => {
                  setResults(null)
                  setQuery('')
                  onChoose({ lat: place.lat, lon: place.lon, name: place.name })
                }}
                className="w-full text-left px-2.5 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800/70 transition-colors"
              >
                {place.name}<span className="text-zinc-500 text-xs ml-2">{place.region}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1.5 mb-4">
        {PRESETS.map((p) => (
          <button key={p.name} onClick={() => onChoose(p)} className={spot?.name === p.name ? 'px-2.5 py-1 rounded border border-brass bg-brass/10 text-xs text-brass' : chip}>
            {p.name}
          </button>
        ))}
      </div>

      {!spot && <p className="text-sm text-zinc-500">{globeAvailable ? 'Click anywhere on the globe, or choose a place above.' : 'Choose a place above.'}</p>}

      {spot && (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-sm text-zinc-300">
              {spot.name}
              {spot.name !== formatLatLon(spot.lat, spot.lon) && <span className="text-xs text-zinc-500 font-mono ml-2">{formatLatLon(spot.lat, spot.lon)}</span>}
            </p>
            {simulated && <span className="text-xs text-amber-400">Simulated</span>}
          </div>
          <p className={`text-3xl font-semibold mt-1 mb-3 ${band ? BAND_STYLE[band].text : 'text-zinc-500'}`}>{band ?? '…'}</p>

          <dl className="space-y-1.5 mb-4">
            {factors.map((f) => (
              <div key={f.label} className="flex items-baseline gap-2 text-sm">
                <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 translate-y-[-2px] ${TONE_DOT[f.tone]}`} aria-label={f.tone} />
                <dt className="text-zinc-500 w-16 shrink-0">{f.label}</dt>
                <dd className="text-zinc-200">{f.text}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap gap-2 mb-4">
            {globeAvailable && <button onClick={onLookUp} disabled={!canLookUp} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-brass bg-brass/10 text-sm text-brass hover:bg-brass/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <Eye size={15} /> Look up from here
            </button>}
            <button onClick={onShare} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-zinc-700 text-sm text-zinc-400 hover:text-brass hover:border-brass transition-colors">
              <Copy size={14} /> {shared ? 'Link copied' : 'Share'}
            </button>
          </div>

          {children}

          <p className="text-xs text-zinc-600 mt-3">The verdict is this site&apos;s own estimate from the factors above, not a NOAA forecast.</p>
        </>
      )}
    </section>
  )
}
