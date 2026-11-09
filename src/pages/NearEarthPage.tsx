import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import FireballPanel from '../components/nearearth/FireballPanel'
import EnergyLadder, { type LadderItem } from '../components/nearearth/EnergyLadder'
import FlybyTable from '../components/nearearth/FlybyTable'
import FlybyView from '../components/nearearth/FlybyView'
import ImpactGlobeStage from '../components/nearearth/ImpactGlobeStage'
import PassChart from '../components/nearearth/PassChart'
import RiskChart from '../components/nearearth/RiskChart'
import RiskDetail from '../components/nearearth/RiskDetail'
import RiskTable from '../components/nearearth/RiskTable'
import SectionNav from '../components/nearearth/SectionNav'
import YearHistogram from '../components/nearearth/YearHistogram'
import { timeAgo } from '../lib/aurora/format'
import { fireballsQuery, flybysQuery, objectQuery, riskQuery } from '../lib/nearearth/api'
import { ktFromMt } from '../lib/nearearth/energy'
import type { ImpactGlobe } from '../lib/nearearth/impactGlobe'
import { buildMarkers, timeFraction, yearBounds, type LocatedFireball } from '../lib/nearearth/markers'
import type { Fireball, Flyby, RiskObject } from '../lib/nearearth/parse'
import { auToLd } from '../lib/nearearth/scale'
import { scrollToSection } from '../lib/nearearth/sections'

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="sm:text-right">
      <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-400">{label}</p>
      <p className="font-mono text-sm text-zinc-100">{value}</p>
      {detail && <p className="text-xs text-zinc-400">{detail}</p>}
    </div>
  )
}

const FeedError = ({ what }: { what: string }) => (
  <p className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-sm text-rose-400">Could not load {what} from NASA JPL.</p>
)
const Loading = () => <p className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-500">Loading…</p>

export default function NearEarthPage() {
  const [now, setNow] = useState(() => Date.now())
  const fireballs = useQuery(fireballsQuery)
  const flybys = useQuery(flybysQuery)
  const risk = useQuery(riskQuery)
  const [selectedFireball, setSelectedFireball] = useState<LocatedFireball | null>(null)
  const globeRef = useRef<ImpactGlobe | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [selectedFlyby, setSelectedFlyby] = useState<Flyby | null>(null)
  const [selectedRisk, setSelectedRisk] = useState<RiskObject | null>(null)
  // The ladder shows whichever fireball or risk object was picked most recently
  const [ladderSource, setLadderSource] = useState<'fireball' | 'risk' | null>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Scaled to the record's own last event, not the clock, so the buffers are not rebuilt each minute
  const markers = useMemo(() => {
    if (!fireballs.data) return null
    return buildMarkers(fireballs.data.events, fireballs.data.events.at(-1)?.t ?? 0)
  }, [fireballs.data])

  useEffect(() => {
    if (!markers) return
    if (selectedYear === null) {
      globeRef.current?.setRange(0, 1)
      return
    }
    const [from, to] = yearBounds(selectedYear)
    globeRef.current?.setRange(timeFraction(from, markers.startMs, markers.endMs), timeFraction(to, markers.startMs, markers.endMs))
  }, [selectedYear, markers])

  const selectFireball = useCallback((event: Fireball) => {
    if (event.lat === null || event.lon === null) return
    setSelectedFireball(event as LocatedFireball)
    setLadderSource('fireball')
    globeRef.current?.flyTo(event.lat, event.lon, 2.7)
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [])

  const pickFireball = useCallback((event: LocatedFireball | null) => {
    setSelectedFireball(event)
    setLadderSource(event ? 'fireball' : null)
  }, [])
  const pickRisk = useCallback((object: RiskObject) => {
    setSelectedRisk(object)
    setLadderSource('risk')
  }, [])

  const upcoming = useMemo(() => flybys.data?.flybys.filter((f) => f.t >= now) ?? [], [flybys.data, now])
  // Until something is picked, show the nearest upcoming pass and the top of the risk list
  const closestUpcoming = useMemo(() => upcoming.reduce<Flyby | null>((best, f) => (!best || f.distAu < best.distAu ? f : best), null), [upcoming])
  const topRisk = useMemo(() => (risk.data?.objects ?? []).reduce<RiskObject | null>((best, o) => (!best || (o.palermo ?? -99) > (best.palermo ?? -99) ? o : best), null), [risk.data])
  const shownFlyby = selectedFlyby ?? closestUpcoming
  const shownRisk = selectedRisk ?? topRisk
  const passing = useMemo(() => upcoming.find((f) => f.des === shownRisk?.des) ?? null, [upcoming, shownRisk])
  const riskDetail = useQuery(objectQuery(ladderSource === 'risk' ? selectedRisk?.des ?? null : null))

  const ladderItem = useMemo<LadderItem | null>(() => {
    if (ladderSource === 'fireball' && selectedFireball) {
      return { label: `Fireball, ${new Date(selectedFireball.t).getUTCFullYear()}`, kt: selectedFireball.kt }
    }
    const energyMt = riskDetail.data?.sentry?.energyMt
    if (ladderSource === 'risk' && selectedRisk && energyMt) return { label: `${selectedRisk.name}, if it hit`, kt: ktFromMt(energyMt) }
    return null
  }, [ladderSource, selectedFireball, selectedRisk, riskDetail.data])

  const showRiskObject = useCallback((des: string) => {
    const object = risk.data?.objects.find((o) => o.des === des)
    if (object) pickRisk(object)
  }, [risk.data, pickRisk])

  const showFlyby = useCallback((flyby: Flyby) => {
    setSelectedFlyby(flyby)
    scrollToSection('now')
  }, [])

  const lastFireball = fireballs.data?.events.at(-1) ?? null
  const nextPass = upcoming[0] ?? null
  const torinoAboveZero = useMemo(() => risk.data?.objects.filter((o) => (o.torino ?? 0) > 0).length ?? null, [risk.data])
  const stale = fireballs.data?.stale || flybys.data?.stale || risk.data?.stale

  return (
    <div>
      <ImpactGlobeStage globeRef={globeRef} markers={markers} selected={selectedFireball} selectedYear={selectedYear} onSelect={pickFireball}>
        <div className="absolute inset-x-0 top-0 z-10 pointer-events-none bg-gradient-to-b from-black/70 to-transparent">
          <div className="max-w-6xl mx-auto px-4 pt-5 pb-10 flex flex-wrap justify-between gap-x-6 gap-y-3">
            <div>
              <h1 className="text-3xl font-bold text-brass">Near Earth</h1>
              <p className="text-sm text-zinc-300 max-w-sm hidden sm:block">Everything that has hit Earth, is passing it now, or might hit it one day. Every glow is a real fireball.</p>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 sm:justify-end">
              <Stat label="Last fireball" value={lastFireball ? timeAgo(lastFireball.t, now) : '—'} />
              <Stat label="Next close pass" value={nextPass ? nextPass.name : '—'} detail={nextPass ? `${auToLd(nextPass.distAu).toFixed(1)} lunar distances` : undefined} />
              <Stat label="Torino scale above 0" value={torinoAboveZero === null ? '—' : String(torinoAboveZero)} />
            </div>
          </div>
        </div>
      </ImpactGlobeStage>

      <SectionNav
        fireballs={fireballs.data?.events.length ?? null}
        flybys={flybys.data ? upcoming.length : null}
        risk={risk.data?.objects.length ?? null}
      />

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        {stale && <p className="text-xs px-2 py-1 rounded bg-amber-400/10 border border-amber-400/20 text-amber-400 inline-block">Data may be delayed</p>}

        <div id="past" className="scroll-mt-32 space-y-4">
          <h2 className="text-xl font-semibold text-orange-400">Past: what has hit us</h2>
          {fireballs.isError && !fireballs.data && <FeedError what="the fireball record" />}
          {fireballs.isPending && <Loading />}
          {fireballs.data && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <FireballPanel events={fireballs.data.events} selected={selectedFireball} onSelect={selectFireball} />
              <YearHistogram events={fireballs.data.events} selectedYear={selectedYear} onSelectYear={setSelectedYear} />
            </div>
          )}
        </div>

        <div id="now" className="scroll-mt-32 space-y-4">
          <h2 className="text-xl font-semibold text-sky-400">Now: what is passing by</h2>
          {flybys.isError && !flybys.data && <FeedError what="close approaches" />}
          {flybys.isPending && <Loading />}
          {flybys.data && (
            <>
              <PassChart flybys={flybys.data.flybys} now={now} selected={shownFlyby?.des ?? null} onSelect={setSelectedFlyby} />
              <FlybyView flyby={shownFlyby} onShowRisk={showRiskObject} />
              <FlybyTable flybys={flybys.data.flybys} now={now} selected={shownFlyby?.des ?? null} onSelect={setSelectedFlyby} />
            </>
          )}
        </div>

        <div id="future" className="scroll-mt-32 space-y-4">
          <h2 className="text-xl font-semibold text-rose-400">Future: what we are watching</h2>
          {risk.isError && !risk.data && <FeedError what="the risk list" />}
          {risk.isPending && <Loading />}
          {risk.data && (
            <>
              <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm text-zinc-300">
                <p>
                  {torinoAboveZero === 0
                    ? 'No object currently rates above 0 on the Torino scale.'
                    : `${torinoAboveZero} object${torinoAboveZero === 1 ? '' : 's'} currently rate${torinoAboveZero === 1 ? 's' : ''} above 0 on the Torino scale.`}
                </p>
                {risk.data.removedCount !== null && (
                  <p>{risk.data.removedCount.toLocaleString()} objects have been cleared from this list, usually because more observations ruled out an impact.</p>
                )}
              </div>
              <RiskChart objects={risk.data.objects} year={new Date(now).getUTCFullYear()} selected={shownRisk?.des ?? null} onSelect={pickRisk} />
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 items-start">
                <RiskTable objects={risk.data.objects} selected={shownRisk?.des ?? null} onSelect={pickRisk} />
                <RiskDetail object={shownRisk} passing={passing} onShowFlyby={showFlyby} />
              </div>
            </>
          )}
        </div>

        <div className="space-y-4">
          <EnergyLadder item={ladderItem} />

          <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-400 space-y-3">
            <h2 className="text-xs uppercase tracking-[0.15em] text-zinc-500">How it works</h2>
            <p>Fireballs are the brightest events seen by US Government sensors, so this is not a complete record, and its early years are sparse. Their energies are estimated from the light they gave off, and each location is where the fireball was brightest, not where anything landed.</p>
            <p>Most asteroid sizes are estimated from brightness and an assumed reflectivity, which can be wrong by about a factor of two either way. Flyby paths are JPL&apos;s best-fit orbits: poorly observed objects can pass well away from that line, which is what the bars on the chart show. In log mode the flyby view keeps direction true but distorts distance and apparent speed.</p>
            <p>JPL warns that impact probabilities can be off by a factor of a few or more, and they usually fall to zero as more observations come in. The Torino scale only covers the next 100 years, so an object with no rating isn&apos;t the same as one rated 0.</p>
            <dl className="space-y-2">
              <div>
                <dt className="inline font-medium text-zinc-200">LD (lunar distance): </dt>
                <dd className="inline">the average distance from Earth to the Moon, about 384,400 km.</dd>
              </div>
              <div>
                <dt className="inline font-medium text-zinc-200">Palermo scale: </dt>
                <dd className="inline">compares an asteroid&apos;s chance of impact with the background risk of an impact at least as energetic in the years until that date. Each whole number is ten times the relative risk: 0 matches the background risk, −2 is 1% of it, and NASA says values below −2 have no likely consequences.</dd>
              </div>
              <div>
                <dt className="inline font-medium text-zinc-200">Torino scale: </dt>
                <dd className="inline">a simple 0 to 10 rating for the public that combines an asteroid&apos;s chance of impact with its impact energy. 0 means effectively no hazard, 1 is a normal discovery, 2 to 4 merit attention from astronomers, 5 to 7 are threatening, and 8 to 10 are certain collisions. It only rates possible impacts in the next 100 years.</dd>
              </div>
            </dl>
            <p className="text-xs text-zinc-500">
              Data: <a className="underline hover:text-brass" href="https://cneos.jpl.nasa.gov/" target="_blank" rel="noreferrer">NASA/JPL Center for Near Earth Object Studies</a> and <a className="underline hover:text-brass" href="https://ssd.jpl.nasa.gov/horizons/" target="_blank" rel="noreferrer">JPL Horizons</a>. Earth imagery: NASA Blue Marble and Black Marble.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
