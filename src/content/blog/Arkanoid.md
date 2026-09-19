---
title: Arkanoid
date: 2026-09-01
description: The Arcade is here
---
Time to bring back the Atari classic Arkanoid. One of my favorite games from the 80's.

## The Tech Stack

The best part of this project is what I _didn't_ add. Arkanoid runs entirely on the stack the site already used. It needed no new dependencies, no game engine and no backend, and it added only about 34 KB to the bundle.

**The site itself**

- **React 19 + TypeScript**, built with **Vite**
- **React Router** for the `/projects/arkanoid` route
- **Tailwind CSS** for the page chrome, menus and overlays, styled in the site's art deco brass
- Hosted on **AWS Amplify**

**The game**

- **HTML5 Canvas 2D** for all the drawing: bricks, ball, the Vaus paddle and even the score and lives display. The game has at most about 100 rectangles and 3 balls on screen, so Canvas handles it easily. That made WebGL or PixiJS unnecessary.
- **A hand-rolled engine** of about 1,000 lines of TypeScript, split into engine, physics, levels, rendering and audio modules. I looked at Phaser and ruled it out. At about 1.1 MB it would have more than doubled the site's bundle, and its physics is designed for platformers. Arkanoid's collision code is about 30 lines.
- **Web Audio API** for sound. Every blip is synthesised from an oscillator at runtime, so there are no audio files at all. For this game a square wave is also the right sound.
- **localStorage** for the high score

**How it's built**

- **React doesn't run the game.** Every other page on the site updates through React state, but re-rendering React 60 times a second would waste the frame budget. The game state is a plain object advanced by a `requestAnimationFrame` loop. React mounts the canvas and then only steps in for pause, level complete and game over.
- **A fixed 120 Hz physics tick.** Physics steps at a constant rate with an accumulator, and the renderer interpolates between steps. This means the game plays at the same speed on a 60 Hz laptop and a 144 Hz gaming monitor.
- **The ball can't pass through bricks.** The tick rate and the top ball speed are chosen so the ball never moves further in one step than the thinnest object it can hit. A runtime check warns if a tuning change breaks that.
- **Sharp at any size.** The game uses a fixed 224×288 playfield, close to the arcade's portrait screen. It scales up in whole-number steps to fit the screen and accounts for high-resolution displays, so the pixels stay crisp on retina screens.
- **Levels are text.** Each of the 5 levels is a grid of strings, one character per brick, so you can read and edit a layout at a glance.
- **Tested by a bot.** A test script plays through every level automatically and checks the physics: bounce angles, speed on different refresh rates, and that the ball never passes through a brick.

