import { useQuery } from '@tanstack/react-query'
import { objectQuery } from '../../lib/nearearth/api'
import { comparedToHiroshima, formatEnergy, ktFromMt } from '../../lib/nearearth/energy'
import type { Flyby, RiskObject } from '../../lib/nearearth/parse'
import { auToLd, formatLength, oddsInWords, PALERMO_BAND_LABELS, palermoBand } from '../../lib/nearearth/scale'

/** Below about this size objects are expected to break up high in the atmosphere, as Chelyabinsk did */
const BREAKS_UP_KM = 0.025

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 border-t border-zinc-800/70 text-sm">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-zinc-200 text-right">{value}</dd>
    </div>
  )
}

const torinoText = (torino: number | null) =>
  torino === null ? 'Beyond its 100-year range' : String(torino)

interface Props {
  object: RiskObject | null
  passing: Flyby | null
  onShowFlyby: (flyby: Flyby) => void
}

export default function RiskDetail({ object, passing, onShowFlyby }: Props) {
  const detail = useQuery(objectQuery(object?.des ?? null))
  const sentry = detail.data?.sentry ?? null

  if (!object) {
    return (
      <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <p className="text-sm text-zinc-500">Pick an object to see the details.</p>
      </section>
    )
  }

  const band = object.palermo !== null ? palermoBand(object.palermo) : null
  const small = object.diameterKm !== null && object.diameterKm < BREAKS_UP_KM

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h3 className="text-lg text-zinc-100">{object.name}</h3>
      <p className="text-xs text-zinc-500 mb-3">
        {detail.data?.orbitClass ? `${detail.data.orbitClass} asteroid` : 'Asteroid'}{detail.data?.hazardous ? ', classed as potentially hazardous' : ''}
      </p>

      {sentry?.removed ? (
        <p className="text-sm text-emerald-400">This object has now been cleared from the risk list.</p>
      ) : (
        <>
          <p className="text-2xl font-semibold text-rose-400">{oddsInWords(object.probability)}</p>
          <p className="text-sm text-zinc-400 mb-3">Chance of impact{object.impactCount !== null && object.impactCount > 1 ? ', across all possible dates' : ''}</p>

          <dl>
            <Fact label="Palermo" value={object.palermo !== null ? object.palermo.toFixed(2) : 'Unknown'} />
            {band && <Fact label="Which means" value={PALERMO_BAND_LABELS[band]} />}
            <Fact label="Torino" value={torinoText(object.torino)} />
            <Fact label="Size" value={object.diameterKm !== null ? formatLength(object.diameterKm * 1000) : 'Unknown'} />
            <Fact label="Possible dates" value={object.impactCount !== null ? object.impactCount.toLocaleString() : 'Unknown'} />
            {sentry?.energyMt !== null && sentry?.energyMt !== undefined && (
              <Fact label="If it hit" value={`${formatEnergy(ktFromMt(sentry.energyMt))}, ${comparedToHiroshima(ktFromMt(sentry.energyMt))}`} />
            )}
          </dl>

          {small && <p className="text-sm text-zinc-400 mt-3">An object this small would be expected to break up high in the atmosphere, as Chelyabinsk did.</p>}

          {sentry && sentry.impacts.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-zinc-500 mb-1">Likeliest dates</p>
              <ul className="text-sm font-mono text-zinc-300 space-y-0.5">
                {sentry.impacts.slice(0, 4).map((impact) => (
                  <li key={impact.date} className="flex justify-between gap-3">
                    <span>{impact.date.slice(0, 10)}</span>
                    <span className="text-zinc-400">{oddsInWords(impact.probability)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {detail.isError && <p className="text-xs text-zinc-500 mt-3">More detail is unavailable right now.</p>}

      {passing && (
        <button onClick={() => onShowFlyby(passing)} className="mt-3 text-sm text-sky-400 hover:underline text-left">
          Also passing soon, at {auToLd(passing.distAu).toFixed(1)} lunar distances. See its path
        </button>
      )}
    </section>
  )
}
