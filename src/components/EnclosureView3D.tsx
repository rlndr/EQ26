import {
  useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode,
} from 'react'

interface Props {
  /** Outside dimensions, inches. `depth` is measured at the bottom. */
  width: number
  height: number
  depth: number
  thickness: number
  /** Baffle slope from vertical, degrees. 0 renders a plain rectangular box. */
  angle: number
  /** Port geometry for the baffle, or null for a sealed box. */
  ports: { diameter: number; count: number } | null
  hideTop: boolean
  hideFront: boolean
}

const VIEW_H = 380

// Explicit per-face colours rather than a brightness filter: `filter` creates a stacking
// context that breaks `preserve-3d` in some browsers.
const OUTER = {
  front: '#a8821f',
  back: '#6b5416',
  right: '#94721b',
  left: '#7d5f18',
  top: '#c2a03a',
  bottom: '#5a4713',
}
const CAVITY = '#101013'
const EDGE = '#d8b553'

const deg = (r: number) => (r * 180) / Math.PI

/**
 * Faces of a wedge: a box whose front leans back, so the top is shallower than the bottom.
 * `dBottom === dTop` gives an ordinary rectangular box.
 *
 * Geometry is centred on the bottom footprint — z spans -dBottom/2 to +dBottom/2 — so the back
 * panel stays a plain vertical plane and only the front has to move.
 */
function wedgeFaces(opts: {
  w: number
  h: number
  dBottom: number
  dTop: number
  keyPrefix: string
  color: (face: keyof typeof OUTER) => string
  /** Faces to draw as an open rim instead of a solid panel. */
  rims?: Partial<Record<'top' | 'front', CSSProperties>>
  /** Faces to omit entirely (used for the cavity, so you can see into it). */
  omit?: Set<'top' | 'front'>
  backChildren?: ReactNode
}): ReactNode[] {
  const { w, h, dBottom: db, dTop: dt, keyPrefix, color, rims, omit, backChildren } = opts

  const slant = Math.hypot(h, db - dt)
  const theta = Math.atan2(db - dt, h)
  // Percentage along each side panel where the sloped top edge begins
  const sideCut = db > 0 ? ((db - dt) / db) * 100 : 0

  const base: CSSProperties = { position: 'absolute', left: '50%', top: '50%', boxSizing: 'border-box' }
  const place = (wpx: number, hpx: number, transform: string): CSSProperties => ({
    ...base,
    width: wpx,
    height: hpx,
    marginLeft: -wpx / 2,
    marginTop: -hpx / 2,
    transform,
  })

  const nodes: ReactNode[] = []

  // Back — always a plain vertical rectangle, and where the ports live
  nodes.push(
    <div key={`${keyPrefix}-back`}
      style={{ ...place(w, h, `rotateY(180deg) translateZ(${db / 2}px)`), background: color('back') }}>
      {backChildren}
    </div>,
  )

  // Bottom — full footprint
  nodes.push(
    <div key={`${keyPrefix}-bottom`}
      style={{ ...place(w, db, `translate3d(0, ${h / 2}px, 0) rotateX(90deg)`), background: color('bottom') }} />,
  )

  // Top — shallower once the baffle leans, and pushed back to sit flush with the back panel
  if (!omit?.has('top')) {
    const topStyle = place(w, dt, `translate3d(0, ${-h / 2}px, ${-db / 2 + dt / 2}px) rotateX(90deg)`)
    nodes.push(
      <div key={`${keyPrefix}-top`}
        style={rims?.top
          ? { ...topStyle, ...rims.top }
          : { ...topStyle, background: color('top') }} />,
    )
  }

  // Baffle — longer than the box is tall once it slopes, rotated about its own centre
  if (!omit?.has('front')) {
    const baffleStyle = place(w, slant, `translate3d(0, 0, ${dt / 2}px) rotateX(${deg(theta)}deg)`)
    nodes.push(
      <div key={`${keyPrefix}-front`}
        style={rims?.front
          ? { ...baffleStyle, ...rims.front }
          : { ...baffleStyle, background: color('front') }} />,
    )
  }

  // Sides — trapezoids, clipped. The two faces mirror because rotateY(+90) and rotateY(-90)
  // put local x at opposite ends of the depth axis.
  nodes.push(
    <div key={`${keyPrefix}-right`}
      style={{
        ...place(db, h, `translate3d(${w / 2}px, 0, 0) rotateY(90deg)`),
        background: color('right'),
        clipPath: `polygon(${sideCut}% 0, 100% 0, 100% 100%, 0 100%)`,
      }} />,
  )
  nodes.push(
    <div key={`${keyPrefix}-left`}
      style={{
        ...place(db, h, `translate3d(${-w / 2}px, 0, 0) rotateY(-90deg)`),
        background: color('left'),
        clipPath: `polygon(0 0, ${100 - sideCut}% 0, 100% 100%, 0 100%)`,
      }} />,
  )

  return nodes
}

export default function EnclosureView3D({
  width, height, depth, thickness, angle, ports, hideTop, hideFront,
}: Props) {
  const [rot, setRot] = useState({ x: -22, y: -32 })
  const drag = useRef<{ x: number; y: number } | null>(null)

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    const dy = e.clientY - drag.current.y
    drag.current = { x: e.clientX, y: e.clientY }
    setRot((r) => ({
      // Clamped so the box cannot tumble past vertical and leave the viewer disoriented
      x: Math.max(-85, Math.min(85, r.x - dy * 0.4)),
      y: r.y + dx * 0.4,
    }))
  }
  const endDrag = () => { drag.current = null }

  const rad = (angle * Math.PI) / 180
  const tan = Math.tan(rad)
  const sec = 1 / Math.cos(rad)

  const topDepthIn = depth - height * tan
  const innerBottomIn = depth - thickness * tan - thickness * sec - thickness
  const innerTopIn = depth - (height - thickness) * tan - thickness * sec - thickness

  const valid =
    width > 2 * thickness && height > 2 * thickness && depth > 2 * thickness &&
    topDepthIn > 0 && innerTopIn > 0

  const maxDim = Math.max(width, height, depth, 1)
  const scale = (VIEW_H * 0.5) / maxDim // px per inch

  const w = width * scale
  const h = height * scale
  const db = depth * scale
  const dt = topDepthIn * scale
  const t = thickness * scale
  const ib = innerBottomIn * scale
  const it = innerTopIn * scale

  // Exact rim widths. A leaning panel does not eat a uniform `t` off the opening: measured
  // along the slope it costs t/cos, and on the top face the front edge costs only t*(sec - tan)
  // while the back edge still costs a plain t. At 0 deg both reduce to t.
  const rims: Partial<Record<'top' | 'front', CSSProperties>> = {}
  const rimBase: CSSProperties = {
    borderStyle: 'solid',
    borderColor: EDGE,
    background: 'transparent',
  }
  if (hideTop) {
    rims.top = {
      ...rimBase,
      borderTopWidth: t,                 // back edge
      borderBottomWidth: t * (sec - tan), // front edge, shortened by the lean
      borderLeftWidth: t,
      borderRightWidth: t,
    }
  }
  if (hideFront) {
    rims.front = {
      ...rimBase,
      borderTopWidth: t * sec,
      borderBottomWidth: t * sec,
      borderLeftWidth: t,
      borderRightWidth: t,
    }
  }

  const portRow = ports && ports.count > 0 && ports.diameter > 0 && (
    <div className="absolute inset-0 flex items-end justify-center gap-[6%] pb-[12%]">
      {Array.from({ length: Math.min(ports.count, 8) }).map((_, i) => (
        <div
          key={i}
          style={{
            width: ports.diameter * scale,
            height: ports.diameter * scale,
            borderRadius: '50%',
            background: '#0a0a0c',
            boxShadow: `inset 0 0 0 ${Math.max(1, t * 0.35)}px rgba(0,0,0,0.6)`,
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  )

  const omit = new Set<'top' | 'front'>()
  if (hideTop) omit.add('top')
  if (hideFront) omit.add('front')

  return (
    <div
      className="relative w-full select-none touch-none cursor-grab active:cursor-grabbing overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950"
      style={{ height: VIEW_H, perspective: '1400px' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role="img"
      aria-label={
        angle > 0
          ? `3D preview of a ${width} by ${height} inch enclosure, ${depth} inches deep at the bottom with a ${angle} degree sloped baffle`
          : `3D preview of a ${width} by ${height} by ${depth} inch enclosure`
      }
    >
      {valid ? (
        <div
          className="absolute left-1/2 top-1/2"
          style={{ transformStyle: 'preserve-3d', transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)` }}
        >
          {wedgeFaces({
            w, h, dBottom: db, dTop: dt,
            keyPrefix: 'out',
            color: (f) => OUTER[f],
            rims,
            backChildren: portRow,
          })}
          {/* Cavity, offset so its back sits one panel thickness inside the outer back */}
          <div
            style={{
              position: 'absolute',
              transformStyle: 'preserve-3d',
              transform: `translateZ(${-db / 2 + t + ib / 2}px)`,
            }}
          >
            {wedgeFaces({
              w: w - 2 * t, h: h - 2 * t, dBottom: ib, dTop: it,
              keyPrefix: 'cav',
              color: () => CAVITY,
              omit,
            })}
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-600 px-6 text-center">
          Enter valid dimensions to see the enclosure
        </div>
      )}
      <p className="absolute bottom-2 left-0 right-0 text-center text-[11px] text-zinc-600">
        drag to rotate
      </p>
    </div>
  )
}
