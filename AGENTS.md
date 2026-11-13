# AGENTS.md

land3r.net: a personal React 19 + TypeScript + Vite site of self-contained
interactive projects and a markdown blog, hosted on AWS Amplify. `README.md`
describes every page, its data sources and its architecture; read the section
for the project you are touching.

## Setup

Node 22 or later (`.nvmrc`). A fresh checkout needs only:

```bash
npm ci
```

No env files. `glslangValidator` (`glslang-tools`) is needed for the shader
checks; without it they report SKIP.

## Dev server

```bash
npm run dev -- --port <port> --strictPort
```

`/api/planets` proxies to the deployed planet-positions Lambda. `/api/near-earth`
proxies to a local API; for Near Earth pages, also start it on a free port and
point Vite at it:

```bash
PORT=<api-port> node lambda/near-earth/dev-server.mjs
NEAR_EARTH_API=http://localhost:<api-port> npm run dev -- --port <port> --strictPort
```

## Validation

These match `factory/checks.sh`, and all must pass:

```bash
npm run lint                          # ESLint
npm run build                         # tsc -b typecheck, then vite build
node scripts/verify-screenripper.mjs  # numerical checks + GLSL compile
node scripts/verify-aurora.mjs
node scripts/verify-near-earth.mjs    # includes the near-earth Lambda's checks
```

## Conventions

- A project is a page in `src/pages/`, components in `src/components/<project>/`,
  and pure logic in `src/lib/<project>/`, with a `verify.ts` harness for the
  maths where it has any. Register the route in `src/App.tsx`, list it on
  `src/pages/ProjectsPage.tsx`, and add it to `README.md` (Pages table, a
  section, Project Structure).
- Animation loops (canvas, WebGL) run outside React state; React re-renders only
  on discrete events.
- Styling is Tailwind v3, dark (zinc) with the `brass` accent from
  `tailwind.config.js`.
- Any new external host the browser calls must be added to the CSP in
  `index.html`.
- Lambdas under `lambda/` and Amplify rewrite rules are deployed by hand, not by
  merging.

## Software factory

`/factory run` builds every open GitHub issue labeled `factory` through
intake → spec → build → gate → review → approve, one PR per issue. State is in
`factory/jobs/` (gitignored); `factory/bin/job` is its only writer. Checks:
`factory/checks.sh`. Dashboard: `cd factory && python3 -m http.server`, then
open http://localhost:8000/dashboard.html.

Each job works in its own git worktree, a full checkout of the repo at
`.worktrees/<job-id>` (gitignored). A tool run from the repo root that doesn't
read `.gitignore` sees those copies too; exclude `.worktrees/` in its config.
