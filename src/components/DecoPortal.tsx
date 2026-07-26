const W = 800
const H = 650
const BASE_Y = H

// Setbacks up the left side of the portal; the right side is mirrored across x = W / 2.
// The shafts stay full-width below y=180 so the stepping crowns the hero text rather than
// crowding it — centred content lands around y=180..475 across common viewport sizes.
const STEPS: [number, number][] = [
  [30, 180],
  [88, 145],
  [138, 113],
  [183, 85],
  [224, 61],
  [266, 43],
]

// Walk up the left side alternating vertical/horizontal segments, then mirror back down
function archPath() {
  const left: [number, number][] = [[STEPS[0][0], BASE_Y]]
  STEPS.forEach(([x, y], i) => {
    left.push([x, y])
    if (i + 1 < STEPS.length) left.push([STEPS[i + 1][0], y])
  })
  const right = [...left].reverse().map(([x, y]): [number, number] => [W - x, y])
  return [...left, ...right].map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ')
}

const ARCH = archPath()

// Every ornament is built from values mirrored about W / 2 so the whole panel stays symmetrical

// Studs centred under each setback tread — offset inward so they sit within the silhouette
const STUDS = STEPS.slice(0, -1).map(([x, y], i) => [(x + STEPS[i + 1][0]) / 2, y + 11] as const)
const diamond = (x: number, y: number, r: number) => `M ${x} ${y - r} L ${x + r} ${y} L ${x} ${y + r} L ${x - r} ${y} Z`

// Sunburst fan filling the tympanum above the nameplate
const FAN = { x: W / 2, y: 46, r: 52 }
const FAN_RAYS = Array.from({ length: 13 }, (_, i) => -72 + i * 12)

// Carved nameplate — letters are placed individually so spacing is exact rather than
// relying on letter-spacing, which shifts a middle-anchored string off centre
const NAME = ['L', 'A', 'N', 'D', '3', 'R']
const NAME_STEP = 62
// Dropped clear of the setback above: at this baseline the innermost band sits at x≈156,
// well outside the letters' x≈225 extent, where higher up it cut across the L and R
const NAME_BASELINE = 191
const nameX = (i: number) => W / 2 + (i - (NAME.length - 1) / 2) * NAME_STEP
const RULE_X = [225, W - 225]
// Banded lintel over the name; a matching rule below would land in the hero copy
const LINTEL_Y = [132, 139]

// Chevron frieze between the hero copy and the reeded base
const FRIEZE_Y = 490
const FRIEZE = Array.from({ length: 27 }, (_, i) => [140 + i * 20, FRIEZE_Y + (i % 2 ? -6 : 6)] as const)

const FLUTE_TOP = 515
const FLUTES = Array.from({ length: 23 }, (_, i) => 202 + i * 18)

// Shrink a nested arch toward the base centre so its feet stay on the same line
const nest = (s: number) => `translate(${W / 2} ${BASE_Y}) scale(${s}) translate(${-W / 2} ${-BASE_Y})`

export default function DecoPortal() {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="brass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e6c67a" />
          <stop offset="55%" stopColor="#c9a227" />
          <stop offset="100%" stopColor="#6b5416" />
        </linearGradient>
        <radialGradient id="brassGlow" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#c9a227" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#c9a227" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width={W} height={H} fill="url(#brassGlow)" />

      <g fill="none" stroke="url(#brass)" strokeLinejoin="miter">
        {/* Triple-banded arch */}
        <path d={ARCH} strokeWidth={1.75} opacity={0.55} />
        <g transform={nest(0.965)}>
          <path d={ARCH} strokeWidth={0.75} opacity={0.28} />
        </g>
        <g transform={nest(0.93)}>
          <path d={ARCH} strokeWidth={1.25} opacity={0.3} />
        </g>

        {/* Setback studs */}
        <g opacity={0.45} strokeWidth={0.9}>
          {STUDS.map(([x, y]) => (
            <g key={`stud-${x}-${y}`}>
              <path d={diamond(x, y, 4)} />
              <path d={diamond(W - x, y, 4)} />
            </g>
          ))}
        </g>

        {/* Tympanum sunburst */}
        <g opacity={0.35} strokeWidth={0.9}>
          {FAN_RAYS.map((deg) => {
            const a = (deg * Math.PI) / 180
            return (
              <line
                key={`ray-${deg}`}
                x1={FAN.x}
                y1={FAN.y}
                x2={FAN.x + FAN.r * Math.sin(a)}
                y2={FAN.y + FAN.r * Math.cos(a)}
              />
            )
          })}
        </g>

        {/* Nameplate lintel */}
        <g opacity={0.4} strokeWidth={1}>
          {LINTEL_Y.map((y) => (
            <line key={`lintel-${y}`} x1={RULE_X[0]} y1={y} x2={RULE_X[1]} y2={y} />
          ))}
          {RULE_X.map((x) => (
            <path key={`cap-${x}`} d={diamond(x, LINTEL_Y[1], 5)} />
          ))}
        </g>

        {/* Chevron frieze */}
        <polyline points={FRIEZE.map(([x, y]) => `${x},${y}`).join(' ')} strokeWidth={1} opacity={0.3} />

        {/* Reeded base */}
        <g opacity={0.22} strokeWidth={1}>
          {FLUTES.map((x) => (
            <line key={x} x1={x} y1={FLUTE_TOP + 14} x2={x} y2={BASE_Y} />
          ))}
        </g>
        <g opacity={0.4} strokeWidth={1}>
          <line x1={202} y1={FLUTE_TOP} x2={598} y2={FLUTE_TOP} />
          <line x1={202} y1={FLUTE_TOP + 6} x2={598} y2={FLUTE_TOP + 6} />
        </g>
      </g>

      {/* LAND3R — outlined so it reads as carved stone, with the brand's rose 3 */}
      <g
        fill="none"
        strokeWidth={1.1}
        fontFamily="'Futura', 'Century Gothic', 'Trebuchet MS', sans-serif"
        fontSize={56}
        fontWeight={500}
        textAnchor="middle"
      >
        {NAME.map((ch, i) => (
          <text
            key={`${ch}-${i}`}
            x={nameX(i)}
            y={NAME_BASELINE}
            stroke={ch === '3' ? '#f43f5e' : 'url(#brass)'}
            opacity={ch === '3' ? 0.5 : 0.55}
          >
            {ch}
          </text>
        ))}
      </g>
    </svg>
  )
}
