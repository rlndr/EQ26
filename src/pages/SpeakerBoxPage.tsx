import { useState, type ReactNode } from 'react'
import EnclosureView3D from '../components/EnclosureView3D'
import {
  BUTTERWORTH_Q, deviation, hasDriver, litresToCuFt, portedTarget, sealedTarget, verdict,
  type Driver,
} from '../lib/enclosure/alignment'
import { boardArea, cutList, isExactCutList } from '../lib/enclosure/cutlist'
import { lengthForTuning, portDisplacement, tuningFrequency } from '../lib/enclosure/ports'
import {
  baffleLength, grossVolume, interior, MAX_ANGLE, netVolume, THICKNESSES, topDepth, validate,
  type Enclosure, type Thickness,
} from '../lib/enclosure/volume'

const num = (s: string, fallback = 0) => {
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : fallback
}
const fmt = (n: number, dp = 3) => n.toFixed(dp)

// Defaults describe a real-ish 12" subwoofer design that is deliberately *not* a perfect
// match — the volume lands close but the ports come out short, which shows what the tool is for.
const DEFAULTS = {
  width: '24', height: '16', depth: '14',
  thickness: 0.75 as Thickness,
  angle: '0',
  type: 'ported' as 'sealed' | 'ported',
  portDia: '3', portLen: '10', portCount: '2',
  driverDisp: '0.15', bracing: '0',
  qtc: '0.707',
  vas: '56.6', vasUnit: 'L' as 'L' | 'ft3',
  qts: '0.40', fs: '30',
}

export default function SpeakerBoxPage() {
  const [d, setD] = useState(DEFAULTS)
  const [hideTop, setHideTop] = useState(true)
  const [hideFront, setHideFront] = useState(false)
  const set = <K extends keyof typeof DEFAULTS>(k: K, v: (typeof DEFAULTS)[K]) =>
    setD((prev) => ({ ...prev, [k]: v }))

  const enclosure: Enclosure = {
    width: num(d.width), height: num(d.height), depth: num(d.depth),
    thickness: d.thickness, angle: num(d.angle),
  }
  const angled = enclosure.angle > 0
  const errors = validate(enclosure)
  const ok = errors.length === 0

  const gross = ok ? grossVolume(enclosure) : 0
  const ported = d.type === 'ported'
  const portSpec = ported
    ? { diameter: num(d.portDia), length: num(d.portLen), count: Math.round(num(d.portCount)) }
    : null
  const portDisp = portSpec ? portDisplacement(portSpec) : 0
  const displacements = { driver: num(d.driverDisp), ports: portDisp, bracing: num(d.bracing) }
  const net = netVolume(gross, displacements)
  const fb = portSpec && ok ? tuningFrequency(portSpec, net) : null

  const driver: Driver = {
    vas: d.vasUnit === 'L' ? litresToCuFt(num(d.vas)) : num(d.vas),
    qts: num(d.qts),
    fs: num(d.fs),
  }
  const qtc = num(d.qtc, BUTTERWORTH_Q)
  const driverGiven = hasDriver(driver)
  const target = !driverGiven ? null : ported ? portedTarget(driver) : sealedTarget(driver, qtc)
  // Distinguishes "no driver entered" from "this driver cannot work sealed at that Q"
  const sealedImpossible = driverGiven && !ported && target === null

  const volDev = target ? deviation(net, target.vb) : null
  const tuneDev = target && fb ? deviation(fb, target.f) : null
  const neededLength =
    target && portSpec && ok
      ? lengthForTuning(portSpec.diameter, portSpec.count, target.f, net)
      : null

  const panels = ok ? cutList(enclosure) : []

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-brass mb-2">Speaker Box Designer</h1>
      <p className="text-zinc-400 mb-6 max-w-3xl">
        Work out the interior volume of a loudspeaker enclosure and check it against what the
        driver actually wants. Enter the outside dimensions and panel thickness, and optionally
        slope the front baffle. Displacement from the driver and ports is subtracted to give the
        net volume the speaker really sees.
      </p>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        {/* ---------------- inputs ---------------- */}
        <div className="space-y-4">
          <Panel title="Enclosure">
            <Field label="Width" value={d.width} onChange={(v) => set('width', v)} suffix="in" />
            <Field label="Height" value={d.height} onChange={(v) => set('height', v)} suffix="in" />
            <Field label="Depth" value={d.depth} onChange={(v) => set('depth', v)} suffix="in" />
            <Row label="Material">
              <div className="flex gap-1">
                {THICKNESSES.map((t) => (
                  <button
                    key={t}
                    onClick={() => set('thickness', t)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors border ${
                      d.thickness === t
                        ? 'border-brass bg-brass/10 text-brass'
                        : 'border-zinc-700 text-zinc-400 hover:text-brass'
                    }`}
                  >
                    {t === 0.75 ? '3/4"' : '1"'}
                  </button>
                ))}
              </div>
            </Row>
            <Field label="Baffle angle" value={d.angle} onChange={(v) => set('angle', v)} suffix="°" />
            <p className="text-xs text-zinc-600">
              {angled
                ? `Baffle leans back ${fmt(enclosure.angle, 1)}°, so the top is ${fmt(topDepth(enclosure), 2)}" deep against ${fmt(enclosure.depth, 2)}" at the bottom. The baffle panel itself is ${fmt(baffleLength(enclosure), 2)}" long.`
                : `0° is a plain rectangular box. Up to ${MAX_ANGLE}° slopes the front baffle back as it rises, so depth is measured at the bottom.`}
            </p>
            {errors.map((e) => (
              <p key={e} className="text-xs text-rose-400 bg-rose-400/10 border border-rose-400/20 rounded px-2 py-1">
                {e}
              </p>
            ))}
          </Panel>

          <Panel title="Type">
            <Row label="Enclosure type">
              <div className="flex gap-1">
                {(['sealed', 'ported'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => set('type', t)}
                    className={`px-3 py-1 rounded text-xs font-medium capitalize transition-colors border ${
                      d.type === t
                        ? 'border-brass bg-brass/10 text-brass'
                        : 'border-zinc-700 text-zinc-400 hover:text-brass'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Row>
            {ported ? (
              <>
                <Field label="Port diameter" value={d.portDia} onChange={(v) => set('portDia', v)} suffix="in" />
                <Field label="Port length" value={d.portLen} onChange={(v) => set('portLen', v)} suffix="in" />
                <Field label="Number of ports" value={d.portCount} onChange={(v) => set('portCount', v)} suffix="" />
              </>
            ) : (
              <Field label="Target Qtc" value={d.qtc} onChange={(v) => set('qtc', v)} suffix="" />
            )}
          </Panel>

          <Panel title="Displacement">
            <Field label="Driver" value={d.driverDisp} onChange={(v) => set('driverDisp', v)} suffix="ft³" />
            <Field label="Bracing" value={d.bracing} onChange={(v) => set('bracing', v)} suffix="ft³" />
            {ported && (
              <Row label="Ports">
                <span className="font-mono text-sm text-zinc-300">{fmt(portDisp)} ft³</span>
              </Row>
            )}
            <p className="text-xs text-zinc-600">
              Driver displacement is on the spec sheet — typically 0.1–0.2 ft³ for a 12" driver.
              Port displacement is calculated for you.
            </p>
          </Panel>

          <Panel title="Driver (optional)">
            <Row label="Vas">
              <span className="flex items-center gap-1">
                <input
                  value={d.vas}
                  onChange={(e) => set('vas', e.target.value)}
                  inputMode="decimal"
                  className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-right font-mono text-sm text-zinc-100 focus:border-brass focus:outline-none"
                />
                <div className="flex gap-0.5">
                  {(['L', 'ft3'] as const).map((u) => (
                    <button
                      key={u}
                      onClick={() => set('vasUnit', u)}
                      className={`px-1.5 py-1 rounded text-[11px] border transition-colors ${
                        d.vasUnit === u
                          ? 'border-brass bg-brass/10 text-brass'
                          : 'border-zinc-700 text-zinc-500 hover:text-brass'
                      }`}
                    >
                      {u === 'L' ? 'L' : 'ft³'}
                    </button>
                  ))}
                </div>
              </span>
            </Row>
            <Field label="Qts" value={d.qts} onChange={(v) => set('qts', v)} suffix="" />
            <Field label="Fs" value={d.fs} onChange={(v) => set('fs', v)} suffix="Hz" />
            <p className="text-xs text-zinc-600">
              Most drivers publish Vas in litres — check the unit, a mix-up is a 28× error.
            </p>
          </Panel>
        </div>

        {/* ---------------- view + results ---------------- */}
        <div className="space-y-4">
          <EnclosureView3D
            width={enclosure.width}
            height={enclosure.height}
            depth={enclosure.depth}
            thickness={d.thickness}
            angle={enclosure.angle}
            ports={portSpec && portSpec.count > 0 ? { diameter: portSpec.diameter, count: portSpec.count } : null}
            hideTop={hideTop}
            hideFront={hideFront}
          />
          <div className="flex gap-4 text-xs text-zinc-400">
            <Check checked={hideTop} onChange={setHideTop} label="Open top" />
            <Check checked={hideFront} onChange={setHideFront} label="Open front" />
          </div>

          <Panel title="Volume">
            <Line label="Gross interior" value={`${fmt(gross)} ft³`} />
            {ported && <Line label="− Ports" value={`${fmt(portDisp)} ft³`} dim />}
            <Line label="− Driver" value={`${fmt(displacements.driver)} ft³`} dim />
            {displacements.bracing > 0 && <Line label="− Bracing" value={`${fmt(displacements.bracing)} ft³`} dim />}
            <div className="border-t border-zinc-800 pt-2 mt-1">
              <Line label="Net volume" value={`${fmt(net)} ft³`} strong />
            </div>
            {ok && (() => {
              const i = interior(enclosure)
              return (
                <p className="text-xs text-zinc-600">
                  Interior {fmt(i.width, 2)}" × {fmt(i.height, 2)}" ×{' '}
                  {angled
                    ? `${fmt(i.depthBottom, 2)}" at the bottom tapering to ${fmt(i.depthTop, 2)}" at the top`
                    : `${fmt(i.meanDepth, 2)}"`}
                </p>
              )
            })()}
          </Panel>

          {ported && (
            <Panel title="Tuning">
              <Line
                label="Tuned to"
                value={fb ? `${fb.toFixed(1)} Hz` : '—'}
                strong
              />
              <p className="text-xs text-zinc-600">
                {portSpec?.count ?? 0} × {d.portDia}" port{(portSpec?.count ?? 0) === 1 ? '' : 's'}, {d.portLen}" long.
                Port count moves tuning hard — doubling the ports raises it by roughly half again.
              </p>
            </Panel>
          )}

          <Panel title="Match">
            {!driverGiven && (
              <p className="text-sm text-zinc-500">
                Enter Vas, Qts and Fs to check this box against the driver.
              </p>
            )}
            {sealedImpossible && (
              <p className="text-sm text-amber-400">
                Qts ({fmt(driver.qts, 2)}) is at or above the target Qtc ({fmt(qtc, 3)}), so no
                sealed box can reach that alignment — however large. Lower the target Qtc, or use
                a ported enclosure.
              </p>
            )}
            {target && (
              <>
                <Line label="Target volume" value={`${fmt(target.vb)} ft³`} />
                <Line label={ported ? 'Target tuning' : 'System Fc'} value={`${target.f.toFixed(1)} Hz`} />
                <Line label="Predicted F3" value={`${target.f3.toFixed(1)} Hz`} dim />
                <div className="border-t border-zinc-800 pt-2 mt-1 space-y-1.5">
                  <Verdict label="Volume" percent={volDev} />
                  {ported && <Verdict label="Tuning" percent={tuneDev} />}
                </div>
                {ported && neededLength !== null && (
                  <p className="text-xs text-zinc-500">
                    For {target.f.toFixed(1)} Hz these ports would need to be{' '}
                    <span className="font-mono text-brass">{neededLength.toFixed(1)}"</span> long.
                  </p>
                )}
              </>
            )}
          </Panel>
        </div>
      </div>

      {ok && (
        <div className="mt-6">
          <Panel title="Cut list">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-zinc-500 border-b border-zinc-800">
                  <th className="text-left font-normal py-1">Panel</th>
                  <th className="text-right font-normal py-1">Qty</th>
                  <th className="text-right font-normal py-1">Size</th>
                </tr>
              </thead>
              <tbody>
                {panels.map((p) => (
                  <tr key={p.name} className="border-b border-zinc-800/50 last:border-0">
                    <td className="py-1.5 text-zinc-300">
                      {p.name}
                      {p.note && <span className="block text-xs text-zinc-600">{p.note}</span>}
                    </td>
                    <td className="py-1.5 text-right font-mono text-zinc-400 align-top">{p.qty}</td>
                    <td className="py-1.5 text-right font-mono text-zinc-400 align-top">
                      {p.width2 === undefined
                        ? `${fmt(p.width, 2)}" × ${fmt(p.height, 2)}"`
                        : `${fmt(p.width, 2)}"→${fmt(p.width2, 2)}" × ${fmt(p.height, 2)}"`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-zinc-600">
              All panels {d.thickness === 0.75 ? '3/4"' : '1"'} stock —{' '}
              <span className="font-mono text-zinc-400">{fmt(boardArea(panels), 2)} ft²</span> of
              board.{' '}
              {isExactCutList(enclosure)
                ? 'Butt joints; other joinery gives a different cut list but the same interior volume.'
                : 'Outside face sizes before bevelling — a sloped baffle needs bevelled edges where it meets the top and bottom, and the bevel depends on the joinery you choose.'}
            </p>
          </Panel>
        </div>
      )}

      <p className="mt-6 text-xs text-zinc-600 max-w-3xl">
        Alignment figures use the standard sealed and Small vented-box approximations, not a full
        transfer-function simulation — close enough to design around, but WinISD or similar is the
        tool for final work. Assumes a plain rectangular box; divided chambers and non-rectangular
        enclosures break the model. Port air velocity is not modelled, so an undersized port may
        still "chuff" at high output even when the tuning is right.
      </p>
    </div>
  )
}

/* ---------------- small presentational helpers ---------------- */

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2.5">
      <h2 className="text-xs uppercase tracking-[0.15em] text-zinc-500">{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-zinc-400">{label}</span>
      {children}
    </div>
  )
}

function Field({
  label, value, onChange, suffix,
}: { label: string; value: string; onChange: (v: string) => void; suffix: string }) {
  return (
    <Row label={label}>
      <span className="flex items-center gap-1.5">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-right font-mono text-sm text-zinc-100 focus:border-brass focus:outline-none"
        />
        <span className="w-6 text-xs text-zinc-500">{suffix}</span>
      </span>
    </Row>
  )
}

function Line({ label, value, dim, strong }: { label: string; value: string; dim?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={`text-sm ${dim ? 'text-zinc-500' : 'text-zinc-400'}`}>{label}</span>
      <span className={`font-mono ${strong ? 'text-lg text-brass' : dim ? 'text-sm text-zinc-500' : 'text-sm text-zinc-200'}`}>
        {value}
      </span>
    </div>
  )
}

function Verdict({ label, percent }: { label: string; percent: number | null }) {
  const v = verdict(percent)
  const tone =
    v === 'good' ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10'
      : v === 'close' ? 'text-amber-400 border-amber-400/30 bg-amber-400/10'
        : 'text-rose-400 border-rose-400/30 bg-rose-400/10'
  const text =
    percent === null ? 'no reading'
      : `${percent >= 0 ? '+' : ''}${percent.toFixed(0)}%${v === 'good' ? ' — good match' : v === 'close' ? ' — workable' : ' — off target'}`
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className={`text-xs font-medium px-2 py-0.5 rounded border ${tone}`}>{text}</span>
    </div>
  )
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-brass"
      />
      {label}
    </label>
  )
}
