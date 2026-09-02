import {
  BALL_R, BRICK_H, BRICK_W, CAPSULE_H, CAPSULE_W,
  LOGICAL_H, LOGICAL_W, PADDLE_H, PADDLE_Y, PLAY_LEFT, PLAY_RIGHT, PLAY_TOP, WALL,
} from './constants'
import type { Engine } from './engine'
import type { PowerUp } from './types'

const BRASS = '#d8b553'
const BRASS_DARK = '#8a6a1f'
const FIELD = '#0a0a0c'

const CAPSULE_COLOR: Record<PowerUp, string> = {
  E: '#3b82f6',
  S: '#e8871e',
  D: '#22d3ee',
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Bevelled face, so bricks read as solid objects rather than flat swatches. */
function bevel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.fillRect(x, y, w, 1)
  ctx.fillRect(x, y, 1, h)
  ctx.fillStyle = 'rgba(0,0,0,0.32)'
  ctx.fillRect(x, y + h - 1, w, 1)
  ctx.fillRect(x + w - 1, y, 1, h)
}

/**
 * Draws one frame. `alpha` is the fraction of a physics step elapsed since the last tick, used
 * to interpolate positions — without it, a display refreshing faster than the 120 Hz tick shows
 * duplicated frames and the motion judders.
 */
export function render(ctx: CanvasRenderingContext2D, e: Engine, alpha: number) {
  ctx.fillStyle = FIELD
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)

  // Frame, in the site's brass
  ctx.fillStyle = BRASS_DARK
  ctx.fillRect(0, 0, WALL, LOGICAL_H)
  ctx.fillRect(LOGICAL_W - WALL, 0, WALL, LOGICAL_H)
  ctx.fillRect(0, 0, LOGICAL_W, WALL)
  ctx.fillStyle = BRASS
  ctx.fillRect(WALL - 1, 0, 1, LOGICAL_H)
  ctx.fillRect(LOGICAL_W - WALL, 0, 1, LOGICAL_H)
  ctx.fillRect(0, WALL - 1, LOGICAL_W, 1)

  drawHud(ctx, e)

  for (const b of e.bricks) {
    if (!b.alive) continue
    bevel(ctx, b.x, b.y, BRICK_W, BRICK_H, b.color)
    // A silver brick that has taken a hit reads as scuffed
    if (b.kind === 'silver' && b.hits < 2) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)'
      ctx.fillRect(b.x + 1, b.y + 1, BRICK_W - 2, BRICK_H - 2)
    }
  }

  // Vaus
  const px = lerp(e.paddlePX, e.paddleX, alpha)
  const pw = e.paddleW
  bevel(ctx, px - pw / 2, PADDLE_Y, pw, PADDLE_H, '#e11d48')
  ctx.fillStyle = '#e5e5e5'
  ctx.fillRect(px - pw / 2, PADDLE_Y, 3, PADDLE_H)
  ctx.fillRect(px + pw / 2 - 3, PADDLE_Y, 3, PADDLE_H)

  for (const c of e.capsules) {
    const cy = lerp(c.py, c.y, alpha)
    bevel(ctx, c.x - CAPSULE_W / 2, cy - CAPSULE_H / 2, CAPSULE_W, CAPSULE_H, CAPSULE_COLOR[c.kind])
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 7px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(c.kind, c.x, cy + 0.5)
  }

  ctx.fillStyle = '#ffffff'
  for (const b of e.balls) {
    ctx.beginPath()
    ctx.arc(lerp(b.px, b.x, alpha), lerp(b.py, b.y, alpha), BALL_R, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawHud(ctx: CanvasRenderingContext2D, e: Engine) {
  ctx.font = '8px monospace'
  ctx.textBaseline = 'middle'

  ctx.fillStyle = BRASS
  ctx.textAlign = 'left'
  ctx.fillText(String(e.score).padStart(6, '0'), PLAY_LEFT + 2, PLAY_TOP + 14)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#71717a'
  ctx.fillText(`LEVEL ${e.level}`, LOGICAL_W / 2, PLAY_TOP + 14)

  // Lives as spare Vaus glyphs, minus the one in play
  for (let i = 0; i < e.lives - 1; i++) {
    const x = PLAY_RIGHT - 4 - i * 12
    ctx.fillStyle = '#e11d48'
    ctx.fillRect(x - 9, PLAY_TOP + 12, 9, 3)
  }
}
