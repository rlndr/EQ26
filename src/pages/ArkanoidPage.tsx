import { useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { Audio } from '../lib/arkanoid/audio'
import { DT, LOGICAL_H, LOGICAL_W, MAX_FRAME, PLAY_LEFT, PLAY_RIGHT } from '../lib/arkanoid/constants'
import { Engine } from '../lib/arkanoid/engine'
import { clamp } from '../lib/arkanoid/physics'
import { render } from '../lib/arkanoid/render'
import type { Input, Status } from '../lib/arkanoid/types'

const HIGH_SCORE_KEY = 'arkanoid-high-score'

interface Hud {
  status: Status
  score: number
  level: number
}

export default function ArkanoidPage() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const audioRef = useRef<Audio | null>(null)
  const inputRef = useRef<Input>({ pointerX: null, left: false, right: false })

  // React holds only what the overlays need, and is updated solely on status transitions.
  // Score and lives are drawn on the canvas, so the game loop never touches React.
  const [hud, setHud] = useState<Hud>({ status: 'ready', score: 0, level: 1 })
  const [muted, setMuted] = useState(false)
  const [highScore, setHighScore] = useState(() => {
    try {
      return Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0
    } catch {
      // Private browsing or blocked storage — the game works fine without a saved score
      return 0
    }
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const engine = new Engine()
    const audio = new Audio()
    engineRef.current = engine
    audioRef.current = audio

    let lastStatus: Status = engine.status
    engine.onChange = () => {
      if (engine.status === lastStatus) return
      lastStatus = engine.status
      setHud({ status: engine.status, score: engine.score, level: engine.level })
      if (engine.status === 'gameOver') {
        setHighScore((prev) => {
          if (engine.score <= prev) return prev
          try {
            localStorage.setItem(HIGH_SCORE_KEY, String(engine.score))
          } catch {
            // ignore
          }
          return engine.score
        })
      }
    }
    engine.onSound = (s) => audio.play(s)

    // --- sizing ------------------------------------------------------------
    // Integer scale factor keeps brick edges on whole pixels; the backing store is multiplied
    // by devicePixelRatio so it is not soft on a retina display.
    const resize = () => {
      const scale = Math.max(1, Math.floor(Math.min(wrap.clientWidth / LOGICAL_W, wrap.clientHeight / LOGICAL_H)))
      const dpr = window.devicePixelRatio || 1
      canvas.style.width = `${LOGICAL_W * scale}px`
      canvas.style.height = `${LOGICAL_H * scale}px`
      canvas.width = Math.round(LOGICAL_W * scale * dpr)
      canvas.height = Math.round(LOGICAL_H * scale * dpr)
      // Resizing the backing store resets context state, so the transform is reapplied here
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0)
      ctx.imageSmoothingEnabled = false
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    // --- input -------------------------------------------------------------
    const primary = () => {
      audio.unlock()
      if (engine.status === 'ready') engine.launch()
      else if (engine.status === 'levelComplete') engine.nextLevel()
      else if (engine.status === 'gameOver') engine.restart()
      else if (engine.status === 'paused') engine.togglePause()
    }

    const onPointerMove = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0) return
      const logical = ((ev.clientX - rect.left) / rect.width) * LOGICAL_W
      inputRef.current.pointerX = clamp(logical, PLAY_LEFT, PLAY_RIGHT)
    }

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
        // Hand control to the keyboard, and stop the page scrolling sideways
        inputRef.current.pointerX = null
        inputRef.current[ev.key === 'ArrowLeft' ? 'left' : 'right'] = true
        ev.preventDefault()
      } else if (ev.key === ' ' || ev.key === 'Enter') {
        primary()
        ev.preventDefault()
      } else if (ev.key === 'p' || ev.key === 'P' || ev.key === 'Escape') {
        engine.togglePause()
        ev.preventDefault()
      }
    }
    const onKeyUp = (ev: KeyboardEvent) => {
      if (ev.key === 'ArrowLeft') inputRef.current.left = false
      if (ev.key === 'ArrowRight') inputRef.current.right = false
    }

    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerdown', primary)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    // --- loop --------------------------------------------------------------
    // Fixed timestep with an accumulator: physics advances at a constant 120 Hz whatever the
    // display refresh, so the game plays identically on a 60 Hz and a 144 Hz monitor.
    let raf = 0
    let last = performance.now()
    let acc = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      // Clamped so returning to a backgrounded tab does not try to simulate the missing
      // seconds in one frame
      const delta = Math.min((now - last) / 1000, MAX_FRAME)
      last = now
      acc += delta
      while (acc >= DT) {
        engine.step(DT, inputRef.current)
        acc -= DT
      }
      render(ctx, engine, acc / DT)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', primary)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      engine.onChange = () => {}
      engine.onSound = () => {}
      audio.close()
      engineRef.current = null
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted
  }, [muted])

  const overlay = OVERLAYS[hud.status]

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold text-brass">Arkanoid</h1>
        <button
          onClick={() => setMuted((m) => !m)}
          className="p-1.5 rounded-md border border-zinc-700 text-zinc-400 hover:text-brass hover:border-brass transition-colors"
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      </div>
      <p className="text-zinc-400 mb-6">
        A block breaker after the 1986 Taito original. Move the Vaus with the mouse or arrow keys,
        click or press space to launch. Where the ball strikes the paddle decides the angle it
        leaves at. Catch a falling capsule for a wider paddle (E), a slower ball (S) or three
        balls at once (D). Silver bricks take more than one hit; gold cannot be broken.
      </p>

      <div
        ref={wrapRef}
        className="relative flex items-center justify-center h-[min(72vh,660px)] rounded-xl border border-zinc-800 bg-zinc-950"
      >
        <canvas ref={canvasRef} className="cursor-none touch-none" />

        {overlay && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/70 pointer-events-none">
            <div className="text-center px-6">
              <p className="text-2xl font-bold text-brass tracking-[0.15em] uppercase mb-2">
                {overlay.title}
              </p>
              {hud.status === 'gameOver' && (
                <p className="text-sm text-zinc-300 mb-1">
                  Score {hud.score.toLocaleString()}
                  {hud.score >= highScore && hud.score > 0 && (
                    <span className="text-rose-400"> — new best</span>
                  )}
                </p>
              )}
              {hud.status === 'levelComplete' && (
                <p className="text-sm text-zinc-300 mb-1">Level {hud.level} cleared</p>
              )}
              <p className="text-xs text-zinc-500 mt-2">{overlay.hint}</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-3 text-xs text-zinc-500">
        <span>Mouse or ← → to move · Space/click to launch · P to pause</span>
        <span>
          Best <span className="font-mono text-brass-dark">{highScore.toLocaleString()}</span>
        </span>
      </div>
    </div>
  )
}

const OVERLAYS: Partial<Record<Status, { title: string; hint: string }>> = {
  ready: { title: 'Ready', hint: 'Click or press space to launch' },
  paused: { title: 'Paused', hint: 'Press P to resume' },
  levelComplete: { title: 'Cleared', hint: 'Click or press space for the next level' },
  gameOver: { title: 'Game Over', hint: 'Click or press space to play again' },
}
