# Speaker Box Designer — Feature Plan

A tool for designing a loudspeaker enclosure: enter the outside dimensions and material
thickness, choose sealed or ported, and get the net interior volume — checked against what the
driver actually needs.

**Route:** `/projects/speaker-box`

---

## 0. Answers to the questions

**Can we stick with the current stack?** Yes, including the 3D view. React + TypeScript +
Tailwind cover all of it with **no new dependencies, no API, no Lambda and no Amplify changes**.
Nothing needs a network request; the page works offline.

**Can we have a 3D representation?** Yes, and without a 3D library — see §6. A rectangular box
is the one shape CSS 3D transforms handle really well, so we get real perspective and
drag-to-rotate for zero bundle cost. three.js would cost ~150 KB gzipped and only becomes worth
it if we later want port tubes drawn as true cylinders or a proper cutaway.

**How does the maths work?** Volume is three subtractions and a divide (§1). Ports are the
interesting part: because you specify the ports you will actually buy, the tool works
*backwards* from them to the tuning frequency they produce (§4).

---

## 1. The core calculation

Every dimension loses **two** panel thicknesses, one at each end:

```
inner = (outer_w - 2t) * (outer_h - 2t) * (outer_d - 2t)
cubic feet = inner / 1728
```

Worked example, verified: a **24 × 16 × 14 in** box in **3/4 in** material has an interior of
22.5 × 14.5 × 12.5 in = 4,078 cu in = **2.360 ft³**.

Material thickness — **3/4 in and 1 in only**:

| Enclosure | 3/4 in | 1 in |
|---|---|---|
| 24 × 16 × 14 | 2.360 ft³ | 2.139 ft³ |
| 18 × 14 × 12 | 1.253 ft³ | 1.111 ft³ |

Still a ~10% swing between the two options on identical outside dimensions, which is enough to
move a design out of its target window on its own.

**Guard:** small boxes in thick material can produce a zero or negative interior — 6 × 6 × 1.5
in 3/4 in material comes out at exactly 0.000 ft³. Any dimension at or below `2t` must be
rejected with a clear message rather than rendering a nonsense number.

---

## 1b. Sloped baffle

Optional: the front baffle leans back as it rises, so the top of the box is shallower than the
bottom. `depth` is therefore measured **at the bottom**. Angle θ is from vertical, capped at 45°.

This is not "subtract 2t and adjust" — a wall leaning at θ eats `t/cosθ` of horizontal depth
rather than `t`, because its perpendicular thickness projects further. Integrating the cavity
depth over the height:

```
cavity depth at height y  =  D - y·tanθ - t/cosθ - t
V = (W-2t)(H-2t) × [ D - t - t/cosθ - (H·tanθ)/2 ]
```

The bracket is just the mean cavity depth, so the cavity is a wedge of the same angle as the
shell — which is what lets the 3D view render it with one shared routine.

**Verified against brute-force numerical integration** of the offset solid at 5/10/15/20/30°,
agreeing to under 0.004 ft³ (grid discretisation). At θ = 0 it reproduces the rectangular
formula to six decimals.

| Angle | Top depth | Baffle length | Cavity depth | Gross |
|---|---|---|---|---|
| 0° | 14.00" | 16.00" | 12.50" | 2.360 ft³ |
| 10° | 11.18" | 16.25" | 12.36" → 9.80" | 2.092 ft³ |
| 20° | 8.18" | 17.03" | 12.18" → 6.90" | 1.801 ft³ |
| 35° | 2.80" | 19.53" | 11.81" → 1.66" | 1.271 ft³ |

Three separate failure modes, each with its own message: the angle exceeding the 45° cap; the
slope consuming all the outside depth before reaching the top; and the slope closing the
*cavity* before the top even though the shell still has depth. The third is the subtle one and
happens first.

**Cut list changes.** The sides become trapezoids and the baffle is longer than the box is
tall. Unlike the square case these are no longer a tidy interlocking set — a sloped baffle needs
bevelled edges where it meets the top and bottom — so the sloped cut list reports outside face
sizes before bevelling and says so. `isExactCutList()` marks which of the two is being shown,
and the "panels + cavity exactly refill the shell" assertion is only claimed for square boxes.

**3D view.** Sides are clipped to trapezoids with `clip-path`; the baffle is a longer panel
rotated about its own centre; the top panel shrinks and slides back. The cavity is the same
wedge routine at interior dimensions, offset one thickness in. Open-panel rims use exact
widths rather than a uniform `t`: along the slope a panel costs `t·secθ`, and the top panel's
front edge costs only `t(secθ − tanθ)` while its back edge still costs a plain `t`.

---

## 2. Gross is not net

The figure above is *gross* interior volume. What the driver sees is **net**:

```
net = gross - driver displacement - port displacement - bracing
```

- **Driver displacement** — the magnet assembly intrudes into the box. Published on the spec
  sheet; typically 0.1–0.2 ft³ for a 12 in driver, so 5–10% of a 2 ft³ box. User-entered.
- **Port displacement** — **computed automatically** from the port dimensions in §3, since the
  user is now supplying them. No longer a manual field.
- **Bracing** — user-entered, optional.

A tool that reports gross volume and stops will quietly mislead everyone who uses it.

---

## 3. Sealed or ported

A top-level choice that changes both the inputs and the target volume.

**Sealed** — no further geometry inputs.

**Ported** — the user specifies the ports they intend to build or buy:

| Input | Notes |
|---|---|
| Port diameter | inches, internal |
| Port length | inches |
| Port quantity | 1 or more, all identical |

From those three the tool derives two things: how much volume the ports steal, and what
frequency the box ends up tuned to.

**Port displacement** is the air column of the tubes:

```
displacement = N * pi * R^2 * Lv / 1728   (ft³)
```

For two 3 in ports 10 in long that is 0.082 ft³ — **3.5% of a 2.36 ft³ gross volume**, so it
genuinely matters and is exactly the kind of thing hand calculations forget.

---

## 4. Tuning frequency from the user's ports

The brief specifies the ports as *inputs*, so the tool runs the standard port formula backwards.
Rearranging the usual length equation for `Fb`:

```
Fb = sqrt( (1.463e7 * N * R^2) / ((Lv + k*R) * Vb_cubic_inches) )
```

`R` = port radius (in), `Lv` = port length (in), `N` = port count, `Vb` = **net** volume,
`k` = end correction.

**Verified by round-trip:** computing the length needed for a 28.7 Hz target and then feeding
that length back through the inverse recovers 28.70 Hz exactly, for 1 × 4 in, 2 × 3 in and
4 × 2 in port arrangements. Forward and inverse agree.

**Worked example** — 24 × 16 × 14 in, 3/4 in material, two 3 in ports 10 in long, 0.15 ft³
driver displacement:

```
gross              2.360 ft³
- port displacement 0.082 ft³
- driver            0.150 ft³
= net Vb            2.128 ft³
-> tuning Fb        40.2 Hz
```

**Port count is a powerful dial**, which the UI should make visible. Same 10 in tube, same box:

| Ports | Resulting Fb |
|---|---|
| 1 × 3 in | 28.4 Hz |
| 2 × 3 in | 40.2 Hz |
| 3 × 3 in | 49.2 Hz |
| 4 × 3 in | 56.8 Hz |

**End correction `k`** is 0.732 for one flanged end (the typical build, flush at the baffle and
open inside) and 0.823 for both ends flanged. Tested: the difference is 40.16 vs 39.92 Hz —
0.24 Hz, well inside the tolerance of the approximation itself. **Hard-code 0.732** and do not
expose it as an input; it is a knob that adds confusion without changing the answer.

**Useful secondary readout:** having also implemented the forward formula for the round-trip
test, show "for your target tuning you'd need X in of port" alongside. It costs nothing and is
what the user wants next when the number comes out wrong.

---

## 5. Does it match the driver?

What volume a speaker "wants" is derived from three Thiele-Small parameters off the spec sheet:
**Vas** (equivalent compliance volume), **Qts** (total Q) and **Fs** (free-air resonance).

**Sealed** — with a target system Q (`Qtc`), 0.707 being the maximally flat Butterworth choice:

```
Vb = Vas / ((Qtc/Qts)^2 - 1)
Fc = Fs * (Qtc/Qts)
F3 = Fc * sqrt((a + sqrt(a^2 + 4)) / 2),  where a = 1/Qtc^2 - 2
```

**Ported** — the standard Small approximations for a QB3-type alignment:

```
Vb = 20 * Vas * Qts^3.3
Fb = 0.42 * Fs * Qts^-0.9
F3 = 0.26 * Fs * Qts^-1.4
```

Verified across three representative drivers:

| Driver | Sealed Vb / F3 | Ported Vb / F3 |
|---|---|---|
| Vas 2.0 ft³, Qts 0.40, Fs 30 Hz | 0.94 ft³ / 53 Hz | 1.94 ft³ / 28 Hz |
| Vas 1.2 ft³, Qts 0.35, Fs 34 Hz | 0.39 ft³ / 69 Hz | 0.75 ft³ / 38 Hz |
| Vas 1.5 ft³, Qts 0.55, Fs 40 Hz | 2.30 ft³ / 51 Hz | 4.17 ft³ / 24 Hz |

Two free correctness checks: at Qtc = 0.707 the sealed F3 comes out **exactly equal to Fc**
(the defining property of a Butterworth alignment), and ported volume lands near 2× sealed for
the same driver.

**Guard:** when `Qts >= Qtc` the sealed formula divides through a non-positive number and
returns a negative volume (Qts 0.75 against Qtc 0.707 gives −17.96 ft³). Catch it and explain
it — it means the driver is unsuited to a sealed box at that Q, which is useful information,
not an error.

For a ported design the tool can now compare **two** things: is the net volume near the target
Vb, *and* is the tuning from the user's ports near the target Fb.

---

## 6. The 3D view

**Recommendation: CSS 3D transforms, no library.**

A container with `perspective`, a box with `transform-style: preserve-3d`, and six child
elements rotated and translated into place. A pointer-drag handler updates two rotation angles.
This is the textbook use case for CSS 3D, and it gives real perspective and free rotation for
**zero bundle cost**, keeping the no-new-dependencies promise intact.

Representation plan:

- **Solid faces, with a toggle to hide the front and/or top panel** so you can see into the
  cavity. Deliberately *not* semi-transparent faces: CSS 3D has no real depth sorting, and
  stacked translucent surfaces are where it visibly falls apart. Hiding a panel reads more
  clearly anyway — it looks like the box under construction.
- **Panel thickness** shown by insetting the cavity, so the material depth is visible on the
  cut edges of the removed face.
- **Ports** as circles on the **back panel**, scaled to the entered diameter and count. Rear-ported
  is the common layout and it leaves the baffle clear for the driver. Consequence: the default
  three-quarter view faces the front, so the box must be rotated to see them.
- Dimension labels in plain HTML around the viewport rather than in 3D space.

**Honest limits.** Port tubes cannot be drawn as true cylinders projecting into the box (CSS 3D
would need many segments per tube), and there is no real cutaway. If either becomes important,
three.js is the upgrade at ~150 KB gzipped. I would not pay that for six rectangles up front.

**Untested risk:** this environment cannot render a browser, so the CSS 3D approach is
recommended on established technique rather than something I have seen working. It is the step
most likely to need adjustment by eye.

---

## 7. Architecture

```
src/lib/enclosure/
  volume.ts     external dims + thickness + displacements -> gross/net volume
  ports.ts      port geometry -> displacement, Fb; and the forward length helper
  alignment.ts  Thiele-Small -> target Vb, Fb, F3
  cutlist.ts    panels and board area
  verify.ts     the worked examples above, asserted numerically
src/components/EnclosureView3D.tsx   CSS 3D box
src/pages/SpeakerBoxPage.tsx
```

Pure functions, no state, no I/O. Because this environment cannot render a browser, `verify.ts`
follows the Arkanoid precedent: assert the §1 and §4 worked examples, the forward/inverse port
round-trip, and the Butterworth `F3 = Fc` identity, so a refactor cannot silently break the
arithmetic.

---

## 8. Cut list

For a butt-jointed box of outside W × H × D in thickness t:

| Panel | Qty | Size |
|---|---|---|
| Top / bottom | 2 | W × D |
| Front / back | 2 | W × (H − 2t) |
| Left / right | 2 | (D − 2t) × (H − 2t) |

Reassembles to exactly W × H × D and to the §1 interior volume. Other joinery gives a different
cut list but the *same* interior volume — worth saying in the UI so nobody assumes otherwise.
Include total board area for sheet-goods estimating.

---

## 9. UI

```
┌──────────────────────────┬──────────────────────────────┐
│ ENCLOSURE                │      ╱────────────╱│         │
│  width   [ 24 ] in       │     ╱            ╱ │         │
│  height  [ 16 ] in       │    ┌────────────┐  │   drag  │
│  depth   [ 14 ] in       │    │  ●      ●  │  │      to │
│  material  (•) ¾"  ( ) 1"│    │            │ ╱   rotate │
│                          │    └────────────┘             │
│ TYPE  ( ) sealed (•)ported│   [x] hide front  [ ] hide top│
│  port dia   [ 3.0 ] in   │                              │
│  port length[ 10  ] in   │   GROSS        2.360 ft³     │
│  quantity   [  2  ]      │   − ports      0.082 ft³     │
│                          │   − driver     0.150 ft³     │
│ DISPLACEMENT             │   NET Vb       2.128 ft³     │
│  driver  [0.15] ft³      │   TUNED TO     40.2 Hz       │
│  bracing [0.00] ft³      │                              │
│                          │   ┌────────────────────────┐ │
│ DRIVER (optional)        │   │ TARGET  1.94 ft³ @ 28Hz│ │
│  Vas [2.0] (•)L ( )ft³   │   │ box  +10% · tuning +43%│ │
│  Qts [0.40]  Fs [30] Hz  │   │ ports too short        │ │
└──────────────────────────┴───┴────────────────────────┴─┘
  CUT LIST  2 @ 24×14 · 2 @ 24×14.5 · 2 @ 12.5×14.5 · 12.02 ft² board
```

- Live recalculation on every keystroke — the maths is instant, no submit button.
- The verdict panel is the point of the page: it answers the brief's requirement that the volume
  *match the speaker*, and for ported boxes it judges volume **and** tuning separately.
- **The Vas unit toggle is not optional.** Most drivers publish Vas in litres; treating litres
  as cubic feet is a 28× error. 1 ft³ = 28.3168 litres.

---

## 10. Build steps

1. ✓ **`volume.ts` + page scaffold** — route, `ProjectsPage` card, dimensions, 3/4 vs 1 in
   selector, gross volume, degenerate-input guard.
2. ✓ **Sealed/ported toggle + `ports.ts`** — port inputs, displacement, net volume, resulting Fb.
3. ✓ **Cut list** — panels and board area.
4. ✓ **`EnclosureView3D`** — CSS 3D box, drag to rotate, open-top/open-front rims, ports on the
   baffle.
5. ✓ **`alignment.ts`** — Thiele-Small inputs, target volume and tuning, match verdict, the
   `Qts >= Qtc` guard, litres/ft³ toggle.
6. ✓ **Polish** — README. (`localStorage` and shareable URL params deferred.)
7. ✓ **Sloped baffle** (added 2026-09-19) — angle input, wedge volume maths, trapezoidal cut
   list, wedge rendering in the 3D view. See §1b.
8. ✓ **Ports on the back panel** (2026-09-19) — moved off the baffle.

**Built 2026-09-19.** `verify.ts` passes every worked example in this plan. Three things the
harness caught during the build:

- The board-area figure in §9 was **fabricated** — this plan originally said 13.4 ft² for the
  worked example; it is 12.02 ft². The plan has been corrected.
- The Butterworth identity only holds to four decimal places against the rounded `0.707`. The
  default is now `Math.SQRT1_2`, so `F3 === Fc` is exact.
- The "unreachable port target" test case was badly chosen (it was reachable). A 1 in port in a
  5 ft³ box genuinely cannot tune to 100 Hz, and now tests the null path.

Defaults on first load deliberately show a near-miss: the box is +10% on volume (good) but the
ports are +40% on tuning (off), with a readout saying they would need to be 20.6 in long.

---

## 11. Risks and honest limits

- **These are alignment approximations, not simulations.** Real design work uses WinISD or
  similar, modelling the full transfer function including losses and damping. These are the
  standard published approximations and the right level for a web tool — but the page should say
  so rather than implying more precision than it has.
- **Unit confusion is the likeliest source of wrong answers** — inches vs feet, ft³ vs litres.
  Label every field; default Vas to litres.
- **Rectangular boxes only.** Internal bracing, divided chambers and non-rectangular enclosures
  all break the model. State the assumption.
- **Port air velocity is not modelled.** Undersized ports "chuff" audibly at high output.
  Checking for it needs driver Vd and target power, so it is out of scope for v1 — but the page
  should not imply a port is fine merely because the tuning is right.
- **The 3D view is the one unverified technique here** (§6).
