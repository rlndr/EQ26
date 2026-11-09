import { DEG, latLonToVec, wrap360, type LatLon, type Vec3 } from './astro'

/**
 * Geomagnetic coordinates from a tilted dipole. The real field is lumpier, but a dipole is plenty
 * for the storm illustration and for the direction the curtains run. Pole position is IGRF-14 for
 * 2025, to the nearest 0.1°.
 */
export const DIPOLE_POLE: LatLon = { lat: 80.8, lon: -72.7 }

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const normalize = (a: Vec3): Vec3 => {
  const len = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / len, a[1] / len, a[2] / len]
}

export const POLE_AXIS: Vec3 = latLonToVec(DIPOLE_POLE.lat, DIPOLE_POLE.lon)
/** Two axes completing a right-handed frame about the pole, so angle grows eastward */
export const POLE_U1: Vec3 = normalize(cross([0, 1, 0], POLE_AXIS))
export const POLE_U2: Vec3 = cross(POLE_AXIS, POLE_U1)

export const magneticLatitudeVec = (v: Vec3) => Math.asin(Math.max(-1, Math.min(1, dot(v, POLE_AXIS)))) * DEG

/** Angle around the dipole axis, degrees, increasing eastward */
export const magneticAngleVec = (v: Vec3) => Math.atan2(dot(v, POLE_U2), dot(v, POLE_U1)) * DEG

export const magneticLatitude = (lat: number, lon: number) => magneticLatitudeVec(latLonToVec(lat, lon))

/** Magnetic local time, hours: 12 under the Sun's magnetic meridian, 0 on the night side */
export function magneticLocalTime(lat: number, lon: number, subSolar: LatLon) {
  const here = magneticAngleVec(latLonToVec(lat, lon))
  const sun = magneticAngleVec(latLonToVec(subSolar.lat, subSolar.lon))
  return wrap360(here - sun + 180) / 15
}
