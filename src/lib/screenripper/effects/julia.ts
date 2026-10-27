import { fullscreenShader } from '../gl'
import { randomSeed, rng } from '../math'
import FRAG from './julia.frag.glsl?raw'

/** One trip round the cardioid takes this long */
export const ORBIT_SECONDS = 57
/** How far c swings inside and outside the cardioid edge, as a fraction of its distance from 0 */
export const SWING = 0.06
export const ITERATIONS = 200

/**
 * c at time t: a point on the main cardioid, c = e^{iθ}/2 − e^{2iθ}/4, scaled by up to ±SWING
 * so it drifts across the edge and back.
 */
export function juliaC(t: number, phase: number): [number, number] {
  const th = phase + (t / ORBIT_SECONDS) * Math.PI * 2
  const s = 1 + SWING * Math.sin(t * 0.29 + phase)
  const x = 0.5 * Math.cos(th) - 0.25 * Math.cos(2 * th)
  const y = 0.5 * Math.sin(th) - 0.25 * Math.sin(2 * th)
  return [x * s, y * s]
}

/** A Julia set whose constant orbits the Mandelbrot boundary, so its shape never settles */
export function julia(seed = randomSeed()) {
  const phase = rng(seed)() * Math.PI * 2
  return fullscreenShader({
    frag: FRAG,
    uniforms: (gl, u, t) => {
      const [cx, cy] = juliaC(t, phase)
      gl.uniform2f(u('uC'), cx, cy)
      gl.uniform1f(u('uAngle'), t * 0.02)
      gl.uniform1i(u('uIter'), ITERATIONS)
    },
  })
}
