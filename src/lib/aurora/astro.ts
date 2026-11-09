/**
 * Sun and Moon positions, from the Astronomical Almanac's low-precision formulae. Good to about
 * 0.01° for the Sun and 0.3° for the Moon, far tighter than a day/night line or a "is the Moon up"
 * test needs. verify.ts checks them against values captured from the US Naval Observatory.
 *
 * Earth-fixed vectors use x through (0°N, 0°E), y through the north pole and z through 90°W. That
 * is right-handed with y up, which is what the shader and camera expect.
 */

export const RAD = Math.PI / 180
export const DEG = 180 / Math.PI
export const EARTH_RADIUS_KM = 6371

export type Vec3 = readonly [number, number, number]

export interface LatLon {
  lat: number
  lon: number
}

export const wrap360 = (deg: number) => ((deg % 360) + 360) % 360
export const wrap180 = (deg: number) => {
  const w = wrap360(deg)
  return w > 180 ? w - 360 : w
}
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

export function latLonToVec(lat: number, lon: number): Vec3 {
  const cosLat = Math.cos(lat * RAD)
  return [cosLat * Math.cos(lon * RAD), Math.sin(lat * RAD), -cosLat * Math.sin(lon * RAD)]
}

export function vecToLatLon(v: Vec3): LatLon {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  return { lat: Math.asin(clamp(v[1] / len, -1, 1)) * DEG, lon: Math.atan2(-v[2], v[0]) * DEG }
}

/** Days since the J2000.0 epoch */
const daysJ2000 = (ms: number) => ms / 86_400_000 + 2440587.5 - 2451545

export interface Equatorial {
  raDeg: number
  decDeg: number
}

function eclipticToEquatorial(lonDeg: number, latDeg: number, n: number): Equatorial {
  const obliquity = (23.439 - 4e-7 * n) * RAD
  const l = lonDeg * RAD
  const b = latDeg * RAD
  const x = Math.cos(b) * Math.cos(l)
  const y = Math.cos(obliquity) * Math.cos(b) * Math.sin(l) - Math.sin(obliquity) * Math.sin(b)
  const z = Math.sin(obliquity) * Math.cos(b) * Math.sin(l) + Math.cos(obliquity) * Math.sin(b)
  return { raDeg: wrap360(Math.atan2(y, x) * DEG), decDeg: Math.asin(z) * DEG }
}

export function sunEquatorial(ms: number): Equatorial {
  const n = daysJ2000(ms)
  const meanLon = 280.46 + 0.9856474 * n
  const anomaly = (357.528 + 0.9856003 * n) * RAD
  const lon = meanLon + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)
  return eclipticToEquatorial(lon, 0, n)
}

const sind = (deg: number) => Math.sin(deg * RAD)
const cosd = (deg: number) => Math.cos(deg * RAD)

export interface MoonPosition extends Equatorial {
  /** Horizontal parallax, degrees: how far the Moon appears lowered for someone on the surface */
  parallaxDeg: number
}

export function moonEquatorial(ms: number): MoonPosition {
  const n = daysJ2000(ms)
  const t = n / 36525
  const lon = 218.32 + 481267.881 * t
    + 6.29 * sind(135.0 + 477198.87 * t)
    - 1.27 * sind(259.3 - 413335.36 * t)
    + 0.66 * sind(235.7 + 890534.22 * t)
    + 0.21 * sind(269.9 + 954397.74 * t)
    - 0.19 * sind(357.5 + 35999.05 * t)
    - 0.11 * sind(186.5 + 966404.03 * t)
  const lat = 5.13 * sind(93.3 + 483202.02 * t)
    + 0.28 * sind(228.2 + 960400.89 * t)
    - 0.28 * sind(318.3 + 6003.15 * t)
    - 0.17 * sind(217.6 - 407332.21 * t)
  const parallaxDeg = 0.9508
    + 0.0518 * cosd(135.0 + 477198.87 * t)
    + 0.0095 * cosd(259.3 - 413335.36 * t)
    + 0.0078 * cosd(235.7 + 890534.22 * t)
    + 0.0028 * cosd(269.9 + 954397.74 * t)
  return { ...eclipticToEquatorial(lon, lat, n), parallaxDeg }
}

/** Greenwich hour angle of a body: how far west of Greenwich it is, 0–360° */
export function greenwichHourAngle(ms: number, raDeg: number) {
  const gmst = 280.46061837 + 360.98564736629 * daysJ2000(ms)
  return wrap360(gmst - raDeg)
}

export interface Horizontal {
  altDeg: number
  azDeg: number
}

/** Altitude and azimuth (from north, clockwise) for a body at the given declination and GHA */
export function horizontal(lat: number, lon: number, decDeg: number, ghaDeg: number): Horizontal {
  const hourAngle = (ghaDeg + lon) * RAD
  const phi = lat * RAD
  const dec = decDeg * RAD
  const sinAlt = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(hourAngle)
  const y = -Math.cos(dec) * Math.sin(hourAngle)
  const x = Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.cos(hourAngle) * Math.sin(phi)
  return { altDeg: Math.asin(clamp(sinAlt, -1, 1)) * DEG, azDeg: wrap360(Math.atan2(y, x) * DEG) }
}

/** The point on Earth where the Sun is directly overhead */
export function subSolarPoint(ms: number): LatLon {
  const sun = sunEquatorial(ms)
  return { lat: sun.decDeg, lon: wrap180(-greenwichHourAngle(ms, sun.raDeg)) }
}

export function subLunarPoint(ms: number): LatLon {
  const moon = moonEquatorial(ms)
  return { lat: moon.decDeg, lon: wrap180(-greenwichHourAngle(ms, moon.raDeg)) }
}

export function sunAltitude(lat: number, lon: number, ms: number) {
  const sun = sunEquatorial(ms)
  return horizontal(lat, lon, sun.decDeg, greenwichHourAngle(ms, sun.raDeg)).altDeg
}

export interface MoonState {
  /** As seen from the surface, so lowered by parallax */
  altDeg: number
  azDeg: number
  /** Fraction of the disc lit, 0–1 */
  illumination: number
}

export function moonState(lat: number, lon: number, ms: number): MoonState {
  const moon = moonEquatorial(ms)
  const h = horizontal(lat, lon, moon.decDeg, greenwichHourAngle(ms, moon.raDeg))
  return {
    altDeg: h.altDeg - moon.parallaxDeg * Math.cos(h.altDeg * RAD),
    azDeg: h.azDeg,
    illumination: moonIllumination(ms),
  }
}

export function moonIllumination(ms: number) {
  const moon = moonEquatorial(ms)
  const sun = sunEquatorial(ms)
  const cosElongation = Math.sin(moon.decDeg * RAD) * Math.sin(sun.decDeg * RAD)
    + Math.cos(moon.decDeg * RAD) * Math.cos(sun.decDeg * RAD) * Math.cos((moon.raDeg - sun.raDeg) * RAD)
  return (1 - cosElongation) / 2
}
