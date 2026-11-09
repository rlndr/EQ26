import { clamp, latLonToVec, RAD, vecToLatLon, wrap180, type LatLon, type Vec3 } from './astro'

export const ORBIT_FOV = 36
export const GROUND_FOV = 72
export const MIN_DIST = 1.32
export const MAX_DIST = 6
export const DEFAULT_DIST = 3.4
export const MAX_ORBIT_LAT = 88
/** Eye height in Earth radii: about 2 km, enough to stay clear of the surface sphere */
export const GROUND_ALTITUDE = 0.0003

export interface Pose {
  pos: Vec3
  right: Vec3
  up: Vec3
  forward: Vec3
  /** Vertical field of view, degrees */
  fov: number
}

const add = (a: Vec3, b: Vec3, s = 1): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const normalize = (a: Vec3): Vec3 => {
  const len = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / len, a[1] / len, a[2] / len]
}
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => add(scale(a, 1 - t), b, t)

const WORLD_NORTH: Vec3 = [0, 1, 0]

export const ease = (t: number) => {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

const smoothstep = (a: number, b: number, x: number) => ease((x - a) / (b - a))

function basis(pos: Vec3, forward: Vec3, upHint: Vec3, fov: number): Pose {
  const f = normalize(forward)
  const right = normalize(cross(f, upHint))
  return { pos, right, up: cross(right, f), forward: f, fov }
}

export function orbitPose(lat: number, lon: number, dist: number): Pose {
  const dir = latLonToVec(clamp(lat, -MAX_ORBIT_LAT, MAX_ORBIT_LAT), lon)
  return basis(scale(dir, dist), scale(dir, -1), WORLD_NORTH, ORBIT_FOV)
}

export interface LocalAxes {
  up: Vec3
  north: Vec3
  east: Vec3
}

export function localAxes(lat: number, lon: number): LocalAxes {
  const up = latLonToVec(clamp(lat, -89.9, 89.9), lon)
  const north = normalize(add(WORLD_NORTH, up, -dot(WORLD_NORTH, up)))
  return { up, north, east: cross(north, up) }
}

/** Heading is compass degrees; pitch is degrees above the horizon */
export function groundPose(lat: number, lon: number, heading: number, pitch: number): Pose {
  const { up, north, east } = localAxes(lat, lon)
  const h = heading * RAD
  const p = pitch * RAD
  const level = add(scale(north, Math.cos(h)), east, Math.sin(h))
  const forward = add(scale(level, Math.cos(p)), up, Math.sin(p))
  return basis(scale(up, 1 + GROUND_ALTITUDE), forward, up, GROUND_FOV)
}

export interface OrbitState extends LatLon {
  dist: number
}

export interface GroundState extends LatLon {
  heading: number
  pitch: number
}

/** The camera along the descent, s = 0 in orbit, s = 1 standing on the ground */
export function flightPose(orbit: OrbitState, ground: GroundState, s: number): Pose {
  const startDir = latLonToVec(orbit.lat, orbit.lon)
  const endDir = latLonToVec(ground.lat, ground.lon)
  const dir = normalize(mix(startDir, endDir, ease(s / 0.75)))
  const radius = Math.exp(
    Math.log(orbit.dist) + (Math.log(1 + GROUND_ALTITUDE) - Math.log(orbit.dist)) * ease(s),
  )
  const end = groundPose(ground.lat, ground.lon, ground.heading, ground.pitch)
  const turn = smoothstep(0.5, 1, s)
  const looking = scale(dir, -1)
  const north = normalize(add(WORLD_NORTH, dir, -dot(WORLD_NORTH, dir)))
  return basis(
    scale(dir, radius),
    mix(looking, end.forward, turn),
    normalize(mix(north, end.up, turn)),
    ORBIT_FOV + (GROUND_FOV - ORBIT_FOV) * turn,
  )
}

/** Tangents of the half field of view; on a narrow screen the width is what must fit */
export function viewTangents(fov: number, aspect: number): [number, number] {
  const base = Math.tan((fov / 2) * RAD)
  const y = aspect < 1 ? base / aspect : base
  return [y * aspect, y]
}

/** World direction through a point on screen, x and y running −1 to 1 */
export function rayDirection(pose: Pose, x: number, y: number, aspect: number): Vec3 {
  const [tx, ty] = viewTangents(pose.fov, aspect)
  return normalize(add(add(pose.forward, pose.right, x * tx), pose.up, y * ty))
}

/** Latitude and longitude under a point on screen, or null if it misses the Earth */
export function pickSurface(pose: Pose, x: number, y: number, aspect: number): LatLon | null {
  const d = rayDirection(pose, x, y, aspect)
  const b = dot(pose.pos, d)
  const c = dot(pose.pos, pose.pos) - 1
  const h = b * b - c
  if (h < 0) return null
  const t = -b - Math.sqrt(h)
  if (t < 0) return null
  return vecToLatLon(add(pose.pos, d, t))
}

/** Screen position of a world point, for tests and overlays */
export function projectPoint(pose: Pose, p: Vec3, aspect: number): [number, number] | null {
  const v = add(p, pose.pos, -1)
  const depth = dot(v, pose.forward)
  if (depth <= 0) return null
  const [tx, ty] = viewTangents(pose.fov, aspect)
  return [dot(v, pose.right) / (depth * tx), dot(v, pose.up) / (depth * ty)]
}

/** Interpolates longitude the short way round */
export const lerpLon = (a: number, b: number, t: number) => wrap180(a + wrap180(b - a) * t)
