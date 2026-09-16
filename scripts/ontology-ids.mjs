/**
 * Emit the Compositional Procurement Ontology ID surface as JSON.
 *
 * This exists so the sibling lanes never hardcode ontology IDs:
 *   - the AI/cache lane validates model proposals against `intents` / `families`
 *   - the Phase 2 lane keys `intent_supplier_map.intent_key` on `intents`
 *
 * Both lanes should read this output (or import `listOntologyIds()` directly)
 * and compare `ontology_version` against what they last ingested. A hardcoded
 * list rots silently the next time an intent splits.
 *
 * Usage:
 *   node scripts/ontology-ids.mjs                  # JSON to stdout
 *   node scripts/ontology-ids.mjs --out ids.json   # JSON to a file
 *   node scripts/ontology-ids.mjs --intents        # newline-separated intent ids
 */
import { writeFileSync } from 'node:fs'
import { createServer } from 'vite'

const args = process.argv.slice(2)
const outIndex = args.indexOf('--out')
const outPath = outIndex >= 0 ? args[outIndex + 1] : null

const server = await createServer({
  configFile: './vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
})

try {
  const cpo = await server.ssrLoadModule('/src/lib/procurementOntology.ts')
  const surface = cpo.listOntologyIds()

  if (args.includes('--intents')) {
    console.log(surface.intents.join('\n'))
  } else if (args.includes('--families')) {
    console.log(surface.families.join('\n'))
  } else if (outPath) {
    writeFileSync(outPath, `${JSON.stringify(surface, null, 2)}\n`)
    console.log(
      `${outPath}: ${surface.ontology_version} — ${surface.families.length} families, ${surface.intents.length} intents`,
    )
  } else {
    console.log(JSON.stringify(surface, null, 2))
  }
} finally {
  await server.close()
}
