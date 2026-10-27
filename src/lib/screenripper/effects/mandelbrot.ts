import { fullscreenShader } from '../gl'
import { smoothstep } from '../math'
import FRAG from './mandelbrot.frag.glsl?raw'

/** Seahorse Valley, between the main cardioid and the period-2 bulb */
export const CENTER: [number, number] = [-0.743643887037151, 0.13182590420533]
/** View height in the complex plane at the start of a dive: the whole set */
export const START_SCALE = 2.5
/**
 * Deepest zoom. Measured, not estimated: verify.ts runs the iteration with every operation
 * rounded to float32, as the GPU does, against float64. Somewhere between 1,600× and 2,000×
 * more than 5% of pixels get a visibly different escape count and the edge of the set starts
 * to sparkle; the image only turns blocky much later, near 100,000×. Going deeper needs
 * emulated doubles or perturbation theory.
 */
export const ZOOM_MAX = 1500
/** One dive, including its fades, fills one auto-cycle slot */
export const DIVE_SECONDS = 60
const FADE = 1.5

/** Iterations needed grow with depth: detail near the boundary takes longer to escape */
export const iterationsAt = (zoom: number) => Math.round(100 + 60 * Math.log10(zoom))

/**
 * Zoom at time t within a dive: exponential, so it looks like a constant speed, reaching
 * ZOOM_MAX just as the fade-out finishes. Then the dive starts again.
 */
export function diveAt(t: number) {
  const local = t % DIVE_SECONDS
  const zoom = Math.exp((Math.log(ZOOM_MAX) * local) / DIVE_SECONDS)
  const fade = smoothstep(local / FADE) * (1 - smoothstep((local - (DIVE_SECONDS - FADE)) / FADE))
  return { zoom, fade }
}

/** A continuous zoom into Seahorse Valley, turning slowly as it goes */
export const mandelbrot = () => fullscreenShader({
  frag: FRAG,
  uniforms: (gl, u, t) => {
    const { zoom, fade } = diveAt(t)
    gl.uniform2f(u('uCenter'), CENTER[0], CENTER[1])
    gl.uniform1f(u('uScale'), START_SCALE / zoom)
    gl.uniform1f(u('uAngle'), t * 0.03)
    gl.uniform1i(u('uIter'), iterationsAt(zoom))
    gl.uniform1f(u('uFade'), fade)
  },
})
