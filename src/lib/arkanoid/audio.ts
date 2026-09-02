import type { SoundName } from './engine'

/** freq (Hz), length (s), waveform */
const TONES: Record<SoundName, [number, number, OscillatorType]> = {
  wall: [220, 0.03, 'square'],
  brick: [520, 0.045, 'square'],
  solid: [150, 0.05, 'square'],
  paddle: [330, 0.04, 'square'],
  power: [720, 0.12, 'triangle'],
  lose: [90, 0.35, 'sawtooth'],
}

/**
 * Square-wave blips synthesised on the fly. No audio files to ship, and it is the right sound
 * for the era. The context can only be created after a user gesture under browser autoplay
 * policy, so construction is lazy.
 */
export class Audio {
  private ctx: AudioContext | null = null
  muted = false

  private ensure() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      this.ctx = new Ctor()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  /** Call from a real user gesture — autoplay policy will not let us start the clock otherwise. */
  unlock() {
    this.ensure()
  }

  play(name: SoundName) {
    if (this.muted) return
    const ctx = this.ensure()
    if (!ctx) return

    const [freq, len, type] = TONES[name]
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    // Quick decay envelope; a raw gate would click
    gain.gain.setValueAtTime(0.06, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + len)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + len)
  }

  close() {
    void this.ctx?.close()
    this.ctx = null
  }
}
