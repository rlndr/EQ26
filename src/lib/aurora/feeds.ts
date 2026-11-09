import { queryOptions } from '@tanstack/react-query'
import {
  parseAlerts, parseAurora, parseClouds, parseKpForecast, parsePlaces, parsePropagated,
  parseRealtimeWind, parseReplayFrames, parseScales, parseXray,
} from './parse'

/** All SWPC feeds and images send `Access-Control-Allow-Origin: *`, so no proxy is involved */
export const SWPC = 'https://services.swpc.noaa.gov'

const MINUTE = 60_000
const FIVE_MINUTES = 5 * MINUTE

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} returned ${res.status}`)
  return res.json()
}

// TanStack stops refetchInterval while the tab is hidden by default, so a background tab costs nothing

export const auroraQuery = queryOptions({
  queryKey: ['aurora', 'grid'],
  queryFn: async () => parseAurora(await getJson(`${SWPC}/json/ovation_aurora_latest.json`)),
  refetchInterval: FIVE_MINUTES,
  staleTime: MINUTE,
})

export const propagatedWindQuery = queryOptions({
  queryKey: ['aurora', 'wind', 'propagated'],
  queryFn: async () => parsePropagated(await getJson(`${SWPC}/products/geospace/propagated-solar-wind-1-hour.json`)),
  refetchInterval: MINUTE,
  staleTime: 30_000,
})

export const windHistoryQuery = (enabled: boolean) => queryOptions({
  queryKey: ['aurora', 'wind', 'history'],
  queryFn: async () => {
    const [plasma, mag] = await Promise.all([
      getJson(`${SWPC}/json/rtsw/rtsw_wind_1m.json`),
      getJson(`${SWPC}/json/rtsw/rtsw_mag_1m.json`),
    ])
    return parseRealtimeWind(plasma, mag)
  },
  enabled,
  refetchInterval: enabled ? FIVE_MINUTES : false,
  staleTime: MINUTE,
})

export const kpForecastQuery = queryOptions({
  queryKey: ['aurora', 'kp'],
  queryFn: async () => parseKpForecast(await getJson(`${SWPC}/products/noaa-planetary-k-index-forecast.json`)),
  refetchInterval: FIVE_MINUTES,
  staleTime: MINUTE,
})

export const scalesQuery = queryOptions({
  queryKey: ['aurora', 'scales'],
  queryFn: async () => parseScales(await getJson(`${SWPC}/products/noaa-scales.json`)),
  refetchInterval: FIVE_MINUTES,
  staleTime: MINUTE,
})

export const alertsQuery = queryOptions({
  queryKey: ['aurora', 'alerts'],
  queryFn: async () => parseAlerts(await getJson(`${SWPC}/products/alerts.json`)),
  refetchInterval: FIVE_MINUTES,
  staleTime: MINUTE,
})

export const xrayQuery = (enabled: boolean) => queryOptions({
  queryKey: ['aurora', 'xray'],
  queryFn: async () => parseXray(await getJson(`${SWPC}/json/goes/primary/xrays-1-day.json`)),
  enabled,
  refetchInterval: enabled ? FIVE_MINUTES : false,
  staleTime: MINUTE,
})

export const replayFramesQuery = (hemisphere: 'north' | 'south', enabled: boolean) => queryOptions({
  queryKey: ['aurora', 'replay', hemisphere],
  queryFn: async () => parseReplayFrames(await getJson(`${SWPC}/products/animations/ovation_${hemisphere}_24h.json`)),
  enabled,
  staleTime: FIVE_MINUTES,
})

/**
 * Coordinates are rounded before they leave the browser: 0.1° is about 11 km, plenty for a cloud
 * forecast. The key uses the rounded values too, so nearby clicks share one request.
 */
export const roundCoord = (x: number) => Math.round(x * 10) / 10

export const cloudsQuery = (lat: number | null, lon: number | null) => {
  const la = lat === null ? null : roundCoord(lat)
  const lo = lon === null ? null : roundCoord(lon)
  return queryOptions({
    queryKey: ['aurora', 'clouds', la, lo],
    queryFn: async () => {
      const params = new URLSearchParams({
        latitude: String(la), longitude: String(lo), hourly: 'cloud_cover', forecast_days: '2', timezone: 'auto',
      })
      return parseClouds(await getJson(`https://api.open-meteo.com/v1/forecast?${params}`))
    },
    enabled: la !== null && lo !== null,
    staleTime: 15 * MINUTE,
    refetchInterval: 30 * MINUTE,
  })
}

export async function searchPlaces(name: string) {
  const params = new URLSearchParams({ name, count: '5' })
  return parsePlaces(await getJson(`https://geocoding-api.open-meteo.com/v1/search?${params}`))
}

export const SUVI_WAVELENGTHS = ['304', '171', '195', '131', '094', '284'] as const
export type SuviWavelength = (typeof SUVI_WAVELENGTHS)[number]

export const suviImageUrl = (wavelength: SuviWavelength) =>
  `${SWPC}/images/animations/suvi/primary/${wavelength}/latest.png`

export const polarForecastImage = (hemisphere: 'northern' | 'southern') =>
  `${SWPC}/images/aurora-forecast-${hemisphere}-hemisphere.jpg`
