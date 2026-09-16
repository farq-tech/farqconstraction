/**
 * Export real `cpo-v2` resolutions for the end-to-end retrieval test.
 *
 * The API cannot import TypeScript, and vendoring a second copy of the resolver
 * is exactly what drifts. So this lane's half of the end-to-end run is: resolve
 * the booklet lines with the REAL resolver here, write the resolutions to JSON,
 * and let the API side do retrieval / veto / ranking against the real directory
 * from that handoff. Nothing is re-derived on the far side.
 *
 * Writes: fixtures/boq/last-e2e-resolutions.json
 *
 *   node scripts/e2e-export-resolutions.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { createServer } from 'vite'

const FIXTURES = [
  'fixtures/boq/warehouse-ops-02.flat.txt',
  'fixtures/boq/site-safety-02.flat.txt',
  'fixtures/boq/datacenter-cyber-01.flat.txt',
]

/**
 * The ten PPE strings from ELE-RFQ-51D17AF6 that were relabelled «ألواح أو إس
 * بي» (OSB boards) and sent to a tools supplier. Carried as an explicit probe
 * set because the failure was observed on production data, not in a booklet.
 */
const PPE_PROBE = [
  'قبعة حماية',
  'بدلة مقاومة للهب',
  'جزمة PVC',
  'مريلة جلدية',
  'قفازات جلدية',
  'سدادات أذن',
  'نظارة حماية',
  'كمامة نصف وجه',
  'حزام أمان للعمل على ارتفاع',
  'واقي وجه للحام',
]

const server = await createServer({
  configFile: './vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
})

const out = { ontology_version: null, generated_at: new Date().toISOString(), groups: [] }

try {
  const parse = await server.ssrLoadModule('/src/lib/parseBoq.ts')
  const cpo = await server.ssrLoadModule('/src/lib/procurementOntology.ts')

  out.ontology_version = cpo.ONTOLOGY_VERSION
  out.intent_ids = cpo.listIntentIds()

  // Only the fields the API side is allowed to consume. `poolable` is the one
  // that governs retrieval; it is copied verbatim and never recomputed.
  const shape = (name, r) => ({
    name,
    level: r.level,
    level_code: r.level_code,
    poolable: r.poolable,
    source: r.source,
    sector: r.sector,
    family: r.family,
    category: r.category,
    intent: r.intent,
    facets: r.facets,
    pool_affecting_facets: r.pool_affecting_facets ?? null,
    pool_key: r.pool_key,
    confidence: r.confidence,
    unresolved_bucket: r.unresolved_bucket,
    ai_eligible: r.ai_eligible,
  })

  for (const fixture of FIXTURES) {
    const text = readFileSync(resolve(fixture), 'utf8')
    const { lines } = parse.resolveParsedLines({
      text,
      fileName: basename(fixture).replace(/\.flat\.txt$/, '.pdf'),
    })
    const clean = parse.sanitizeBoqLines(lines)
    const batch = cpo.resolveOntologyBatch(clean.map((l, i) => ({ id: l.id ?? i, name: l.name })))
    out.groups.push({
      group: basename(fixture).replace(/\.flat\.txt$/, ''),
      kind: 'BOOKLET',
      lines: batch.lines.map((row) => shape(row.name, row.resolution)),
    })
  }

  const ppe = cpo.resolveOntologyBatch(PPE_PROBE.map((name, id) => ({ id, name })))
  out.groups.push({
    group: 'ELE-RFQ-51D17AF6-ppe',
    kind: 'PPE_PROBE',
    lines: ppe.lines.map((row) => shape(row.name, row.resolution)),
  })

  writeFileSync('fixtures/boq/last-e2e-resolutions.json', JSON.stringify(out, null, 2))
  for (const group of out.groups) {
    const poolable = group.lines.filter((l) => l.poolable).length
    const withIntent = group.lines.filter((l) => l.poolable && l.intent).length
    console.log(
      `${group.group}: ${group.lines.length} lines, poolable ${poolable}, poolable+intent ${withIntent}`,
    )
  }
  console.log(`ontology_version=${out.ontology_version} -> fixtures/boq/last-e2e-resolutions.json`)
} finally {
  await server.close()
}
