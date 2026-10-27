/** Hermite ease, 0 → 1 with zero slope at both ends */
export function smoothstep(u: number) {
  const x = Math.min(1, Math.max(0, u))
  return x * x * (3 - 2 * x)
}

/**
 * Rotate (x, y, z) about X, then Y, then Z, writing the result to out[o], out[o+1], out[o+2].
 * Writes into a caller's array so the per-frame loop allocates nothing.
 */
export function rotate(x: number, y: number, z: number, ax: number, ay: number, az: number, out: Float32Array, o: number) {
  const cx = Math.cos(ax), sx = Math.sin(ax)
  const cy = Math.cos(ay), sy = Math.sin(ay)
  const cz = Math.cos(az), sz = Math.sin(az)
  const y1 = y * cx - z * sx
  const z1 = y * sx + z * cx
  const x2 = x * cy + z1 * sy
  const z2 = -x * sy + z1 * cy
  out[o] = x2 * cz - y1 * sz
  out[o + 1] = x2 * sz + y1 * cz
  out[o + 2] = z2
}

/** A seed for a fresh look each time a pattern is shown */
export const randomSeed = () => (Math.random() * 2 ** 32) >>> 0

/**
 * mulberry32: small, fast, and the same sequence for the same seed, so verify.ts can reproduce
 * exactly what an effect drew. Returns floats in [0, 1).
 */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 2D gradient (Perlin) noise from a seeded permutation table. Smooth and continuous, output
 * within about ±0.5 (verify.ts measures it). One instance per field; build it once, not per frame.
 */
export function noise2d(seed: number) {
  const rand = rng(seed)
  const perm = new Uint8Array(512)
  for (let i = 0; i < 256; i++) perm[i] = i
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = perm[i]
    perm[i] = perm[j]
    perm[j] = tmp
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i]

  // Eight gradient directions; dot product with the offset to the corner
  const grad = (hash: number, x: number, y: number) => {
    switch (hash & 7) {
      case 0: return x + y
      case 1: return x - y
      case 2: return -x + y
      case 3: return -x - y
      case 4: return x
      case 5: return -x
      case 6: return y
      default: return -y
    }
  }
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

  return (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const X = xi & 255
    const Y = yi & 255
    const u = fade(xf)
    const v = fade(yf)
    const aa = perm[perm[X] + Y]
    const ab = perm[perm[X] + Y + 1]
    const ba = perm[perm[X + 1] + Y]
    const bb = perm[perm[X + 1] + Y + 1]
    const x1 = grad(aa, xf, yf) + u * (grad(ba, xf - 1, yf) - grad(aa, xf, yf))
    const x2 = grad(ab, xf, yf - 1) + u * (grad(bb, xf - 1, yf - 1) - grad(ab, xf, yf - 1))
    return (x1 + v * (x2 - x1)) * 0.5
  }
}

/**
 * Rotate the 4D point at p[o..o+3] in place, in the plane of axes i and j (0–3 = x, y, z, w),
 * by the angle whose cosine and sine are given (computed once per frame, not per point).
 */
export function rotate4(p: Float64Array, o: number, i: number, j: number, cos: number, sin: number) {
  const a = p[o + i]
  const b = p[o + j]
  p[o + i] = a * cos - b * sin
  p[o + j] = a * sin + b * cos
}
