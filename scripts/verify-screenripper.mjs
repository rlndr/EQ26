/**
 * ScreenRipper verification runner:
 *
 *   node scripts/verify-screenripper.mjs
 *
 * 1. Bundles and runs src/lib/screenripper/verify.ts. Arkanoid's one-line rolldown command
 *    cannot be reused because effects import shaders with Vite's `?raw` suffix, which rolldown
 *    does not understand on its own; the small plugin below does what Vite does.
 * 2. Compiles every .glsl file under src/lib/screenripper with glslangValidator as GLSL ES 3.00
 *    (`sudo apt install glslang-tools`). Missing tool = SKIP, reported as such, never a pass.
 *
 * Plain .mjs outside src/ so it can use Node APIs; the app's tsconfig has no Node types.
 * Exits non-zero if anything fails.
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { rolldown } from 'rolldown'

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..')
const SRC = join(ROOT, 'src/lib/screenripper')
let failed = false

// --- 1. verify.ts ------------------------------------------------------------

const raw = {
  name: 'raw',
  resolveId(source, importer) {
    if (!source.endsWith('?raw')) return null
    return resolve(dirname(importer), source.slice(0, -'?raw'.length)) + '?raw'
  },
  load(id) {
    if (!id.endsWith('?raw')) return null
    return `export default ${JSON.stringify(readFileSync(id.slice(0, -'?raw'.length), 'utf8'))}`
  },
}

const dir = mkdtempSync(join(tmpdir(), 'screenripper-verify-'))
try {
  const bundle = await rolldown({ input: join(SRC, 'verify.ts'), plugins: [raw] })
  const file = join(dir, 'verify.mjs')
  await bundle.write({ file, format: 'esm' })
  const run = spawnSync(process.execPath, [file], { encoding: 'utf8' })
  process.stdout.write(run.stdout)
  process.stderr.write(run.stderr)
  if (run.status !== 0 || !run.stdout.includes('ALL CHECKS PASSED')) failed = true
} finally {
  rmSync(dir, { recursive: true, force: true })
}

// --- 2. shaders --------------------------------------------------------------

console.log('SHADER COMPILE (glslangValidator, GLSL ES 3.00)')
const shaders = readdirSync(SRC, { recursive: true })
  .filter((f) => f.endsWith('.glsl'))
  .sort()
for (const f of shaders) {
  const stage = f.endsWith('.vert.glsl') ? 'vert' : f.endsWith('.frag.glsl') ? 'frag' : null
  const name = relative(ROOT, join(SRC, f))
  if (!stage) {
    console.log(`  FAIL  ${name}   name must end .vert.glsl or .frag.glsl`)
    failed = true
    continue
  }
  const r = spawnSync('glslangValidator', ['-S', stage, join(SRC, f)], { encoding: 'utf8' })
  if (r.error?.code === 'ENOENT') {
    console.log('  SKIP  glslangValidator not installed (sudo apt install glslang-tools)')
    break
  }
  // glslang echoes the file name on its first line even on success; keep only the errors
  const ok = r.status === 0
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) {
    failed = true
    console.log(r.stdout.split('\n').filter((l) => /^(ERROR|WARNING)/.test(l)).map((l) => `        ${l}`).join('\n'))
  }
}

console.log(`\n${failed ? 'VERIFICATION FAILED' : 'VERIFICATION PASSED'}\n`)
process.exitCode = failed ? 1 : 0
