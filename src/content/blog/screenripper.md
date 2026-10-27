---
title: ScreenRipper
date: 2026-10-26
description: A screensaver for the browser — ten animated patterns, a number key each, fullscreen with F
---
Screensavers used to be a thing. Flying toasters, a starfield, those bouncing lines that Windows called Mystify. They existed to stop an image burning into a CRT, and nobody needs them for that any more. But they were fun to watch, and building some is a good excuse to push the browser's graphics a bit.

So here's [ScreenRipper](/projects/screenripper): ten animated patterns, from tumbling wireframe solids to fractal zooms drawn on the GPU.

## How to use it

- **1–9 and 0** pick a pattern. 0 is the tenth.
- **F** goes fullscreen, with no site header or footer. **Esc** or **F** again brings it back.
- **Space** pauses.
- **Leave it alone** and it moves on to the next pattern by itself every minute. Any key press restarts the count, so a pattern you pick gets a full minute before it moves on.

In fullscreen it also keeps your screen awake, so your computer's own screensaver doesn't kick in over the top of it, and hides the mouse pointer after a couple of seconds. If your system is set to reduce motion, everything runs at less than half speed.

## The patterns

**1. Polyhedra.** The five Platonic solids, twelve seconds each, so all five fill exactly one minute. Each has its dual turning the other way inside it: the cube holds an octahedron, the dodecahedron an icosahedron. The solids have different numbers of corners, so one can't morph into the next. Instead the old one's edges shrink to their midpoints while the new one's grow out of theirs.

**2. Starfield.** Warp speed. The vanishing point drifts slowly so it feels like flying rather than staring.

**3. Mystify.** The Windows classic. Two four-sided shapes whose corners bounce off the edges of the screen independently, trailed by fading echoes.

**4. Spirograph.** Three pens tracing the curve you get from a wheel rolling inside a ring, while the sizes of the wheel and pen arm drift, so the figure never quite settles.

**5. Fractal Tree.** Grows level by level from the trunk, sways in a wind that travels up through its branches, blossoms at the tips, then fades and grows again with a new shape. Three trees a minute.

**6. Flow Field.** Four thousand particles follow an invisible current and leave ink behind, so a painting builds up over eighteen seconds, then fades for the next one.

**7. Hypercube.** A four-dimensional cube turning through 4D. As it rotates, the inner cube seems to swallow the outer one and turn itself inside out.

**8. Mandelbrot Zoom.** A one-minute dive into the part of the Mandelbrot set called Seahorse Valley, from the whole set to 1,500× magnification.

**9. Julia Morph.** A Julia set whose shape is controlled by a single point. That point travels around the edge of the Mandelbrot set, swinging in and out across it, so the Julia set keeps breaking apart into dust and pulling back together.

**10. Tunnel.** A kaleidoscope tunnel flying forward through a mirrored, twisting pattern.
