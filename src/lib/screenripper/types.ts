/**
 * One pattern. A fresh instance is created each time the pattern is shown, so `t` starts at zero
 * and any state (particles, tree growth) starts clean.
 *
 * Sizes are in the units the effect draws in: CSS pixels for 2D (the stage applies the
 * devicePixelRatio transform, so effects should save/restore rather than setTransform), and
 * drawing-buffer pixels for GL (the stage sets the viewport).
 */
interface EffectBase {
  /** Called every frame while showing and not paused. t = seconds since shown, excluding pauses */
  frame(t: number, dt: number): void
  resize(w: number, h: number): void
  /** Free GL programs and buffers, drop large arrays */
  dispose(): void
  /**
   * Optional CSS opacity for the canvas, 0–1, read after every frame. For fades that must reach
   * black smoothly: fading the pixels themselves cannot on an 8-bit canvas (see flowfield.ts),
   * but the browser composites element opacity at full precision.
   */
  opacity?: number
}

export interface Effect2D extends EffectBase {
  kind: '2d'
  init(ctx: CanvasRenderingContext2D, w: number, h: number): void
}

export interface EffectGl extends EffectBase {
  kind: 'gl'
  init(gl: WebGL2RenderingContext, w: number, h: number): void
}

export type Effect = Effect2D | EffectGl

export interface Entry {
  name: string
  /** Known without creating the effect, which may allocate */
  kind: Effect['kind']
  create: () => Effect
}
