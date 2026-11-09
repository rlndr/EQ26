import { STORM_PRESETS, type StormPreset } from '../../lib/aurora/stormModel'

interface Props {
  activePreset: string | null
  /** Slider position; follows the preset or the live Kp when nothing is selected */
  kp: number
  onPreset: (preset: StormPreset) => void
  onKp: (kp: number) => void
}

export default function StormControls({ activePreset, kp, onPreset, onKp }: Props) {
  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div>
          <h2 className="text-xs uppercase tracking-[0.15em] text-zinc-500">Storm Time Machine</h2>
          <p className="text-xs text-zinc-600">See how far south a storm reaches</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STORM_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => onPreset(preset)}
              aria-pressed={activePreset === preset.id}
              title={preset.detail}
              className={`px-2.5 py-1 rounded border text-xs transition-colors ${
                activePreset === preset.id ? 'border-brass bg-brass/10 text-brass' : 'border-zinc-700 text-zinc-300 hover:text-brass hover:border-brass'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 flex-1 min-w-[200px]">
          <span className="text-xs text-zinc-500">Kp</span>
          <input
            type="range"
            min={0}
            max={9}
            step={0.1}
            value={kp}
            onChange={(ev) => onKp(Number(ev.target.value))}
            className="flex-1 accent-[#d8b553]"
          />
          <span className="font-mono text-sm text-zinc-200 w-8 text-right">{kp.toFixed(1)}</span>
        </label>
      </div>
    </section>
  )
}
