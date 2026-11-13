/**
 * Earthquake globe verification runner:
 *
 *   node scripts/verify-earthquakes.mjs
 *
 * Bundles and runs src/lib/earthquakes/verify.ts. The small plugin below handles Vite's `?raw`
 * shader import, which rolldown does not understand on its own; the checks read the marker shader's
 * band colours. The shader itself is compiled by verify-near-earth.mjs.
 *
 * Plain .mjs outside src/ so it can use Node APIs; the app's tsconfig has no Node types.
 * Exits non-zero if anything fails.
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { rolldown } from 'rolldown'

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..')
let failed = false

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

const dir = mkdtempSync(join(tmpdir(), 'earthquakes-verify-'))
try {
  const bundle = await rolldown({ input: join(ROOT, 'src/lib/earthquakes/verify.ts'), plugins: [raw] })
  const file = join(dir, 'verify.mjs')
  await bundle.write({ file, format: 'esm' })
  const run = spawnSync(process.execPath, [file], { encoding: 'utf8' })
  process.stdout.write(run.stdout)
  process.stderr.write(run.stderr)
  if (run.status !== 0 || !run.stdout.includes('ALL CHECKS PASSED')) failed = true
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log(`${failed ? 'VERIFICATION FAILED' : 'VERIFICATION PASSED'}\n`)
process.exitCode = failed ? 1 : 0
