import { BRICK_COLS, BRICK_H, BRICK_TOP, BRICK_W, PLAY_LEFT } from './constants'
import type { Brick } from './types'

// Brick glyphs. Coloured bricks die in one hit and score by colour, stepping 50..120 in the
// order of the arcade original. S is silver (multi-hit), X is gold (indestructible).
const GLYPHS: Record<string, { color: string; points: number }> = {
  W: { color: '#f4f4f5', points: 50 },
  O: { color: '#e8871e', points: 60 },
  C: { color: '#22d3ee', points: 70 },
  G: { color: '#22c55e', points: 80 },
  R: { color: '#ef4444', points: 90 },
  B: { color: '#3b82f6', points: 100 },
  M: { color: '#d946ef', points: 110 },
  Y: { color: '#eab308', points: 120 },
}

const SILVER = '#a1a1aa'
// Gold takes the site's brass, which is both the right colour for the brick and a quiet nod
// to the rest of land3r.net.
const GOLD = '#d8b553'

export const LEVELS: string[][] = [
  [
    'WWWWWWWWWWWWW',
    'OOOOOOOOOOOOO',
    'CCCCCCCCCCCCC',
    'GGGGGGGGGGGGG',
    'RRRRRRRRRRRRR',
    'BBBBBBBBBBBBB',
  ],
  [
    'SSSSSSSSSSSSS',
    '.M.M.M.M.M.M.',
    'YYYYYYYYYYYYY',
    '.C.C.C.C.C.C.',
    'GGGGGGGGGGGGG',
  ],
  [
    'X...........X',
    '.YYYYYYYYYYY.',
    '.MMMMMMMMMMM.',
    '..BBBBBBBBB..',
    '...GGGGGGG...',
    '....RRRRR....',
    '.....CCC.....',
    '......W......',
  ],
  [
    '.X.........X.',
    '.YYYYYYYYYYY.',
    '..SSSSSSSSS..',
    '.MMMMMMMMMMM.',
    '.BBBBBBBBBBB.',
    '..GGGGGGGGG..',
  ],
  [
    'XYXYXYXYXYXYX',
    '.B.B.B.B.B.B.',
    'MMMMMMMMMMMMM',
    '.S.S.S.S.S.S.',
    'GGGGGGGGGGGGG',
    '.R.R.R.R.R.R.',
    'CCCCCCCCCCCCC',
  ],
]

/** Silver toughens as the game goes on, as in the original. `level` is 1-based. */
export function silverHits(level: number) {
  return 2 + Math.floor((level - 1) / 8)
}

/**
 * Expand a level's string grid into positioned bricks.
 * Throws on a malformed row — a typo in a layout should fail loudly at build/test time
 * rather than quietly producing a level that cannot be cleared.
 */
export function buildLevel(index: number): Brick[] {
  const rows = LEVELS[index % LEVELS.length]
  const level = index + 1
  const bricks: Brick[] = []

  rows.forEach((row, r) => {
    if (row.length !== BRICK_COLS) {
      throw new Error(`Level ${level} row ${r} is ${row.length} wide, expected ${BRICK_COLS}`)
    }
    for (let c = 0; c < BRICK_COLS; c++) {
      const ch = row[c]
      if (ch === '.') continue

      const x = PLAY_LEFT + c * BRICK_W
      const y = BRICK_TOP + r * BRICK_H

      if (ch === 'X') {
        bricks.push({ x, y, kind: 'gold', color: GOLD, points: 0, hits: Infinity, alive: true })
      } else if (ch === 'S') {
        bricks.push({
          x, y, kind: 'silver', color: SILVER,
          points: 50 * level, hits: silverHits(level), alive: true,
        })
      } else {
        const g = GLYPHS[ch]
        if (!g) throw new Error(`Level ${level} row ${r} has unknown brick '${ch}'`)
        bricks.push({ x, y, kind: 'normal', color: g.color, points: g.points, hits: 1, alive: true })
      }
    }
  })

  return bricks
}
