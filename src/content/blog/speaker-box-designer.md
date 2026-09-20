---
title: Speaker Box Designer
date: 2026-09-19
description: Sizing a speaker enclosure properly — interior volume, port tuning and a cut list
---
Years ago, I was very into the car audio scene. Building boxes for a subwoofer was always a fun challenge. Knowing the calculations can get a little tricky if you get into details, I wrote one of my first programs to do just this sort of thing. But the only computer I had was my calculator. The HP 48SX. (The sound of trumpets.) It worked and was useful several times.

Today we're raising the bar a little and doing it properly. Behold, the [Speaker Box Designer](/projects/speaker-box).

The problem is easy to state and easy to get wrong, especially if the front has an angled face. A driver only sounds right in an enclosure of roughly the correct interior volume — and the interior is never the size you cut the panels to.

## How to use it

**1. Enter the outside dimensions.** Width, height and depth in inches. These are the dimensions of the finished box, not the cavity inside it.

**2. Pick the panel thickness.** Three-quarter inch or one inch. This matters more than you'd think: the same 24 × 16 × 14 shell holds 2.36 ft³ in 3/4" stock but only 2.14 ft³ in 1". That roughly 10% can be the difference between a design that works and one that doesn't, and it's invisible if you only think in outside dimensions.

**3. Slope the baffle, if you want one.** Leave the angle at zero for a plain rectangular box, or give it up to 45° to lean the front panel back. When it's sloped the depth you entered is measured **at the bottom** — the top comes out shallower, and the tool tells you by how much, along with how long the baffle panel itself needs to be.

**4. Choose sealed or ported.**

- **Sealed** only needs a target Qtc. 0.707 gives the flattest response and is a sensible default.
- **Ported** asks for the ports you actually intend to fit — diameter, length and how many — and tells you what frequency that combination tunes the box to.

**5. Fill in the displacements.** The driver's magnet assembly sits inside the box and steals volume. It's on the spec sheet, usually 0.1–0.2 ft³ for a 12". Port displacement is calculated for you. This is the step people skip, and on a 2 ft³ box it's a 5–10% error.

**6. Enter the driver parameters.** Vas, Qts and Fs, all off the spec sheet. **Check the Vas units.** Most manufacturers publish litres, and confusing litres with cubic feet is a 28× error — there's a toggle next to the field for exactly that reason.

The panel on the right then grades the design. Within 10% of the target volume is a good match, within 25% is workable, beyond that it's off. For a ported box it grades the volume and the tuning separately, because you can easily get one right and the other badly wrong.

## A worked example

The page loads with a deliberately imperfect design, so you can watch it converge.

It starts as a 24 × 16 × 14 box in 3/4" stock with two 3" ports, 10" long, and a driver with Vas 56.6 litres, Qts 0.40 and Fs 30 Hz. That driver wants **1.94 ft³ tuned to 28.7 Hz**. What you get is:

> Net volume **2.13 ft³** — +10%, good match
> Tuned to **40.2 Hz** — +40%, off target

So the box is about the right size but the ports are far too short. Underneath the verdict is the line that actually fixes it: *for 28.7 Hz these ports would need to be 20.6" long.*

Type that in, and:

> Net **2.04 ft³** (+5%, good) · Tuned to **29.3 Hz** (+2%, good)

It doesn't land exactly, because longer ports displace more air and shrink the box slightly, which nudges the tuning back up. It now suggests 21.5". One more round gets you to **28.8 Hz — dead on**. Two iterations, and the chase is the interesting part: it shows you how tightly the box volume and the port tuning are bound together.

For comparison, the same physical box used *sealed* would be 2.21 ft³ against a 0.94 ft³ target — 135% over. A box that's nearly perfect ported can be hopeless sealed, with not a single panel changed.

## The rest of the page

**The 3D view** is draggable. Toggle the top or front panel open to look inside — the rim you're left with is exactly the material thickness, so you can see what you're actually losing to the walls. Ports are drawn on the back panel, so rotate the box round to see them.

**The cut list** gives every panel and the total board area. For a square box it's an exact interlocking set. For a sloped one the sides become trapezoids and the baffle ends up longer than the box is tall, so those are outside face sizes before bevelling — the bevel angles depend on the joinery you pick, and that's left to you.

## How it works

The core calculation is that every dimension loses two panel thicknesses, one at each end. The sloped case is more interesting: a wall leaning at an angle eats more *horizontal* depth than a vertical one, because its thickness projects further. So it isn't simply subtracting twice the thickness any more — the cavity becomes a wedge that tapers toward the top, and the volume falls out of integrating its depth over the height.

Port tuning runs the standard vented-box equation backwards. The textbook version tells you how long a port must be to hit a target frequency; here you already know what ports you're fitting, so it solves for the frequency instead. Both directions are implemented, which is handy — running one through the other and getting the original number back is a free correctness check.

Same as the rest of the site, it needed no new dependencies and no backend. The 3D preview is plain CSS 3D transforms rather than a 3D library, because a speaker box is six rectangles and a 3D engine would have cost more than the entire rest of the page.

One honest limitation: the alignment figures are the standard published approximations, not a full simulation. They're more than close enough to design and build around, but if you're doing final work, WinISD is the tool for it.
