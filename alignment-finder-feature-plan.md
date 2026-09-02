# Next Great Alignment — Feature Plan

> **Not proceeding (decided 2026-07-19).** The prototype in §0 showed these events are too rare
> to carry a feature: exactly one sub-40° gathering between now and 2050, and "all 8 planets"
> never gets tighter than 111°. The panel would sit unchanged for years at a time. Kept for the
> research rather than the plan — §0 records that JPL's approximate Keplerian elements match
> Horizons to 0.074° and that a 250-year scan costs ~117 ms, which is reusable for any future
> orrery work that needs positions outside the Lambda's ±6-month window. Delete if not wanted.

Stretch goal carried over from `planetary-orrery-feature-plan.md`: scan forward through the
ephemeris and tell the visitor when the planets next line up, then show them the sky.

**Route:** extends `/projects/planets` — no new page.

---

## 0. Prototype findings (verified 2026-07-19)

This plan is written *after* prototyping the hard part, so the numbers below are measured
rather than estimated.

| Question | Finding |
|---|---|
| Can we search without hammering Horizons? | **Yes.** JPL's own approximate Keplerian elements reproduce the Horizons longitudes our Lambda serves to within **0.074°** worst case across all 8 planets. Alignment thresholds are tens of degrees, so this is three orders of magnitude more precision than the feature needs. |
| How expensive is the search? | **Negligible.** A daily scan of all 8 planets across 250 years (91,312 days) runs in **~117 ms** in plain JS. No Web Worker, no backend, no caching required. |
| Do "all 8 planets" ever align? | **No — and this is the load-bearing finding.** The tightest gathering of all eight before 2050 is **111°** (Jan 2036). A feature advertising "all planets align" would never fire. |
| What *does* align? | The five naked-eye planets reach **18.8°** on **24 Aug 2040** — and that is the *only* sub-40° gathering between now and 2050. |

The 2040 event in detail:

```
mercury  188.4°     Jupiter and Mercury within 0.1° of each other,
jupiter  188.5°     Saturn 4° away, Mars and Venus trailing ~18°
saturn   192.9°
mars     206.4°
venus    207.2°     -> all five within 18.8° of ecliptic longitude
```

**Design consequence:** the feature must default to the naked-eye five, not "the planets".
That set is the one that produces genuinely tight events, it is what the press means by a
"planet parade", and — unlike Uranus and Neptune — a visitor can walk outside and look at it.

---

## 1. What counts as an alignment

Metric: **the smallest arc of heliocentric ecliptic longitude containing every selected body**,
computed as `360° − (widest gap between adjacent longitudes)`.

Note this is *not* what the page already computes. The existing `tightestCluster` answers
"what is the largest group that fits inside a 60° window" — a different question, kept for the
live readout. The finder needs "what is the smallest window that fits all of them", which is
simpler and needs its own function.

Body sets to offer, with measured behaviour to 2050:

| Set | Tightest by 2050 | Verdict |
|---|---|---|
| Naked-eye 5 (Me, V, Ma, J, Sa) | **18.8°** (2040-08-24) | **Default.** Observable, and produces real events. |
| Inner 4 (Me, V, E, Ma) | 16.0° (2037-12-08) | Good secondary option; tightest of any set. |
| All 8 | 111° (2036-01-12) | Offer, but label honestly — never tight. |
| Outer 4 (J, Sa, U, N) | 101° (2035-02-19) | Not worth offering; they barely move. |

---

## 2. Architecture — frontend only

No Lambda change, no Amplify change, no new dependency.

```
┌────────────────────────────────────────────────────────────┐
│  src/lib/ephemeris.ts   JPL Keplerian elements + propagator │
│                         (~100 numeric constants + solver)   │
└────────────────────────────────────────────────────────────┘
              │                              │
              ▼                              ▼
   findNextAlignment(set, from)      positionsAt(date)
   coarse scan -> refine             feeds the orrery for
   returns date + spread             dates outside the payload
```

The Lambda's ±6-month Horizons payload stays exactly as it is and remains the source for the
default view — it is what lets the page claim live NASA ephemeris. The Kepler model covers
everything outside that window.

**Why both, rather than Kepler for everything:** the payload is authoritative and already
built; the model is an approximation, however good. Keeping Horizons for the default view
preserves the page's provenance claim. The alternative — drop the Lambda and run purely on
Kepler — is simpler code and worth considering if the dual path proves annoying, but it
weakens the "data from NASA JPL Horizons" line that makes the project interesting.

---

## 3. The timeline problem

Jumping the scrubber to Aug 2040 means rendering positions the Lambda does not serve — its
payload is ±6 months. So this feature necessarily **extends the scrubber beyond the payload
window**, with the orrery reading from whichever source covers the requested date:

- inside ±6 months → Horizons payload (as today)
- outside → Kepler model

Show which is in use with a small label ("JPL Horizons" / "Keplerian model"), so the
distinction is visible rather than hidden. This is the largest single piece of work in the
feature and touches the existing scrubber logic.

---

## 4. UI

A panel beside the orrery, under the existing "tightest grouping" card:

```
┌────────────────────────────────────┐
│ NEXT ALIGNMENT                     │
│ 24 August 2040                     │
│ five naked-eye planets within 19°  │
│ in 14 years                        │
│                     [ Show me ▸ ]  │
├────────────────────────────────────┤
│ set:  ● naked-eye  ○ inner  ○ all  │
└────────────────────────────────────┘
```

- **"Show me"** drives the scrubber to that date so the orrery renders the event.
- Changing the set re-runs the search (~30 ms — instant, no spinner needed).
- Optionally list the next 3–5 events rather than only the next one; the data is already there
  from the same scan.
- **Include a one-line disclaimer.** Planetary alignments have no physical effect on Earth,
  and this is exactly the sort of page that attracts that assumption. A short "alignments are
  a visual coincidence of perspective — nothing happens" is honest and pre-empts it.

---

## 5. Build steps

1. **`src/lib/ephemeris.ts`** — port the validated prototype: elements table, Kepler solver,
   `positionsAt(date)`, `spread(longitudes)`. Prototype lives in the scratchpad and is already
   checked against Horizons; this step is mostly transcription plus unit tests.
2. **`findNextAlignment(set, from, threshold)`** — coarse daily scan, then true local-minima
   detection, then sub-day refinement around the winner for an exact date. (Mercury moves ~4°/day,
   so day-resolution is slightly coarse for a headline date.)
3. **Alignment panel** — render the result, with the set selector. Pure display, no orrery
   changes yet, so it can ship independently.
4. **Extend the scrubber** — accept dates beyond the payload window and source positions from
   the model, with the provenance label. The substantial step.
5. **"Show me" wiring** — jump the scrubber to the event date.
6. **Polish** — next-N list, disclaimer line, mobile layout.

Steps 1–3 are self-contained and deliver most of the interest on their own. Step 4 is where
the effort actually sits.

---

## 6. Risks and limits

- **Element validity.** JPL's Table 1 is specified for **1800–2050**. Searching past 2050 needs
  Table 2, which adds correction terms for Jupiter–Neptune and extends to 3000 BC–3000 AD.
  Until then, cap the search at 2050 and say so when no event is found in range.
- **Only one interesting event in range.** With a sub-40° threshold, the naked-eye set fires
  exactly once before 2050. The feature is therefore more "countdown to 2040" than "browse
  alignments" — worth leaning into rather than hiding, but it does mean a strict threshold makes
  a quiet page. Offering the next 3–5 events at any spread is the fix.
- **Not a physical event.** See the disclaimer note above.
- **Heliocentric ≠ what you see.** These are Sun-centred longitudes. A "planet parade" in the
  night sky is a *geocentric* phenomenon and will not correspond exactly. Either label the panel
  as heliocentric, or compute geocentric elongations instead — a meaningfully different feature,
  and arguably the more compelling one for a visitor who wants to go outside and look.
