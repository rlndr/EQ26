/** Small deterministic PRNG, so the curtains look the same on every load */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** One octave of value noise with a whole number of cells, so it tiles */
function octave(size: number, cells: number, random: () => number, out: Float32Array, weight: number) {
  const lattice = new Float32Array(cells * cells)
  for (let i = 0; i < lattice.length; i++) lattice[i] = random()
  for (let y = 0; y < size; y++) {
    const gy = (y / size) * cells
    const y0 = Math.floor(gy)
    const y1 = (y0 + 1) % cells
    const fy = smooth(gy - y0)
    for (let x = 0; x < size; x++) {
      const gx = (x / size) * cells
      const x0 = Math.floor(gx)
      const x1 = (x0 + 1) % cells
      const fx = smooth(gx - x0)
      const top = lattice[y0 * cells + x0] * (1 - fx) + lattice[y0 * cells + x1] * fx
      const bottom = lattice[y1 * cells + x0] * (1 - fx) + lattice[y1 * cells + x1] * fx
      out[y * size + x] += (top * (1 - fy) + bottom * fy) * weight
    }
  }
}

/**
 * RGBA tiling noise for the curtains. Generated here rather than shipped as an image: it costs a
 * few milliseconds once and no download. Channels are independent; alpha has the finest detail,
 * which is what the vertical rays need.
 */
export function makeNoiseTexture(size = 256) {
  const random = mulberry32(0xa017a)
  const channels: [number, number, number, number][] = [
    [4, 8, 16, 32],
    [6, 12, 24, 48],
    [8, 16, 32, 64],
    [24, 48, 96, 128],
  ]
  const rgba = new Uint8Array(size * size * 4)
  channels.forEach((cells, channel) => {
    const layer = new Float32Array(size * size)
    octave(size, cells[0], random, layer, 0.5)
    octave(size, cells[1], random, layer, 0.26)
    octave(size, cells[2], random, layer, 0.15)
    octave(size, cells[3], random, layer, 0.09)
    // Value noise bunches around the middle; stretch it to use the full range
    let lo = Infinity
    let hi = -Infinity
    for (const v of layer) {
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    for (let i = 0; i < layer.length; i++) {
      rgba[i * 4 + channel] = Math.round(((layer[i] - lo) / (hi - lo)) * 255)
    }
  })
  return rgba
}
