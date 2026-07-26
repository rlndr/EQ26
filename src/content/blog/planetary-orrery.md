---
title: Building the Planetary Orrery
date: 2026-07-18
description: A live map of the solar system, powered by NASA JPL ephemeris data
---

## A map of the solar system

The newest project on the site is a [planetary orrery](/projects/planets): a top-down view of the solar system showing where the eight planets actually are right now, drawn from NASA JPL's Horizons ephemeris data. There's a timeline you can scrub six months either way (or just press play and watch a year sweep by in about twenty seconds), a readout that flags when planets bunch up into an alignment, and an inner-planet view that adds the Moon.

## Honest angles, dishonest distances

You can't draw the solar system to scale and have it be useful — Neptune orbits about 77 times farther out than Mercury, so a true-scale drawing crushes the inner planets into the Sun. The compromise: angles are exact, distances are compressed on a square-root scale. Since planetary alignment is entirely about angle, the picture stays truthful where it matters. The Moon gets the same treatment in reverse — its direction from Earth is real, but it's drawn far enough out to actually see, because at true scale it would sit inside Earth's dot.

## A bug worth remembering

The data pipeline seemed simple — a Lambda queries Horizons daily, caches the results, and serves them as compact JSON.

**Horizons hates a crowd.** Fire eight requests at it concurrently and most come back as HTTP 503s. Query it one planet at a time and it's perfectly happy. The lesson: when your requests fan out to one upstream, sequential isn't always the naive option — sometimes it's the only one that works.

## What's next

The stretch list still has a "next great alignment" finder on it — scanning the ephemeris for the next time the planets really line up. Until then, the orrery is live on the [projects page](/projects).
