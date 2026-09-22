import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outdir = resolve(root, 'api/_bundled')
mkdirSync(outdir, { recursive: true })

const shared = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  logLevel: 'info',
}

await build({
  ...shared,
  entryPoints: [resolve(root, 'src/lib/taseerApi.ts')],
  outfile: resolve(outdir, 'taseer.mjs'),
})

await build({
  ...shared,
  entryPoints: [resolve(root, 'src/lib/harajPublic/fetch.ts')],
  outfile: resolve(outdir, 'haraj.mjs'),
})
