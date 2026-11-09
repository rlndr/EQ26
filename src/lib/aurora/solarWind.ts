import { bzBlend, couplingFromBz, particleCount, particleSpeed, standoffRadii, type WindRegion } from './magnetosphere'

export interface WindState {
  speed: number
  density: number
  bz: number
}

interface Particle {
  x: number
  y: number
  /** Personal speed variation, so the stream does not move as one sheet */
  pace: number
  /** Where along the height it entered, −1 to 1; stable, so paths stay smooth */
  lane: number
}

const MAX_PARTICLES = 440
const DEFAULT_WIND: WindState = { speed: 400, density: 5, bz: 0 }

/** Lerps a colour between rose (south), zinc (neutral) and sky (north) */
function streakColor(blend: number, alpha: number) {
  const rose = [244, 114, 182]
  const mid = [161, 161, 170]
  const sky = [56, 189, 248]
  const to = blend < 0 ? rose : sky
  const t = Math.abs(blend)
  const c = mid.map((m, i) => Math.round(m + (to[i] - m) * t))
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`
}

/**
 * The Sun-to-Earth strip on Canvas 2D. Schematic, not to scale; what it draws is driven by the
 * live readings. Lives outside React like the globe and reports only which part is under the
 * pointer.
 */
export class SolarWindStrip {
  readonly el: HTMLElement
  readonly canvas: HTMLCanvasElement
  onRegion: (region: WindRegion | null) => void = () => {}

  private ctx: CanvasRenderingContext2D | null
  private ro: ResizeObserver
  private io: IntersectionObserver
  private motionQuery: MediaQueryList
  private reducedMotion: boolean
  private raf = 0
  private last = 0
  private onScreen = true
  private width = 1
  private height = 1
  private time = 0

  private target: WindState = { ...DEFAULT_WIND }
  private wind: WindState = { ...DEFAULT_WIND }
  private particles: Particle[] = []
  private sun: HTMLImageElement | null = null
  private hover: WindRegion | null = null
  private dirty = true

  constructor(el: HTMLElement, canvas: HTMLCanvasElement) {
    this.el = el
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false })
    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    this.reducedMotion = this.motionQuery.matches
    this.motionQuery.addEventListener('change', this.applyMotion)
    this.resize()
    this.ro = new ResizeObserver(this.resize)
    this.ro.observe(el)
    this.io = new IntersectionObserver((entries) => {
      this.onScreen = entries[entries.length - 1].isIntersecting
    })
    this.io.observe(el)
    canvas.addEventListener('pointermove', this.onPointer)
    canvas.addEventListener('pointerleave', this.onLeave)

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({ x: Math.random(), y: 0, pace: 0.75 + Math.random() * 0.5, lane: (Math.random() * 2 - 1) })
    }
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.loop)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.io.disconnect()
    this.motionQuery.removeEventListener('change', this.applyMotion)
    this.canvas.removeEventListener('pointermove', this.onPointer)
    this.canvas.removeEventListener('pointerleave', this.onLeave)
    this.onRegion = () => {}
  }

  setWind(state: WindState) {
    this.target = state
    this.dirty = true
  }

  setSunImage(url: string) {
    const image = new Image()
    image.onload = () => {
      this.sun = image
      this.dirty = true
    }
    image.src = url
  }

  private applyMotion = () => {
    this.reducedMotion = this.motionQuery.matches
    this.dirty = true
  }

  private resize = () => {
    const w = Math.max(1, this.el.clientWidth)
    const h = Math.max(1, this.el.clientHeight)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.width = w
    this.height = h
    const bw = Math.round(w * dpr)
    const bh = Math.round(h * dpr)
    if (this.canvas.width !== bw) this.canvas.width = bw
    if (this.canvas.height !== bh) this.canvas.height = bh
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.dirty = true
  }

  /** Positions derived from the canvas size and the current wind */
  private layout() {
    const { width: w, height: h } = this
    const sunR = h * 0.92
    const sunX = -h * 0.42
    const earthX = w - Math.min(170, w * 0.2)
    const earthY = h / 2
    const earthR = h * 0.08
    const standoff = standoffRadii(Math.max(0.1, this.wind.density), Math.max(100, this.wind.speed))
    const nose = earthR * (1.1 + standoff * 0.26)
    const noseX = earthX - nose
    const curve = nose * 1.3
    const l1X = earthX - Math.min(260, w * 0.28)
    return { w, h, sunR, sunX, sunEdge: sunX + sunR, earthX, earthY, earthR, nose, noseX, curve, l1X }
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min((now - this.last) / 1000, 0.1)
    this.last = now
    if (!this.onScreen || !this.ctx) return
    if (this.reducedMotion && !this.dirty) return
    this.dirty = false
    this.step(this.reducedMotion ? 0 : dt)
    this.draw(this.ctx)
  }

  private step(dt: number) {
    this.time += dt
    const ease = dt === 0 ? 1 : Math.min(1, dt * 1.6)
    this.wind.speed += (this.target.speed - this.wind.speed) * ease
    this.wind.density += (this.target.density - this.wind.density) * ease
    this.wind.bz += (this.target.bz - this.wind.bz) * ease

    const L = this.layout()
    const count = particleCount(this.wind.density)
    const speed = particleSpeed(this.wind.speed)
    const span = L.w - L.sunEdge

    for (let i = 0; i < count; i++) {
      const p = this.particles[i]
      // Spread across the width first, as a stored fraction, the first time it is drawn
      if (p.y === 0) {
        p.x = L.sunEdge + p.x * span
        p.y = L.h / 2 + p.lane * L.h * 0.48
      }
      p.x += speed * p.pace * dt

      const dy = L.h / 2 + p.lane * L.h * 0.48 - L.earthY
      const shieldHalf = p.x > L.noseX ? Math.sqrt(2 * L.curve * (p.x - L.noseX + 8)) : 0
      // Slide along the boundary if the straight path would cross it
      if (Math.abs(dy) < shieldHalf) p.y = L.earthY + Math.sign(dy || 1) * shieldHalf
      else p.y = L.earthY + dy

      if (p.x > L.w + 30 || p.y < -30 || p.y > L.h + 30) {
        p.x = L.sunEdge - Math.random() * 40
        p.lane = Math.random() * 2 - 1
        p.y = L.h / 2 + p.lane * L.h * 0.48
      }
    }
  }

  private draw(ctx: CanvasRenderingContext2D) {
    const L = this.layout()
    ctx.fillStyle = '#050507'
    ctx.fillRect(0, 0, L.w, L.h)

    this.drawSun(ctx, L)
    this.drawStreaks(ctx)
    this.drawMagnetosphere(ctx, L)
    this.drawL1(ctx, L)
    this.drawEarth(ctx, L)
    this.drawLabels(ctx, L)
  }

  private drawSun(ctx: CanvasRenderingContext2D, L: ReturnType<SolarWindStrip['layout']>) {
    const y = L.h / 2
    if (this.sun) {
      // In SUVI frames the solar disc fills about 85% of the image width
      const side = (L.sunR * 2) / 0.85
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.drawImage(this.sun, L.sunX - side / 2, y - side / 2, side, side)
      ctx.restore()
      // The frame is square with faint corona out to its edges; fade it so no edge shows
      const fade = ctx.createRadialGradient(L.sunX, y, L.sunR * 1.02, L.sunX, y, side / 2)
      fade.addColorStop(0, 'rgba(5,5,7,0)')
      fade.addColorStop(1, 'rgba(5,5,7,1)')
      ctx.fillStyle = fade
      ctx.fillRect(0, 0, L.sunX + side / 2 + 2, L.h)
    } else {
      ctx.fillStyle = '#b45309'
      ctx.beginPath()
      ctx.arc(L.sunX, y, L.sunR, 0, Math.PI * 2)
      ctx.fill()
    }

    // Last, so the fade above cannot cut it off in a straight line
    const glow = ctx.createRadialGradient(L.sunX, y, L.sunR * 0.9, L.sunX, y, L.sunR * 1.5)
    glow.addColorStop(0, 'rgba(255,170,60,0.22)')
    glow.addColorStop(1, 'rgba(255,170,60,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, L.sunX + L.sunR * 1.6, L.h)
  }

  private drawStreaks(ctx: CanvasRenderingContext2D) {
    const count = particleCount(this.wind.density)
    const speed = particleSpeed(this.wind.speed)
    const length = speed * 0.035
    ctx.lineWidth = 1.1
    ctx.lineCap = 'round'
    ctx.strokeStyle = streakColor(bzBlend(this.wind.bz), 0.75)
    ctx.beginPath()
    for (let i = 0; i < count; i++) {
      const p = this.particles[i]
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - length * p.pace, p.y)
    }
    ctx.stroke()
  }

  private drawMagnetosphere(ctx: CanvasRenderingContext2D, L: ReturnType<SolarWindStrip['layout']>) {
    const coupling = couplingFromBz(this.wind.bz)
    const pulse = 0.55 + 0.45 * Math.sin(this.time * 3.2)

    // Dipole-shaped field lines, squashed on the sunward side and stretched into the tail
    ctx.lineWidth = 1
    for (const shell of [0.45, 0.72, 1]) {
      for (const side of [-1, 1]) {
        const stretch = side < 0 ? (L.nose * shell) / 1 : L.nose * shell * 2.1
        ctx.strokeStyle = `rgba(56,189,248,${0.16 + 0.2 * shell})`
        ctx.beginPath()
        for (let i = 0; i <= 40; i++) {
          const theta = (i / 40) * Math.PI
          const r = Math.sin(theta) * Math.sin(theta)
          const x = L.earthX + side * Math.sin(theta) * r * stretch
          const y = L.earthY + Math.cos(theta) * r * L.nose * shell * 0.95
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
    }

    // The boundary itself
    const color = coupling > 0.05 ? `rgba(244,114,182,${0.55 + 0.4 * pulse * coupling})` : 'rgba(56,189,248,0.75)'
    ctx.lineWidth = 1.6
    ctx.strokeStyle = this.hover === 'shield' ? '#d8b553' : color
    ctx.beginPath()
    for (let y = -L.h / 2 - 10; y <= L.h / 2 + 10; y += 4) {
      const x = L.noseX + (y * y) / (2 * L.curve)
      if (y === -L.h / 2 - 10) ctx.moveTo(x, L.earthY + y)
      else ctx.lineTo(x, L.earthY + y)
    }
    ctx.stroke()

    // Southward field: a flash at the nose and particles running down the field lines to the poles
    if (coupling > 0.02) {
      const flash = ctx.createRadialGradient(L.noseX, L.earthY, 0, L.noseX, L.earthY, L.earthR * 2.4)
      flash.addColorStop(0, `rgba(244,114,182,${0.7 * coupling * pulse})`)
      flash.addColorStop(1, 'rgba(244,114,182,0)')
      ctx.fillStyle = flash
      ctx.fillRect(L.noseX - L.earthR * 2.4, L.earthY - L.earthR * 2.4, L.earthR * 4.8, L.earthR * 4.8)

      ctx.fillStyle = 'rgba(244,114,182,0.9)'
      const pulses = 3 + Math.round(coupling * 5)
      for (const pole of [-1, 1]) {
        for (let i = 0; i < pulses; i++) {
          const t = (this.time * 0.5 + i / pulses) % 1
          const px = L.noseX + (L.earthX - L.noseX) * t
          const py = L.earthY + pole * Math.sin(t * Math.PI * 0.8) * L.nose * 0.7 + pole * t * L.earthR * 0.4
          ctx.beginPath()
          ctx.arc(px, py, 1.4, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
  }

  private drawL1(ctx: CanvasRenderingContext2D, L: ReturnType<SolarWindStrip['layout']>) {
    const x = L.l1X
    const y = L.h * 0.28
    ctx.strokeStyle = 'rgba(216,181,83,0.35)'
    ctx.setLineDash([3, 4])
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x, L.h - 22)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#d8b553'
    ctx.fillRect(x - 3, y - 3, 6, 6)
    ctx.fillRect(x - 11, y - 1, 6, 2)
    ctx.fillRect(x + 5, y - 1, 6, 2)
  }

  private drawEarth(ctx: CanvasRenderingContext2D, L: ReturnType<SolarWindStrip['layout']>) {
    const r = L.earthR
    const body = ctx.createLinearGradient(L.earthX - r, 0, L.earthX + r, 0)
    body.addColorStop(0, '#60a5fa')
    body.addColorStop(0.55, '#1d4ed8')
    body.addColorStop(1, '#0b1a3e')
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.arc(L.earthX, L.earthY, r, 0, Math.PI * 2)
    ctx.fill()

    // Aurora caps grow with coupling
    const coupling = couplingFromBz(this.wind.bz)
    const strength = 0.5 + coupling * 0.5
    ctx.strokeStyle = `rgba(52,211,153,${strength})`
    ctx.shadowColor = '#34d399'
    ctx.shadowBlur = 6 + coupling * 12
    ctx.lineWidth = 2 + coupling * 1.5
    for (const pole of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(L.earthX, L.earthY + pole * r * 0.88, r * 0.46, r * 0.14, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.shadowBlur = 0
  }

  private drawLabels(ctx: CanvasRenderingContext2D, L: ReturnType<SolarWindStrip['layout']>) {
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    const label = (text: string, x: number, y: number, region: WindRegion) => {
      ctx.fillStyle = this.hover === region ? '#d8b553' : '#a1a1aa'
      ctx.fillText(text, x, y)
    }
    label('L1 monitor', L.l1X, L.h - 8, 'l1')
    label('Earth', L.earthX, L.h - 8, 'earth')
    label('Sun', Math.max(22, L.sunEdge - 40), L.h - 8, 'sun')
    label('Magnetosphere', L.noseX, 14, 'shield')
  }

  private onPointer = (ev: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect()
    const x = ev.clientX - rect.left
    const y = ev.clientY - rect.top
    const L = this.layout()
    let region: WindRegion = 'wind'
    if (x < L.sunEdge + 8) region = 'sun'
    else if (Math.hypot(x - L.earthX, y - L.earthY) < L.earthR * 2) region = 'earth'
    else if (Math.abs(x - L.l1X) < 22) region = 'l1'
    else if (Math.abs(x - (L.noseX + ((y - L.earthY) ** 2) / (2 * L.curve))) < 16) region = 'shield'
    this.setHover(region)
  }

  private onLeave = () => this.setHover(null)

  private setHover(region: WindRegion | null) {
    if (region === this.hover) return
    this.hover = region
    this.dirty = true
    this.onRegion(region)
  }
}
