---
title: Aurora Watch
date: 2026-11-08
description: A live aurora on a hand-built 3D Earth, driven by NOAA's forecast, and what it takes to tell someone whether they could see it tonight
---
The Sun throws off a constant wind of charged particles. Spacecraft parked between the Sun and Earth measure it before it arrives, which gives forecasters a warning of somewhere between 30 and 90 minutes. NOAA feeds those measurements into a model called OVATION and publishes the result as a grid: 65,160 numbers, one for each degree of latitude and longitude, giving the chance of seeing aurora in that spot.

[Aurora Watch](/projects/aurora) takes that grid and puts it on a globe.

## What it does

- **A live globe.** Earth is drawn in WebGL with the real day-night line and city lights on the night side. The aurora is ray-marched through a shell above the surface, green in the middle, red at the top and violet along the lower edge, following the altitudes where oxygen and nitrogen actually emit.
- **Can I see it?** Click anywhere for a verdict based on the aurora within sight, how dark it is, cloud cover and the Moon. Cloud is usually the one that ruins it.
- **Look up.** The camera flies down to that spot and looks at the sky. The geometry is real, so curtains that fill the sky in northern Norway sit low on the horizon a few hundred kilometres further south.
- **Sun to Earth.** An animated stream shows the solar wind as it's being measured, with the time it will reach Earth.
- **Storm Time Machine.** Replay how far a storm would reach, up to the 1859 Carrington event, when aurora was seen in the tropics. These are illustrations and are labelled that way.

## The honest part

NOAA's number is a probability, not a brightness, so turning it into glow is a choice. On the night I built this the whole grid peaked at 21%, which is why the brightness curve is fixed. Scaling to each night's maximum would make every quiet night look like a major storm. The folds and rays are also invented: the data is 111 km across per cell, so it says where the aurora is and how strong, and the detail inside is procedural.
