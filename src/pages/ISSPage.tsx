import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const ISS_API_URL = 'https://my7z6vqwwchsm5tj5wut4hhf7y0yyqyb.lambda-url.us-west-2.on.aws/'

interface ISSPosition {
  latitude: number
  longitude: number
  timestamp: number
  stale: boolean
}

async function fetchISSPosition(): Promise<ISSPosition> {
  const res = await fetch(ISS_API_URL)
  if (!res.ok) throw new Error('Failed to fetch ISS position')
  return res.json()
}

const issIcon = L.divIcon({
  className: '',
  html: `<div style="width:14px;height:14px;background:#f43f5e;border-radius:50%;border:2px solid #fff;box-shadow:0 0 10px 3px rgba(244,63,94,0.6);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

function ISSMarker({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap()
  const markerRef = useRef<L.Marker | null>(null)

  useEffect(() => {
    markerRef.current = L.marker([lat, lon], { icon: issIcon }).addTo(map)
    return () => { markerRef.current?.remove() }
  }, [map])

  useEffect(() => {
    markerRef.current?.setLatLng([lat, lon])
  }, [lat, lon])

  return null
}

const stats = [
  { label: 'Altitude', value: '~408 km' },
  { label: 'Speed', value: '~17,150 mph' },
]

export default function ISSPage() {
  const { data, isError } = useQuery({
    queryKey: ['iss-position'],
    queryFn: fetchISSPosition,
    refetchInterval: 5000,
  })

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold text-zinc-100">ISS Tracker</h1>
        {data?.stale && (
          <span className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-1 rounded">
            Data may be delayed
          </span>
        )}
        {isError && (
          <span className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-1 rounded">
            Unable to fetch position
          </span>
        )}
      </div>
      <p className="text-zinc-400 mb-6">Live position of the International Space Station, updated every 5 seconds.</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
          <p className="text-xs text-zinc-500 mb-1">Latitude</p>
          <p className="text-sm font-mono text-zinc-100">{data ? `${data.latitude.toFixed(4)}°` : '—'}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
          <p className="text-xs text-zinc-500 mb-1">Longitude</p>
          <p className="text-sm font-mono text-zinc-100">{data ? `${data.longitude.toFixed(4)}°` : '—'}</p>
        </div>
        {stats.map(({ label, value }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
            <p className="text-xs text-zinc-500 mb-1">{label}</p>
            <p className="text-sm font-mono text-zinc-100">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl overflow-hidden border border-zinc-800" style={{ height: '520px' }}>
        <MapContainer
          center={[0, 0]}
          zoom={2}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {data && <ISSMarker lat={data.latitude} lon={data.longitude} />}
        </MapContainer>
      </div>
    </div>
  )
}
