import FULLSCREEN_VERT from './fullscreen.vert.glsl?raw'
import type { EffectGl } from './types'

/**
 * Most pixels the GL canvas will render per frame: 1080p. On a 4K or retina screen a
 * full-resolution fragment shader is 8M+ pixels for no visible gain, so the canvas is drawn
 * smaller and the browser scales it up. The 2D canvas is not budgeted, because thin lines are
 * where softness shows.
 */
export const PIXEL_BUDGET = 1920 * 1080

/** Backing-store size for the GL canvas: full devicePixelRatio, scaled down to the budget */
export function glBackingSize(cssW: number, cssH: number, dpr: number, budget = PIXEL_BUDGET) {
  const fullW = cssW * dpr
  const fullH = cssH * dpr
  const scale = Math.min(1, Math.sqrt(budget / Math.max(1, fullW * fullH)))
  // Floor, not round, so the result can never land a few pixels over budget
  return {
    w: Math.max(1, Math.floor(fullW * scale)),
    h: Math.max(1, Math.floor(fullH * scale)),
  }
}

export class ShaderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShaderError'
  }
}

/**
 * Drivers report errors as `ERROR: 0:12: 'foo' : undeclared identifier`. Quote the offending
 * source line under each one so the message is readable without opening the file.
 */
export function formatShaderLog(log: string, source: string) {
  const lines = source.split('\n')
  return log
    .trim()
    .split('\n')
    .map((entry) => {
      const m = /^(?:ERROR|WARNING): \d+:(\d+):/.exec(entry)
      const n = m ? Number(m[1]) : 0
      return n >= 1 && n <= lines.length ? `${entry}\n    ${n} | ${lines[n - 1].trim()}` : entry
    })
    .join('\n')
}

function compile(gl: WebGL2RenderingContext, type: number, source: string, label: string) {
  const shader = gl.createShader(type)
  if (!shader) throw new ShaderError(`${label}: could not create shader`)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? ''
    gl.deleteShader(shader)
    throw new ShaderError(`${label} failed to compile\n${formatShaderLog(log, source)}`)
  }
  return shader
}

/**
 * Compile and link; throws ShaderError with a readable log. Stage puts the pattern's name above
 * the message, so it is not repeated here.
 */
export function createProgram(gl: WebGL2RenderingContext, fragSrc: string, vertSrc = FULLSCREEN_VERT) {
  const vs = compile(gl, gl.VERTEX_SHADER, vertSrc, 'Vertex shader')
  let fs: WebGLShader
  try {
    fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc, 'Fragment shader')
  } catch (err) {
    gl.deleteShader(vs)
    throw err
  }
  const program = gl.createProgram()
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  // Once linked the program keeps what it needs; the shader objects can go
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? ''
    gl.deleteProgram(program)
    throw new ShaderError(`Shaders failed to link\n${log.trim()}`)
  }
  return program
}

type Uniforms = (name: string) => WebGLUniformLocation | null

interface FullscreenShader {
  frag: string
  /** Set this shader's own uniforms each frame; uTime and uResolution are set already */
  uniforms?: (gl: WebGL2RenderingContext, u: Uniforms, t: number, dt: number) => void
}

/**
 * An effect that is one fragment shader over the whole screen, which covers every GL pattern
 * in the plan. Provides `uniform float uTime` (seconds) and `uniform vec2 uResolution`
 * (drawing-buffer pixels), and `in vec2 vUv` running 0–1 across the screen.
 */
export function fullscreenShader({ frag, uniforms }: FullscreenShader): EffectGl {
  let gl: WebGL2RenderingContext
  let program: WebGLProgram | null = null
  let vao: WebGLVertexArrayObject | null = null
  const locations = new Map<string, WebGLUniformLocation | null>()
  let w = 1
  let h = 1

  const u: Uniforms = (uniform) => {
    // Looking a location up is a driver round trip, so each is fetched once
    if (!locations.has(uniform) && program) locations.set(uniform, gl.getUniformLocation(program, uniform))
    return locations.get(uniform) ?? null
  }

  return {
    kind: 'gl',
    init(context, width, height) {
      gl = context
      w = width
      h = height
      program = createProgram(gl, frag)
      // The triangle needs no attributes, but binding a VAO keeps every driver happy
      vao = gl.createVertexArray()
    },
    resize(width, height) {
      w = width
      h = height
    },
    frame(t, dt) {
      if (!program) return
      gl.useProgram(program)
      gl.bindVertexArray(vao)
      gl.uniform1f(u('uTime'), t)
      gl.uniform2f(u('uResolution'), w, h)
      uniforms?.(gl, u, t, dt)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    dispose() {
      if (program) gl.deleteProgram(program)
      if (vao) gl.deleteVertexArray(vao)
      program = null
      vao = null
      locations.clear()
    },
  }
}
