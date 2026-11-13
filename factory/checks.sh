#!/usr/bin/env bash
# The repo's checks. Exit 0 only when the branch is fit to review.
#
# The gate runs this script from the main checkout with the job's worktree as
# the working directory. Keep it fast, deterministic and non-interactive: no
# watch modes, no prompts, nothing that rewrites files.
set -euo pipefail

# A fresh worktree has no node_modules, and a job may change the lockfile.
npm ci --prefer-offline --no-audit --no-fund

npm run lint

# tsc -b (typecheck) then vite build
npm run build

# Numerical checks and GLSL compiles. glslangValidator missing = SKIP, not a pass.
node scripts/verify-screenripper.mjs
node scripts/verify-aurora.mjs
node scripts/verify-near-earth.mjs
