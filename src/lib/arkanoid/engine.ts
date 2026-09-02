import {
  BALL_R, BALL_SPEED_MAX, BALL_SPEED_PER_LEVEL, BALL_SPEED_START,
  BRICK_H, BRICK_W, CAPSULE_CHANCE, CAPSULE_H, CAPSULE_SPEED, CAPSULE_W,
  LIVES_START, LOGICAL_H, LOGICAL_W, MAX_BOUNCE_DEG,
  PADDLE_H, PADDLE_SPEED, PADDLE_W, PADDLE_W_WIDE, PADDLE_Y,
  PLAY_LEFT, PLAY_RIGHT, PLAY_TOP, SLOW_FACTOR,
} from './constants'
import { buildLevel, LEVELS } from './levels'
import { boxHit, clamp } from './physics'
import type { Ball, Brick, Capsule, Input, PowerUp, Status } from './types'

const DEG = Math.PI / 180
const POWERUPS: PowerUp[] = ['E', 'S', 'D']
const MAX_BALLS = 6

export type SoundName = 'wall' | 'brick' | 'solid' | 'paddle' | 'power' | 'lose'

/**
 * The whole game. Deliberately plain and mutable: this is stepped 120 times a second from a
 * requestAnimationFrame loop and never lives in React state, because re-rendering React at
 * that rate would spend the frame budget on reconciliation. React subscribes via `onChange`,
 * which only fires on discrete events (score, lives, status).
 */
export class Engine {
  status: Status = 'ready'
  score = 0
  lives = LIVES_START
  levelIndex = 0
  bricks: Brick[] = []
  balls: Ball[] = []
  capsules: Capsule[] = []
  paddleX = LOGICAL_W / 2
  paddlePX = LOGICAL_W / 2
  paddleW = PADDLE_W
  slow = false

  onChange: () => void = () => {}
  onSound: (s: SoundName) => void = () => {}

  constructor() {
    this.startLevel(0)
  }

  get level() {
    return this.levelIndex + 1
  }

  /** Ball speed ramps with level, capped so it can never move far enough per tick to tunnel. */
  get baseSpeed() {
    return Math.min(BALL_SPEED_START + this.levelIndex * BALL_SPEED_PER_LEVEL, BALL_SPEED_MAX)
  }

  /** Gold is indestructible, so it never counts toward clearing the wall. */
  get remaining() {
    let n = 0
    for (const b of this.bricks) if (b.alive && b.kind !== 'gold') n++
    return n
  }

  // --- lifecycle -----------------------------------------------------------

  startLevel(index: number) {
    this.levelIndex = index
    this.bricks = buildLevel(index)
    this.resetForServe()
  }

  restart() {
    this.score = 0
    this.lives = LIVES_START
    this.startLevel(0)
  }

  nextLevel() {
    this.startLevel(this.levelIndex + 1)
  }

  /** Capsule effects last until the ball is lost or the level ends, as in the original. */
  private resetForServe() {
    this.paddleW = PADDLE_W
    this.slow = false
    this.capsules = []
    const x = this.paddleX
    const y = PADDLE_Y - BALL_R
    this.balls = [{ x, y, px: x, py: y, vx: 0, vy: 0 }]
    this.status = 'ready'
    this.onChange()
  }

  launch() {
    if (this.status !== 'ready') return
    const speed = this.baseSpeed * (this.slow ? SLOW_FACTOR : 1)
    const angle = (Math.random() < 0.5 ? -1 : 1) * 35 * DEG
    const b = this.balls[0]
    b.vx = Math.sin(angle) * speed
    b.vy = -Math.cos(angle) * speed
    this.status = 'playing'
    this.onChange()
  }

  togglePause() {
    if (this.status === 'playing') this.status = 'paused'
    else if (this.status === 'paused') this.status = 'playing'
    else return
    this.onChange()
  }

  // --- simulation ----------------------------------------------------------

  /** One fixed timestep. `dt` is always DT; it is a parameter only so tests can vary it. */
  step(dt: number, input: Input) {
    if (this.status === 'paused' || this.status === 'gameOver' || this.status === 'levelComplete') {
      return
    }

    this.paddlePX = this.paddleX
    if (input.pointerX !== null) {
      this.paddleX = input.pointerX
    } else {
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0)
      this.paddleX += dir * PADDLE_SPEED * dt
    }
    const half = this.paddleW / 2
    this.paddleX = clamp(this.paddleX, PLAY_LEFT + half, PLAY_RIGHT - half)

    // Ball rides the paddle until launch
    if (this.status === 'ready') {
      const b = this.balls[0]
      b.px = b.x
      b.py = b.y
      b.x = this.paddleX
      b.y = PADDLE_Y - BALL_R
      return
    }

    for (const b of this.balls) this.stepBall(b, dt)

    const before = this.balls.length
    this.balls = this.balls.filter((b) => b.y - BALL_R < LOGICAL_H)
    if (this.balls.length === 0) {
      this.loseLife()
      return
    }
    if (this.balls.length < before) this.onSound('lose')

    this.stepCapsules(dt)

    if (this.remaining === 0) {
      this.status = 'levelComplete'
      this.onChange()
    }
  }

  private stepBall(b: Ball, dt: number) {
    b.px = b.x
    b.py = b.y
    b.x += b.vx * dt
    b.y += b.vy * dt

    // Side and top walls
    if (b.x - BALL_R < PLAY_LEFT) {
      b.x = PLAY_LEFT + BALL_R
      b.vx = Math.abs(b.vx)
      this.onSound('wall')
    } else if (b.x + BALL_R > PLAY_RIGHT) {
      b.x = PLAY_RIGHT - BALL_R
      b.vx = -Math.abs(b.vx)
      this.onSound('wall')
    }
    if (b.y - BALL_R < PLAY_TOP) {
      b.y = PLAY_TOP + BALL_R
      b.vy = Math.abs(b.vy)
      this.onSound('wall')
    }

    // At most one brick per tick: resolving two simultaneously can reflect the same axis
    // twice and cancel out, sending the ball straight through.
    for (const br of this.bricks) {
      if (!br.alive) continue
      const hit = boxHit(b.x, b.y, BALL_R, br.x, br.y, BRICK_W, BRICK_H)
      if (!hit) continue
      if (hit.axis === 'x') {
        b.x += hit.push
        b.vx = -b.vx
      } else {
        b.y += hit.push
        b.vy = -b.vy
      }
      this.damage(br)
      break
    }

    // Vaus. Reflection angle depends on where the ball lands along the paddle — this is the
    // detail that makes it play like Arkanoid rather than Pong.
    if (b.vy > 0) {
      const left = this.paddleX - this.paddleW / 2
      if (boxHit(b.x, b.y, BALL_R, left, PADDLE_Y, this.paddleW, PADDLE_H)) {
        const t = clamp((b.x - this.paddleX) / (this.paddleW / 2), -1, 1)
        const angle = t * MAX_BOUNCE_DEG * DEG
        const speed = Math.hypot(b.vx, b.vy)
        b.vx = Math.sin(angle) * speed
        b.vy = -Math.cos(angle) * speed
        b.y = PADDLE_Y - BALL_R - 0.001
        this.onSound('paddle')
      }
    }
  }

  private damage(br: Brick) {
    if (br.kind === 'gold') {
      this.onSound('solid')
      return
    }
    br.hits -= 1
    if (br.hits > 0) {
      this.onSound('solid')
      return
    }
    br.alive = false
    this.score += br.points
    this.onSound('brick')
    this.maybeDrop(br)
    this.onChange()
  }

  /** Only one capsule may be falling at a time, as in the original. */
  private maybeDrop(br: Brick) {
    if (this.capsules.length > 0) return
    if (Math.random() >= CAPSULE_CHANCE) return
    const kind = POWERUPS[Math.floor(Math.random() * POWERUPS.length)]
    const y = br.y + BRICK_H / 2
    this.capsules.push({ x: br.x + BRICK_W / 2, y, py: y, kind })
  }

  private stepCapsules(dt: number) {
    for (const c of this.capsules) {
      c.py = c.y
      c.y += CAPSULE_SPEED * dt
    }
    const half = this.paddleW / 2
    this.capsules = this.capsules.filter((c) => {
      const overX = Math.abs(c.x - this.paddleX) < half + CAPSULE_W / 2
      const overY = Math.abs(c.y - (PADDLE_Y + PADDLE_H / 2)) < (PADDLE_H + CAPSULE_H) / 2
      if (overX && overY) {
        this.apply(c.kind)
        return false
      }
      return c.y - CAPSULE_H / 2 < LOGICAL_H
    })
  }

  private apply(kind: PowerUp) {
    if (kind === 'E') {
      this.paddleW = PADDLE_W_WIDE
    } else if (kind === 'S') {
      if (!this.slow) {
        this.slow = true
        for (const b of this.balls) {
          b.vx *= SLOW_FACTOR
          b.vy *= SLOW_FACTOR
        }
      }
    } else {
      // Disruption: each ball splits into three, fanned out from its current heading
      for (const b of [...this.balls]) {
        const speed = Math.hypot(b.vx, b.vy)
        const a = Math.atan2(b.vy, b.vx)
        for (const d of [-25 * DEG, 25 * DEG]) {
          if (this.balls.length >= MAX_BALLS) break
          this.balls.push({
            x: b.x, y: b.y, px: b.x, py: b.y,
            vx: Math.cos(a + d) * speed,
            vy: Math.sin(a + d) * speed,
          })
        }
      }
    }
    this.onSound('power')
    this.onChange()
  }

  private loseLife() {
    this.lives -= 1
    this.onSound('lose')
    if (this.lives <= 0) {
      this.status = 'gameOver'
      this.onChange()
      return
    }
    this.resetForServe()
  }
}

export { LEVELS }
