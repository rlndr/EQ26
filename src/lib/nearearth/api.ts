import { queryOptions } from '@tanstack/react-query'
import { parseFireballs, parseFlybys, parseObject, parseRisk, parseTrack } from './parse'

/** Same-origin path: ad blockers block direct fetches to *.lambda-url.on.aws */
const API = '/api/near-earth'
const MINUTE = 60_000

class NotFoundError extends Error {}

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${API}${path}`)
  if (res.status === 404) throw new NotFoundError(path)
  if (!res.ok) throw new Error(`${path} returned ${res.status}`)
  return res.json()
}

/** A 404 is a real answer here, such as Horizons not knowing an object, so retrying is pointless */
const retryUnlessMissing = (count: number, error: Error) => !(error instanceof NotFoundError) && count < 2

export const isNotFound = (error: unknown) => error instanceof NotFoundError

export const fireballsQuery = queryOptions({
  queryKey: ['near-earth', 'fireballs'],
  queryFn: async () => parseFireballs(await getJson('/fireballs')),
  staleTime: 30 * MINUTE,
})

export const flybysQuery = queryOptions({
  queryKey: ['near-earth', 'flybys'],
  queryFn: async () => parseFlybys(await getJson('/flybys')),
  staleTime: 15 * MINUTE,
  refetchInterval: 30 * MINUTE,
})

export const riskQuery = queryOptions({
  queryKey: ['near-earth', 'risk'],
  queryFn: async () => parseRisk(await getJson('/risk')),
  staleTime: 30 * MINUTE,
})

export const objectQuery = (des: string | null) => queryOptions({
  queryKey: ['near-earth', 'object', des],
  queryFn: async () => parseObject(await getJson(`/object/${encodeURIComponent(des ?? '')}`)),
  enabled: des !== null,
  staleTime: 30 * MINUTE,
  retry: retryUnlessMissing,
})

export const trackQuery = (des: string | null) => queryOptions({
  queryKey: ['near-earth', 'track', des],
  queryFn: async () => parseTrack(await getJson(`/track/${encodeURIComponent(des ?? '')}`)),
  enabled: des !== null,
  staleTime: 30 * MINUTE,
  retry: retryUnlessMissing,
})
