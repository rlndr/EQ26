export type BrickKind = 'normal' | 'silver' | 'gold'

/** v1 capsules: Enlarge, Slow, Disruption. See arkanoid-feature-plan.md §1. */
export type PowerUp = 'E' | 'S' | 'D'

export type Status = 'ready' | 'playing' | 'paused' | 'levelComplete' | 'gameOver'

export interface Brick {
  x: number
  y: number
  kind: BrickKind
  color: string
  points: number
  /** Remaining hits. Gold is never decremented. */
  hits: number
  alive: boolean
}

export interface Ball {
  x: number
  y: number
  /** Previous tick position, so the renderer can interpolate between fixed steps. */
  px: number
  py: number
  vx: number
  vy: number
}

export interface Capsule {
  x: number
  y: number
  py: number
  kind: PowerUp
}

export interface Input {
  /** Logical x of the pointer, or null when the mouse is not driving the paddle. */
  pointerX: number | null
  left: boolean
  right: boolean
}
