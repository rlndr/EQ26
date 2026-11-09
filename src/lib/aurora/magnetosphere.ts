import { clamp } from './astro'

/**
 * Distance from Earth's centre to the nose of the magnetosphere, in Earth radii, from the balance
 * between solar wind pressure and the geomagnetic field. n in protons/cm³, v in km/s.
 */
export const standoffRadii = (n: number, v: number) => 107.4 * Math.pow(n * v * v, -1 / 6)

/** How strongly the magnetic field is coupling to the solar wind, 0 to 1. Only southward Bz does. */
export const couplingFromBz = (bz: number) => clamp(-bz / 10, 0, 1)

export const particleCount = (density: number) => Math.round(clamp(70 + density * 34, 70, 440))

/** On-screen particle speed, px/s, for the strip's scale */
export const particleSpeed = (kms: number) => 80 + clamp(kms - 250, 0, 1200) * 0.42

/** Particle hue blend: −1 fully south (rose), +1 fully north (sky) */
export const bzBlend = (bz: number) => clamp(bz / 6, -1, 1)

export type WindRegion = 'sun' | 'wind' | 'l1' | 'shield' | 'earth'

export const REGION_NOTES: Record<WindRegion, { title: string; note: string }> = {
  sun: {
    title: 'The Sun',
    note: 'A live image from NOAA’s GOES satellites. Holes in the corona and eruptions from active regions release the fast streams that cause aurora.',
  },
  wind: {
    title: 'Solar wind',
    note: 'A constant flow of charged particles. Each streak here is drawn from the live speed and density. Rose means the wind’s magnetic field points south, sky blue means north.',
  },
  l1: {
    title: 'L1 monitor',
    note: 'Spacecraft parked between the Sun and Earth measure the wind before it arrives. That head start is what makes a short-range aurora forecast possible.',
  },
  shield: {
    title: 'Magnetosphere',
    note: 'Earth’s magnetic field holds the wind off. Higher pressure pushes the boundary inward. When the wind’s field points south it can link up with Earth’s, opening the door.',
  },
  earth: {
    title: 'Earth',
    note: 'Particles that get in are funnelled along field lines toward the poles, where they strike the upper atmosphere and make it glow.',
  },
}
