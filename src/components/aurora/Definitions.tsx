import type { ReactNode } from 'react'
import { SUVI_NOTES, SUVI_WAVELENGTHS } from '../../lib/aurora/feeds'

function Term({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div>
      <dt className="inline font-medium text-zinc-200">{name}: </dt>
      <dd className="inline">{children}</dd>
    </div>
  )
}

function Group({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-[0.15em] text-zinc-500 mb-1.5">{title}</h3>
      {intro && <p className="mb-2">{intro}</p>}
      <dl className="space-y-2">{children}</dl>
    </div>
  )
}

/** Plain-language meanings for the terms used across the page */
export default function Definitions() {
  return (
    <div className="space-y-4">
      <Group title="Solar wind">
        <Term name="Magnetosphere">the region around Earth controlled by its magnetic field. It deflects most of the solar wind, and its boundary moves in and out as the wind&apos;s pressure changes.</Term>
        <Term name="Density">how many solar wind protons there are in each cubic centimetre (p/cm³). A few per cubic centimetre is typical, and denser wind pushes harder on the magnetosphere.</Term>
        <Term name="Bz">the north–south part of the magnetic field carried by the solar wind, in nanotesla (nT). When it points south (negative), it can link up with Earth&apos;s field and let energy in, which strengthens the aurora.</Term>
        <Term name="Shield distance">an estimate of how far the sunward edge of the magnetosphere is from Earth&apos;s centre, in Earth radii (one Earth radius is about 6,371 km). It shrinks when solar wind pressure rises.</Term>
      </Group>

      <Group title="Views of the Sun" intro="Å is the ångström, a tenth of a nanometre. Each button shows the Sun at one extreme ultraviolet wavelength, which picks out gas at a particular temperature.">
        {SUVI_WAVELENGTHS.map((w) => <Term key={w} name={`${w} Å`}>{SUVI_NOTES[w]}</Term>)}
      </Group>

      <Group title="NOAA space weather scales" intro="Each scale runs from 1 (minor) to 5 (extreme), and 0 means none.">
        <Term name="G scale, geomagnetic storms">disturbances to Earth&apos;s magnetic field, from G1 at Kp 5 to G5 at Kp 9. They can affect power grids and satellites, and they push the aurora toward lower latitudes.</Term>
        <Term name="S scale, solar radiation storms">increases in energetic particles from the Sun, set by the flux of particles at 10 MeV or above. They mainly affect astronauts, high-altitude aircrew and satellites.</Term>
        <Term name="R scale, radio blackouts">caused by X-rays from solar flares, from R1 at an M1 flare to R5 at an X20 flare. They disrupt high-frequency radio on the sunlit side of Earth.</Term>
      </Group>
    </div>
  )
}
