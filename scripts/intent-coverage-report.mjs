/**
 * Compositional Procurement Ontology — three-level coverage report.
 *
 * THE CONTRACT IS THREE LEVELS. Do not add a fourth.
 *
 *   A  exact intent
 *   B  family resolved      (usable WITHOUT AI)
 *   C  unresolved locally   (the only level the model may run on)
 *
 * Level B is split by HOW it resolved — ontology match vs semantic recovery —
 * because a successful local semantic recovery terminates locally and is B, not
 * C. That split is a method breakdown, not a level.
 *
 * Inside C — metadata, not levels:
 *   C AI eligible   lexical AND ontology AND semantic all failed; gate may call
 *   C rejected      nothing identifiable / not a supply line
 *
 * The flat-dictionary engine runs side by side so the frozen 15/462 baseline is
 * measured, never asserted.
 *
 * Usage:
 *   node scripts/intent-coverage-report.mjs
 *   node scripts/intent-coverage-report.mjs --json
 *   node scripts/intent-coverage-report.mjs fixtures/boq/warehouse-ops-02.flat.txt
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { createServer } from 'vite'

const DEFAULT_FIXTURES = [
  'fixtures/boq/warehouse-ops-02.flat.txt',
  'fixtures/boq/site-safety-02.flat.txt',
  'fixtures/boq/datacenter-cyber-01.flat.txt',
]

const args = process.argv.slice(2)
const jsonOnly = args.includes('--json')
const paths = args.filter((a) => !a.startsWith('--'))
const fixtures = (paths.length ? paths : DEFAULT_FIXTURES).filter((p) => {
  if (existsSync(resolve(p))) return true
  console.warn(`skip missing fixture: ${p}`)
  return false
})

const server = await createServer({
  configFile: './vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
})

const report = { ontology_version: null, fixtures: [], totals: null, baseline: null }
const pct = (part, total) => (total ? +((part / total) * 100).toFixed(1) : 0)

try {
  const parse = await server.ssrLoadModule('/src/lib/parseBoq.ts')
  const cpo = await server.ssrLoadModule('/src/lib/procurementOntology.ts')
  const legacy = await server.ssrLoadModule('/src/lib/procurementIntentEngine.ts')

  report.ontology_version = cpo.ONTOLOGY_VERSION
  report.intent_ids = cpo.listIntentIds()
  report.family_ids = cpo.listFamilyIds()

  const grand = {
    lines: 0,
    a_specific_intent: 0,
    b_family_resolved: 0,
    poolable: 0,
    b_via_ontology: 0,
    b_via_semantic_recovery: 0,
    b_via_lexicon: 0,
    c_unresolved: 0,
    c_ai_eligible: 0,
    c_rejected: 0,
    not_supply: 0,
  }
  const baseline = { lines: 0, resolved: 0 }
  const cHeads = new Map()

  for (const fixture of fixtures) {
    const text = readFileSync(resolve(fixture), 'utf8')
    const { lines, source } = parse.resolveParsedLines({
      text,
      fileName: basename(fixture).replace(/\.flat\.txt$/, '.pdf'),
    })
    const clean = parse.sanitizeBoqLines(lines)

    const t0 = performance.now()
    const batch = cpo.resolveOntologyBatch(clean.map((l, i) => ({ id: l.id ?? i, name: l.name })))
    const elapsed = performance.now() - t0

    const bySector = new Map()
    const byFamily = new Map()
    const byIntent = new Map()
    const bySource = new Map()
    const derived = []
    const cAiEligible = []
    const cSemantic = []
    let legacyResolved = 0

    for (const row of batch.lines) {
      const r = row.resolution
      bySource.set(r.source, (bySource.get(r.source) || 0) + 1)
      if (r.sector) bySector.set(r.sector, (bySector.get(r.sector) || 0) + 1)
      if (r.family) byFamily.set(r.family, (byFamily.get(r.family) || 0) + 1)
      if (r.intent) byIntent.set(r.intent, (byIntent.get(r.intent) || 0) + 1)
      if (r.debug.derived_from_intent) derived.push(r.debug.derived_from_intent)

      if (r.unresolved_bucket === 'ai_eligible') {
        cAiEligible.push(row.name)
        const key = r.head_concept.slice(0, 70)
        cHeads.set(key, (cHeads.get(key) || 0) + 1)
      }
      if (r.level === 'local_resolved' && r.source === 'semantic_recovery') {
        cSemantic.push(`${r.family} :: ${row.name}`)
      }

      if (legacy.resolveProcurementIntent(row.name).intent !== 'unknown') legacyResolved += 1
    }

    const c = batch.counts
    const u = batch.unresolved_breakdown
    const m = batch.family_by_method
    grand.lines += batch.line_count
    grand.a_specific_intent += c.specific_intent
    grand.b_family_resolved += c.local_resolved
    grand.poolable += batch.poolable
    grand.b_via_ontology += m.ontology_family
    grand.b_via_semantic_recovery += m.semantic_recovery
    grand.b_via_lexicon += m.lexicon
    grand.c_unresolved += c.unresolved
    grand.c_ai_eligible += u.ai_eligible
    grand.c_rejected += u.rejected
    grand.not_supply += batch.not_supply
    baseline.lines += batch.line_count
    baseline.resolved += legacyResolved

    report.fixtures.push({
      fixture,
      parse_source: source,
      lines: batch.line_count,
      a_specific_intent: c.specific_intent,
      b_family_resolved: c.local_resolved,
      poolable: batch.poolable,
      b_via_ontology: m.ontology_family,
      b_via_semantic_recovery: m.semantic_recovery,
      b_via_lexicon: m.lexicon,
      c_unresolved: c.unresolved,
      c_ai_eligible: u.ai_eligible,
      c_rejected: u.rejected,
      not_supply: batch.not_supply,
      local_usable_pct: pct(c.specific_intent + c.family, batch.line_count),
      baseline_dictionary_resolved: legacyResolved,
      baseline_dictionary_pct: pct(legacyResolved, batch.line_count),
      ancestor_derived: derived.length,
      pools: batch.pools.length,
      pool_reduction_pct: pct(batch.line_count - batch.pools.length, batch.line_count),
      avg_resolve_ms: batch.line_count ? +(elapsed / batch.line_count).toFixed(3) : 0,
      by_sector: Object.fromEntries([...bySector].sort((a, b) => b[1] - a[1])),
      by_source: Object.fromEntries([...bySource].sort((a, b) => b[1] - a[1])),
      top_families: Object.fromEntries([...byFamily].sort((a, b) => b[1] - a[1]).slice(0, 12)),
      top_intents: Object.fromEntries([...byIntent].sort((a, b) => b[1] - a[1]).slice(0, 12)),
      sample_c_ai_eligible: cAiEligible.slice(0, 15),
      sample_b_semantic_recovery: cSemantic.slice(0, 10),
    })
  }

  report.totals = {
    ...grand,
    a_pct: pct(grand.a_specific_intent, grand.lines),
    b_pct: pct(grand.b_family_resolved, grand.lines),
    c_pct: pct(grand.c_unresolved, grand.lines),
    local_usable: grand.a_specific_intent + grand.b_family_resolved,
    local_usable_pct: pct(grand.a_specific_intent + grand.b_family_resolved, grand.lines),
    intent_count: report.intent_ids.length,
    family_count: report.family_ids.length,
    top_c_ai_eligible_heads: [...cHeads]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([head, count]) => ({ head, count })),
  }
  report.baseline = { ...baseline, coverage_pct: pct(baseline.resolved, baseline.lines) }

  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(
      `ontology=${report.ontology_version} families=${report.family_ids.length} intents=${report.intent_ids.length}`,
    )
    for (const f of report.fixtures) {
      console.log(`\n=== ${f.fixture} (${f.parse_source}) ===`)
      console.log(`A exact intent     ${String(f.a_specific_intent).padStart(4)}`)
      console.log(`B family resolved  ${String(f.b_family_resolved).padStart(4)}`)
      console.log(`    B via ontology         ${f.b_via_ontology}`)
      console.log(`    B via semantic recovery ${f.b_via_semantic_recovery}`)
      console.log(`C unresolved       ${String(f.c_unresolved).padStart(4)}`)
      console.log(`    C AI eligible        ${f.c_ai_eligible}`)
      console.log(`    C rejected           ${f.c_rejected}`)
      console.log(
        `lines=${f.lines}  local usable=${f.local_usable_pct}%  (flat dictionary=${f.baseline_dictionary_pct}%)  derived=${f.ancestor_derived}  pools=${f.pools} (-${f.pool_reduction_pct}%)  avg=${f.avg_resolve_ms}ms`,
      )
      console.log('by sector  :', JSON.stringify(f.by_sector))
      console.log('by source  :', JSON.stringify(f.by_source))
      console.log('top intents:', JSON.stringify(f.top_intents))
      if (f.sample_c_ai_eligible.length) {
        console.log('C / AI eligible sample:')
        for (const n of f.sample_c_ai_eligible) console.log('   -', n)
      }
    }
    const t = report.totals
    console.log('\n=== TOTALS — three levels ===')
    console.log(`lines                ${String(t.lines).padStart(4)}`)
    console.log(`A  exact intent      ${String(t.a_specific_intent).padStart(4)}  (${t.a_pct}%)`)
    console.log(`B  family resolved   ${String(t.b_family_resolved).padStart(4)}  (${t.b_pct}%)`)
    console.log('     --- how B resolved (method, not levels) ---')
    console.log(`     B via lexicon            ${String(t.b_via_lexicon).padStart(4)}`)
    console.log(`     B via ontology family    ${String(t.b_via_ontology).padStart(4)}`)
    console.log(`     B via semantic recovery  ${String(t.b_via_semantic_recovery).padStart(4)}`)
    console.log(`C  unresolved        ${String(t.c_unresolved).padStart(4)}  (${t.c_pct}%)`)
    console.log('     --- inside C (metadata, not levels) ---')
    console.log(`     C AI eligible         ${String(t.c_ai_eligible).padStart(4)}`)
    console.log(`     C rejected            ${String(t.c_rejected).padStart(4)}`)
    console.log(`LOCAL USABLE (A+B)   ${String(t.local_usable).padStart(4)}  (${t.local_usable_pct}%)`)
    // The CONSUMPTION number, distinct from the reporting number above: only
    // these lines may key a supplier pool, a cache entry or intent_supplier_map.
    console.log(`POOLABLE (confident) ${String(t.poolable).padStart(4)}  <- Phase 2 keys the map on THIS`)
    console.log(
      `flat dictionary      ${String(report.baseline.resolved).padStart(4)}  (${report.baseline.coverage_pct}%)  <- frozen baseline`,
    )
    if (t.top_c_ai_eligible_heads.length) {
      console.log('\nC / AI-eligible head concepts:')
      for (const row of t.top_c_ai_eligible_heads) {
        console.log(`  ${String(row.count).padStart(3)}  ${row.head}`)
      }
    }
  }

  writeFileSync('fixtures/boq/last-intent-coverage.json', JSON.stringify(report, null, 2))
} finally {
  await server.close()
}
