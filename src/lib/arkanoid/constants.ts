// Every gameplay tunable lives here. Feel — paddle responsiveness, ball speed, difficulty
// curve — can only be judged by playing, so the numbers worth adjusting are all in one file.

// --- Playfield -------------------------------------------------------------
// Fixed logical resolution, scaled to fit its container. Physics never depends on window
// size, and the proportions follow the arcade original's portrait screen.
export const LOGICAL_W = 224
export const LOGICAL_H = 288
export const WALL = 8

export const PLAY_LEFT = WALL
export const PLAY_RIGHT = LOGICAL_W - WALL
export const PLAY_TOP = WALL

// --- Bricks ----------------------------------------------------------------
export const BRICK_COLS = 13
export const BRICK_W = 16 // 13 * 16 = 208 = exactly the interior width
export const BRICK_H = 8
export const BRICK_TOP = 48

// --- Vaus ------------------------------------------------------------------
export const PADDLE_W = 32
export const PADDLE_W_WIDE = 48
export const PADDLE_H = 5
export const PADDLE_Y = 262
// Keyboard only; the mouse tracks directly. Keep this comfortably above BALL_SPEED_START or
// keyboard players cannot get across the playfield in time to meet the ball.
export const PADDLE_SPEED = 220

// --- Ball ------------------------------------------------------------------
export const BALL_R = 2.5
// Speed the ball leaves the paddle at on level 1. This is the dial for "how fast does the game
// feel"; the two below only shape how it ramps afterwards.
export const BALL_SPEED_START = 140
// Ceiling on the level ramp, NOT on the starting speed — but it clamps both, so it has to stay
// clear above BALL_SPEED_START or raising the start value does nothing at all. Guarded below.
export const BALL_SPEED_MAX = 300
export const BALL_SPEED_PER_LEVEL = 8
// Reflection angle off the paddle edge. 60° keeps the vertical component at >= 0.5 * speed,
// so the ball can never settle into a near-horizontal rally it cannot escape.
export const MAX_BOUNCE_DEG = 60

// --- Simulation ------------------------------------------------------------
// Fixed 120 Hz tick. At BALL_SPEED_MAX that is 2.5 logical units of travel per step, against a
// paddle 5 units tall — the thinnest thing the ball must not pass through. Roughly 2x margin.
// Going much faster than BALL_SPEED_MAX means lowering DT too; the guard at the foot of this
// file will say so.
export const DT = 1 / 120
// Clamp on accumulated time: without it, returning to a backgrounded tab tries to simulate
// every missed second in a single frame and locks the page.
export const MAX_FRAME = 0.25

export const LIVES_START = 3

// --- Capsules --------------------------------------------------------------
export const CAPSULE_W = 16
export const CAPSULE_H = 8
export const CAPSULE_SPEED = 48
export const CAPSULE_CHANCE = 0.16 // per destroyed brick, and only one may fall at a time
export const SLOW_FACTOR = 0.72

// --- Tuning guard ----------------------------------------------------------
// The failure this catches is nasty to diagnose from its symptom: if the ball can travel
// further in one tick than the thinnest thing it must hit, it is on one side before the step
// and past it after, colliding with nothing — the ball simply flies through bricks. Speeding
// the game up therefore means lowering DT as well, not just raising BALL_SPEED_MAX.
// Raising BALL_SPEED_START past BALL_SPEED_MAX is silently a no-op, because baseSpeed clamps
// to the smaller of the two. Easy to hit while tuning, and impossible to spot from the symptom.
if (BALL_SPEED_START >= BALL_SPEED_MAX) {
  console.error(
    `[arkanoid] BALL_SPEED_START (${BALL_SPEED_START}) is at or above BALL_SPEED_MAX ` +
      `(${BALL_SPEED_MAX}), so it is clamped and raising it further will change nothing. ` +
      `Raise BALL_SPEED_MAX above it.`,
  )
}

const THINNEST_COLLIDER = Math.min(BRICK_H, PADDLE_H, BALL_R * 2)
if (BALL_SPEED_MAX * DT >= THINNEST_COLLIDER) {
  console.error(
    `[arkanoid] Ball travels ${(BALL_SPEED_MAX * DT).toFixed(2)} units per tick but the thinnest ` +
      `collider is ${THINNEST_COLLIDER}. The ball will tunnel through bricks. ` +
      `Lower BALL_SPEED_MAX or lower DT.`,
  )
}
