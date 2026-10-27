import { useEffect, useRef, useState } from 'react'
import { Maximize } from 'lucide-react'
import { EFFECTS, keyLabel, keyToIndex } from '../lib/screenripper/registry'
import { Stage } from '../lib/screenripper/stage'

/** How long the pattern name stays up after a change */
const TOAST_MS = 2000

interface Hud {
  index: number
  paused: boolean
  fullscreen: boolean
  error: string | null
  reducedMotion: boolean
}

export default function ScreenRipperPage() {
  const stageRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const canvas2dRef = useRef<HTMLCanvasElement>(null)
  const canvasGlRef = useRef<HTMLCanvasElement>(null)
  const stageObjRef = useRef<Stage | null>(null)

  // React holds only what the chrome needs, updated on discrete changes (a pattern change at
  // most once a minute unattended). Drawing never touches it.
  const [hud, setHud] = useState<Hud>({ index: -1, paused: false, fullscreen: false, error: null, reducedMotion: false })
  const [toast, setToast] = useState(false)

  useEffect(() => {
    const el = stageRef.current
    const layer = layerRef.current
    const canvas2d = canvas2dRef.current
    const canvasGl = canvasGlRef.current
    if (!el || !layer || !canvas2d || !canvasGl) return

    const stage = new Stage(el, layer, canvas2d, canvasGl)
    stageObjRef.current = stage

    let lastIndex = -1
    let toastTimer = 0
    stage.onChange = () => {
      setHud({
        index: stage.current,
        paused: stage.paused,
        fullscreen: stage.fullscreen,
        error: stage.error,
        reducedMotion: stage.reducedMotion,
      })
      if (stage.current !== lastIndex) {
        lastIndex = stage.current
        setToast(true)
        clearTimeout(toastTimer)
        toastTimer = window.setTimeout(() => setToast(false), TOAST_MS)
      }
    }

    const onKeyDown = (ev: KeyboardEvent) => {
      // Leave browser shortcuts alone: Ctrl+F is find, Ctrl+1 switches tabs
      if (ev.ctrlKey || ev.altKey || ev.metaKey || ev.repeat) return
      stage.input()

      const index = keyToIndex(ev.key)
      if (index !== null) {
        stage.select(index)
        ev.preventDefault()
      } else if (ev.key === 'f' || ev.key === 'F') {
        stage.toggleFullscreen()
        ev.preventDefault()
      } else if (ev.key === ' ') {
        // Also stops Space scrolling the page
        stage.togglePause()
        ev.preventDefault()
      }
    }
    window.addEventListener('keydown', onKeyDown)

    // Dev-only console handle, e.g. `screenripper.debugLoseContext()` to test GPU reset recovery
    const devWindow = window as unknown as { screenripper?: Stage }
    if (import.meta.env.DEV) devWindow.screenripper = stage

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (import.meta.env.DEV) delete devWindow.screenripper
      clearTimeout(toastTimer)
      stage.dispose()
      stageObjRef.current = null
    }
  }, [])

  const name = hud.index >= 0 ? EFFECTS[hud.index].name : ''

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold text-brass">ScreenRipper</h1>
        <button
          onClick={(ev) => {
            // Drop focus, or the next Space would press this button instead of pausing
            ev.currentTarget.blur()
            stageObjRef.current?.toggleFullscreen()
          }}
          className="p-1.5 rounded-md border border-zinc-700 text-zinc-400 hover:text-brass hover:border-brass transition-colors"
          aria-label="Fullscreen"
        >
          <Maximize size={16} />
        </button>
      </div>
      <p className="text-zinc-400 mb-6">
        A screensaver for the browser. Ten animated patterns, from tumbling wireframe solids to
        fractal zooms drawn on the GPU. Press a number key to pick one, or leave it alone and it
        moves on by itself every minute. F takes it fullscreen, Esc brings it back.
      </p>

      {/* The fullscreen element: everything outside this div is left behind in fullscreen */}
      <div
        ref={stageRef}
        className={`relative overflow-hidden bg-black ${
          hud.fullscreen ? '' : 'h-[min(72vh,660px)] rounded-xl border border-zinc-800'
        }`}
      >
        {/* Stage sets this layer's opacity to fade between patterns */}
        <div ref={layerRef} className="absolute inset-0">
          <canvas ref={canvas2dRef} className="absolute inset-0 w-full h-full" />
          <canvas ref={canvasGlRef} className="absolute inset-0 w-full h-full" style={{ display: 'none' }} />
        </div>

        <div
          className={`absolute left-4 bottom-4 px-3 py-1.5 rounded-md bg-black/60 text-sm text-zinc-200 pointer-events-none transition-opacity duration-500 ${
            toast && name ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <span className="font-mono text-brass mr-2">{hud.index >= 0 ? keyLabel(hud.index) : ''}</span>
          {name}
        </div>

        {hud.error && (
          <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
            <div className="max-w-2xl w-full rounded-lg border border-rose-500/40 bg-zinc-950/90 p-4">
              <p className="text-sm font-semibold text-rose-400 mb-2">This pattern could not run</p>
              <pre className="text-xs text-zinc-300 whitespace-pre-wrap break-words font-mono">{hud.error}</pre>
            </div>
          </div>
        )}

        {hud.paused && (
          <div className="absolute right-4 top-4 px-2 py-1 rounded-md bg-black/60 text-xs tracking-[0.15em] uppercase text-brass pointer-events-none">
            Paused
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 mt-3 text-xs text-zinc-500">
        <span>1–9, 0 to pick a pattern · Space to pause · F for fullscreen</span>
        {hud.reducedMotion && <span>Slowed down: your system asks for reduced motion</span>}
      </div>
    </div>
  )
}
