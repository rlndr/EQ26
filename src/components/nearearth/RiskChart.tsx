import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useWidth } from './useWidth'
import type { RiskObject } from '../../lib/nearearth/parse'
import { oddsInWords } from '../../lib/nearearth/scale'

const HEIGHT = 340
const MARGIN = { top: 12, right: 12, bottom: 26, left: 40 }
const PS_LOW = -11
const PS_HIGH = 0.6
const LOG_MAX_YEARS = Math.log10(1000)
const HIT_RADIUS = 14

interface Plotted {
  object: RiskObject
  x: number
  y: number
  r: number
}

const radius = (km: number | null) => (km === null ? 1.5 : Math.max(1.5, Math.min(10, 1.5 + 2.4 * (Math.log10(km) + 3))))

interface Props {
  objects: RiskObject[]
  year: number
  selected: string | null
  onSelect: (object: RiskObject) => void
}

export default function RiskChart({ objects, year, selected, onSelect }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hovered, setHovered] = useState<Plotted | null>(null)

  const innerW = Math.max(1, width - MARGIN.left - MARGIN.right)
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom
  const toY = (ps: number) => MARGIN.top + (1 - (Math.max(PS_LOW, Math.min(PS_HIGH, ps)) - PS_LOW) / (PS_HIGH - PS_LOW)) * innerH

  const plotted = useMemo<Plotted[]>(() => {
    const out: Plotted[] = []
    for (const object of objects) {
      if (object.palermo === null || object.firstYear === null) continue
      const years = Math.max(0, object.firstYear - year) + 1
      out.push({
        object,
        x: MARGIN.left + (Math.log10(years) / LOG_MAX_YEARS) * innerW,
        y: MARGIN.top + (1 - (Math.max(PS_LOW, Math.min(PS_HIGH, object.palermo)) - PS_LOW) / (PS_HIGH - PS_LOW)) * innerH,
        r: radius(object.diameterKm),
      })
    }
    // Riskiest last, so they are drawn on top
    return out.sort((a, b) => (a.object.palermo ?? 0) - (b.object.palermo ?? 0))
  }, [objects, year, innerW, innerH])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d', { alpha: false })
    if (!canvas || !ctx || width === 0) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(HEIGHT * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#18181b'
    ctx.fillRect(0, 0, width, HEIGHT)

    const y = (ps: number) => MARGIN.top + (1 - (Math.max(PS_LOW, Math.min(PS_HIGH, ps)) - PS_LOW) / (PS_HIGH - PS_LOW)) * (HEIGHT - MARGIN.top - MARGIN.bottom)
    const right = width - MARGIN.right
    const left = MARGIN.left
    const bands = [
      { from: PS_HIGH, to: 0, fill: 'rgba(244,63,94,0.16)', label: 'More threatening than the background hazard' },
      { from: 0, to: -2, fill: 'rgba(245,158,11,0.12)', label: 'Merits careful monitoring' },
      { from: -2, to: PS_LOW, fill: 'rgba(63,63,70,0.2)', label: 'No likely consequences' },
    ]
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
    for (const band of bands) {
      ctx.fillStyle = band.fill
      ctx.fillRect(left, y(band.from), right - left, y(band.to) - y(band.from))
    }
    // Top-left of each band, where the fewest objects are
    ctx.textAlign = 'left'
    ctx.fillStyle = '#a1a1aa'
    ctx.fillText(bands[1].label, left + 6, y(0) + 14)
    ctx.fillText(bands[2].label, left + 6, y(-2) + 14)

    ctx.textAlign = 'right'
    for (const ps of [0, -2, -4, -6, -8, -10]) {
      ctx.fillStyle = '#a1a1aa'
      ctx.fillText(String(ps), left - 6, y(ps) + 4)
    }

    ctx.textAlign = 'center'
    for (const span of [1, 10, 100, 500]) {
      const x = left + (Math.log10(span + 1) / LOG_MAX_YEARS) * (right - left)
      ctx.fillStyle = '#a1a1aa'
      ctx.fillText(String(year + span), x, HEIGHT - 8)
    }

    ctx.fillStyle = 'rgba(244,114,182,0.55)'
    for (const p of plotted) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fill()
    }

    const chosen = plotted.find((p) => p.object.des === selected)
    if (chosen) {
      ctx.strokeStyle = '#d8b553'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(chosen.x, chosen.y, chosen.r + 4, 0, Math.PI * 2)
      ctx.stroke()
    }
  }, [plotted, width, selected, year])

  const nearest = (ev: ReactMouseEvent<HTMLCanvasElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect()
    const x = ev.clientX - rect.left
    const y = ev.clientY - rect.top
    let best: Plotted | null = null
    let bestDist = HIT_RADIUS
    for (const p of plotted) {
      const dist = Math.hypot(p.x - x, p.y - y)
      // At equal distance prefer the riskier object, which is later in the list
      if (dist <= bestDist) {
        bestDist = dist
        best = p
      }
    }
    return best
  }

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h3 className="text-xs uppercase tracking-[0.15em] text-zinc-500 mb-3">Palermo scale against time</h3>
      <div ref={ref} className="relative">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: HEIGHT, display: 'block', cursor: hovered ? 'pointer' : 'default' }}
          role="img"
          aria-label="Chart of every object on the risk list by year and Palermo scale. The same objects are in the table below."
          onPointerMove={(ev) => setHovered(nearest(ev))}
          onPointerLeave={() => setHovered(null)}
          onClick={(ev) => {
            const hit = nearest(ev)
            if (hit) onSelect(hit.object)
          }}
        />
        {hovered && (
          <div className="absolute z-10 pointer-events-none bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-xs" style={{ left: Math.min(hovered.x + 12, Math.max(0, width - 210)), top: Math.max(0, Math.min(toY(hovered.object.palermo ?? 0) - 30, HEIGHT - 60)) }}>
            <div className="text-zinc-100">{hovered.object.name}</div>
            <div className="text-zinc-400">{oddsInWords(hovered.object.probability)}, from {hovered.object.firstYear}</div>
          </div>
        )}
      </div>
      <p className="text-xs text-zinc-500 mt-2">Each step on the Palermo scale is ten times the relative risk. Larger dots are larger objects. Time is compressed so the near future has room.</p>
    </section>
  )
}
