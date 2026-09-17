/**
 * Held-out evaluation of the procurement resolver against tender batches 3-10.
 *
 * The ontology payload is PINNED to the API's vendored cpo-v3 so the numbers
 * stay comparable while the repo tree moves to cpo-v4 / term_guards. Nothing in
 * the repo is mutated: the payload is swapped by resolving the resolver's only
 * import to the vendored file.
 *
 * Reports the three-level contract only. `semantic_recovery` is Level B.
 * `ai_eligible` is metadata inside C, never a level. No AI is called.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve as pathResolve } from 'node:path'
import { createServer } from 'vite'
import crypto from 'node:crypto'

const VENDORED = '/Users/m4pro/farq/api/data/construction/procurement-ontology.data.json'
const REPO_DATA = pathResolve('src/lib/procurementOntology.data.json')
const OUT_DIR = pathResolve('fixtures/boq')
const args = process.argv.slice(2)
const setPath = args[0]
const label = args[1] || 'set'
/**
 * Which payload to measure. `cpo-v3` is the API's vendored copy, the baseline
 * every held-out number was first reported against; anything else measures the
 * repo tree and asserts the version matches what the caller asked for, so a
 * stale payload can never be mistaken for a re-measurement.
 */
const wantVersion = args[2] || 'cpo-v3'
const PAYLOAD = wantVersion === 'cpo-v3' ? VENDORED : REPO_DATA

const pinPlugin = {
  name: 'pin-ontology-payload',
  enforce: 'pre',
  resolveId(id) {
    if (id.endsWith('procurementOntology.data.json')) return PAYLOAD
    return null
  },
}

const server = await createServer({
  configFile: './vite.config.ts',
  plugins: [pinPlugin],
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

const sha = (p) => crypto.createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16)

try {
  const cpo = await server.ssrLoadModule('/src/lib/procurementOntology.ts')
  if (cpo.ONTOLOGY_VERSION !== wantVersion) {
    throw new Error(`payload pin FAILED: wanted ${wantVersion}, got ${cpo.ONTOLOGY_VERSION}`)
  }

  const lines = readFileSync(setPath, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)

  const buckets = { A: 0, B: 0, C: 0 }
  const bMethod = { ontology: 0, semantic_recovery: 0 }
  const cMeta = { ai_eligible: 0, rejected: 0 }
  const byFamilyUnresolved = new Map()
  const byFamilyA = new Map()
  const perLevelRows = []
  const confBuckets = { 'A>=0.9': 0, 'A0.8-0.9': 0, 'A<0.8': 0 }

  for (const line of lines) {
    const r = cpo.resolveOntology(line)
    const code = r.level_code
    buckets[code] = (buckets[code] || 0) + 1
    if (code === 'B') {
      if (r.source === 'semantic_recovery') bMethod.semantic_recovery++
      else bMethod.ontology++
    }
    if (code === 'C') {
      const b = r.unresolved_bucket || 'rejected'
      cMeta[b] = (cMeta[b] || 0) + 1
    }
    if (code === 'A') {
      if (r.confidence >= 0.9) confBuckets['A>=0.9']++
      else if (r.confidence >= 0.8) confBuckets['A0.8-0.9']++
      else confBuckets['A<0.8']++
      byFamilyA.set(r.family, (byFamilyA.get(r.family) || 0) + 1)
    }
    if (code === 'C') {
      const key = 'UNRESOLVED'
      byFamilyUnresolved.set(key, (byFamilyUnresolved.get(key) || 0) + 1)
    }
    perLevelRows.push({
      line,
      level: code,
      source: r.source,
      sector: r.sector,
      family: r.family,
      category: r.category,
      intent: r.intent,
      confidence: r.confidence,
      poolable: r.poolable,
      unresolved_bucket: r.unresolved_bucket,
      ai_eligible: r.ai_eligible,
      matched_term: r.debug?.matched_term ?? null,
    })
  }

  const total = lines.length
  const pct = (n) => +((n / total) * 100).toFixed(2)
  const report = {
    label,
    measured_at: new Date().toISOString(),
    provenance: {
      ontology_payload: PAYLOAD,
      ontology_version: cpo.ONTOLOGY_VERSION,
      ontology_payload_sha256_16: sha(PAYLOAD),
      ontology_fingerprint: cpo.ontologyFingerprint ? cpo.ontologyFingerprint() : null,
      repo_payload_sha256_16: sha(REPO_DATA),
      repo_payload_version_note: 'repo tree is cpo-v4 in progress; NOT used for these numbers',
      resolver_code_rev: process.env.RESOLVER_REV || null,
      api_code_rev: process.env.API_REV || null,
      ai_calls: 0,
    },
    set: { path: setPath, lines: total },
    three_levels: {
      A_specific_intent: { n: buckets.A, pct: pct(buckets.A) },
      B_family_resolved: { n: buckets.B, pct: pct(buckets.B), method: bMethod },
      C_true_unknown: { n: buckets.C, pct: pct(buckets.C), metadata: cMeta },
    },
    A_confidence_distribution: confBuckets,
    top_families_A: [...byFamilyA.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25),
  }

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(pathResolve(OUT_DIR, `heldout-${label}.${wantVersion}.report.json`), JSON.stringify(report, null, 2))
  writeFileSync(
    pathResolve(OUT_DIR, `heldout-${label}.${wantVersion}.rows.jsonl`),
    perLevelRows.map((r) => JSON.stringify(r)).join('\n') + '\n',
  )
  console.log(JSON.stringify(report, null, 2))
} finally {
  await server.close()
}
