/**
 * The Gold Set instrument. One run should say whether the system is better.
 *
 * Metrics are exactly those fixed in fixtures/gold/METRICS.md before any
 * measurement. Nothing is computed here that is not defined there.
 *
 * TWO RETRIEVAL PATHS, on purpose.
 *   `live_text`  — what production does for a BOQ line today: the resolver's
 *                  search terms against the directory's names and item text.
 *                  `construction.intent_supplier_map` DOES NOT EXIST in
 *                  production, so this is the only path a buyer actually gets.
 *   `specialty`  — the evidence the intent-supplier map would key on
 *                  (`construction.supplier_specialties`, 16,279 rows over 9,689
 *                  suppliers).
 * Reporting both is what makes a zero attributable: if `live_text` returns
 * nothing where `specialty` returns suppliers, the mapping is broken rather than
 * the directory being empty. That is the difference between the two zero classes.
 *
 *   node scripts/gold-set-run.mjs [--no-heldout]
 */
import pg from '/Users/m4pro/farq/api/node_modules/pg/lib/index.js'
import { config } from '/Users/m4pro/farq/api/node_modules/dotenv/lib/main.js'
import { createServer } from 'vite'
import { createHash, createHmac } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

config({ path: '/Users/m4pro/farq/api/.env' })
const INCLUDE_HELDOUT = !process.argv.includes('--no-heldout')
const TOP_N = 5

// ---------------------------------------------------------------- fingerprints
const sha16 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16)
const fingerprint = {
  payload_sha16: sha16('src/lib/procurementOntology.data.json'),
  resolver_sha16: sha16('src/lib/procurementOntology.ts'),
  ontology_version: JSON.parse(readFileSync('src/lib/procurementOntology.data.json', 'utf8')).version,
  supplier_side: 'live_directory_query',
  intent_supplier_map: 'ABSENT — relation construction.intent_supplier_map does not exist',
}

// ------------------------------------------------------------------- the set
const evidenceMap = JSON.parse(readFileSync('fixtures/gold/material-evidence.json', 'utf8'))
const GENERIC = new Set(evidenceMap.generic_no_material_evidence)
const FAMILY_EVIDENCE = evidenceMap.families

const items = []
for (const [i, line] of readFileSync('fixtures/boq/reference-booklet-68.shortform.txt', 'utf8')
  .split('\n').map((s) => s.trim()).filter(Boolean).entries()) {
  items.push({ id: `BOOK-${String(i + 1).padStart(2, '0')}`, component: 'booklet_68', line })
}
for (const e of JSON.parse(readFileSync('fixtures/gold/error-corpus.json', 'utf8')).items) {
  items.push({ id: e.id, component: 'error_corpus', line: e.line, expect: e })
}
const vault = join(homedir(), '.farq-gold-heldout', 'heldout-2026-09-17.jsonl')
let heldoutCount = 0
if (INCLUDE_HELDOUT && existsSync(vault)) {
  for (const raw of readFileSync(vault, 'utf8').split('\n').filter(Boolean)) {
    const h = JSON.parse(raw)
    items.push({ id: h.id, component: 'fresh_heldout', line: h.line, category: h.category })
    heldoutCount++
  }
}

// --------------------------------------------------------------- the supply side
const conn = process.env.DATABASE_URL.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/[?&]$/, '').replace(':5432/', ':6543/')
const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })
await client.connect()
await client.query('set default_transaction_read_only = on')
await client.query('set statement_timeout = 300000')

const sup = await client.query(`
  select id, coalesce(name_ar, name_en) as name, coalesce(supplied_items_text,'') as items_text,
         qualification_status, directory_visibility
  from construction.suppliers
  where active and directory_visibility <> 'PRIVATE'`)
const specs = await client.query(`
  select supplier_id, specialty_id, specialty_level, confidence, evidence_kind
  from construction.supplier_specialties where active`)
await client.end()

const suppliers = new Map()
for (const r of sup.rows) {
  suppliers.set(r.id, {
    id: r.id, name: r.name || '', items_text: r.items_text,
    tags: r.items_text.split(',').map((t) => t.trim()).filter(Boolean),
    verified: r.qualification_status === 'VERIFIED_DIRECTORY',
    specialties: [],
  })
}
const bySpecialty = new Map()
for (const r of specs.rows) {
  const s = suppliers.get(r.supplier_id)
  if (!s) continue
  s.specialties.push({ id: r.specialty_id, primary: r.specialty_level === 'رئيسي', confidence: Number(r.confidence) || 0, kind: r.evidence_kind })
  if (!bySpecialty.has(r.specialty_id)) bySpecialty.set(r.specialty_id, [])
  bySpecialty.get(r.specialty_id).push(r.supplier_id)
}
console.log(`supply side: ${suppliers.size} visible suppliers, ${specs.rowCount} specialty rows over ${new Set(specs.rows.map((r) => r.supplier_id)).size} suppliers`)

// A cheap text index so the live_text path does not scan 245k rows per item.
const norm = (s) => String(s).toLowerCase().replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim()
const haystack = new Map()
for (const s of suppliers.values()) haystack.set(s.id, norm(`${s.name} ${s.items_text}`))

// --------------------------------------------------------------- the resolver
const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' })
const m = await server.ssrLoadModule('/src/lib/procurementOntology.ts')
const DATA = JSON.parse(readFileSync('src/lib/procurementOntology.data.json', 'utf8'))
const sectorOfFamily = new Map(DATA.families.map((f) => [f.id, f.sector]))

// --------------------------------------------------------------- verdicts
/** METRICS.md §3. Returns APPROPRIATE | WRONG_MATERIAL | UNSURE plus the reason. */
function judge(supplier, family) {
  const evidence = FAMILY_EVIDENCE[family]
  if (!family) return { verdict: 'UNSURE', why: 'item resolved to no family — nothing to be appropriate to' }
  if (!evidence) return { verdict: 'UNSURE', why: `family «${family}» is deliberately unmapped in material-evidence.json` }
  const claims = [...new Set([...supplier.specialties.map((s) => s.id), ...supplier.tags])]
  const material = claims.filter((c) => !GENERIC.has(c))
  if (!material.length) return { verdict: 'UNSURE', why: claims.length ? `only generic claims: ${claims.join(', ')}` : 'no recorded evidence' }
  const hit = material.find((c) => evidence.includes(c))
  if (hit) return { verdict: 'APPROPRIATE', why: `claims «${hit}», which is evidence for ${family}`, deciding: hit }
  // Material claims exist but none belongs to this family. Is any of them another
  // family's evidence? That is what makes it wrong rather than merely unrelated.
  for (const [otherFamily, tags] of Object.entries(FAMILY_EVIDENCE)) {
    if (otherFamily === family) continue
    const other = material.find((c) => tags.includes(c))
    if (other && sectorOfFamily.get(otherFamily) !== sectorOfFamily.get(family)) {
      return { verdict: 'WRONG_MATERIAL', why: `claims «${other}» (evidence for ${otherFamily}, sector ${sectorOfFamily.get(otherFamily)}) and nothing for ${family}`, deciding: other }
    }
  }
  return { verdict: 'UNSURE', why: `material claims (${material.slice(0, 4).join(', ')}) map to no family in the evidence file` }
}

const rank = (a, b) =>
  Number(b.primaryHit) - Number(a.primaryHit) || Number(b.verified) - Number(a.verified) ||
  b.matchCount - a.matchCount || String(a.id).localeCompare(String(b.id))

// --------------------------------------------------------------- the run
const rows = []
for (const item of items) {
  const r = m.resolveOntology(item.line)
  const family = r?.family ?? null
  const searchTerms = (r?.search_terms ?? []).slice(0, 8).map(norm).filter((t) => t.length >= 3)

  // live_text — the path a buyer gets today
  const textHits = []
  if (searchTerms.length) {
    for (const [id, hay] of haystack) {
      let n = 0
      for (const t of searchTerms) if (hay.includes(t)) n++
      if (n) { const s = suppliers.get(id); textHits.push({ ...s, matchCount: n, primaryHit: false }) }
    }
  }
  // specialty — the path the intent-supplier map would use
  const specHits = []
  const evidence = family ? FAMILY_EVIDENCE[family] : null
  if (evidence) {
    const seen = new Set()
    for (const sid of evidence) {
      for (const supId of bySpecialty.get(sid) ?? []) {
        if (seen.has(supId)) continue
        seen.add(supId)
        const s = suppliers.get(supId)
        const own = s.specialties.filter((x) => evidence.includes(x.id))
        specHits.push({ ...s, matchCount: own.length, primaryHit: own.some((x) => x.primary) })
      }
    }
  }
  textHits.sort(rank); specHits.sort(rank)

  const zeroReason = (hits, path) => {
    if (hits.length) return null
    if (!family) return 'ZERO_BECAUSE_UNRESOLVED'
    if (path === 'live_text' && specHits.length) return 'ZERO_BECAUSE_MAPPING_BROKEN'
    if (path === 'specialty' && !evidence) return 'ZERO_BECAUSE_MAPPING_BROKEN'
    return 'ZERO_BECAUSE_NO_CONFIRMED_SUPPLIER'
  }
  const scoreTop = (hits) => {
    const top = hits.slice(0, TOP_N)
    const judged = top.map((s) => ({ id: s.id, name: s.name.slice(0, 46), evidence: [...new Set([...s.specialties.map((x) => x.id), ...s.tags])].join(','), ...judge(s, family) }))
    return {
      positions: judged.length,
      appropriate: judged.filter((j) => j.verdict === 'APPROPRIATE').length,
      wrong_material: judged.filter((j) => j.verdict === 'WRONG_MATERIAL').length,
      unsure: judged.filter((j) => j.verdict === 'UNSURE').length,
      judged,
    }
  }

  rows.push({
    id: item.id, component: item.component, line: item.line,
    resolution: { family, intent: r?.intent ?? null, sector: r?.sector ?? null, level: r?.level_code ?? null, poolable: r?.poolable ?? false },
    expect: item.expect ? { expect_family: item.expect.expect_family ?? null, must_not_family: item.expect.must_not_family ?? null, must_not_intent: item.expect.must_not_intent ?? null, broke_in: item.expect.broke_in ?? null, fixed_in: item.expect.fixed_in ?? null, open: item.expect.open === true } : null,
    live_text: { count: textHits.length, zero_reason: zeroReason(textHits, 'live_text'), ...scoreTop(textHits) },
    specialty: { count: specHits.length, zero_reason: zeroReason(specHits, 'specialty'), ...scoreTop(specHits) },
  })
}
await server.close()

// --------------------------------------------------------------- aggregation
const median = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const i = s.length >> 1; return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2 }
const bucket = (n) => n === 0 ? '0' : n <= 2 ? '1-2' : n <= 5 ? '3-5' : n <= 20 ? '6-20' : n <= 100 ? '21-100' : '>100'

const summarise = (subset, path) => {
  const counts = subset.map((r) => r[path].count)
  const dist = {}
  for (const c of counts) dist[bucket(c)] = (dist[bucket(c)] || 0) + 1
  const zeros = {}
  for (const r of subset) if (r[path].zero_reason) zeros[r[path].zero_reason] = (zeros[r[path].zero_reason] || 0) + 1
  return {
    items: subset.length,
    returned_suppliers_at_all: subset.filter((r) => r[path].count > 0).length,
    suppliers_per_item: { median: median(counts), mean: Number((counts.reduce((a, b) => a + b, 0) / (counts.length || 1)).toFixed(1)), distribution: dist },
    /*
     * Precision is only meaningful where retrieval and judgement use INDEPENDENT
     * evidence. `live_text` retrieves on the resolver's Arabic product terms and
     * is judged on the supplier's recorded specialties and tags — independent, so
     * the number means something. `specialty` retrieves BY those same tags, so its
     * precision would be 100% by construction. Reporting it would be circular, so
     * it is refused rather than printed.
     */
    precision_at_5: path === 'specialty' ? {
      refused: 'CIRCULAR — this path retrieves on the same evidence Precision@5 judges. Use live_text for precision; this path measures availability only.',
    } : {
      positions: subset.reduce((a, r) => a + r[path].positions, 0),
      appropriate: subset.reduce((a, r) => a + r[path].appropriate, 0),
      wrong_material: subset.reduce((a, r) => a + r[path].wrong_material, 0),
      unsure: subset.reduce((a, r) => a + r[path].unsure, 0),
    },
    wrong_material_count: path === 'specialty' ? null : subset.reduce((a, r) => a + r[path].wrong_material, 0),
    items_with_any_wrong_material: path === 'specialty' ? null : subset.filter((r) => r[path].wrong_material > 0).length,
    resolved_to_a_family: subset.filter((r) => r.resolution.family).length,
    zero_count: subset.filter((r) => r[path].count === 0).length,
    zero_reasons: zeros,
  }
}

const components = ['booklet_68', 'error_corpus', 'fresh_heldout']
const report = {
  instrument: 'gold_set',
  run_at: new Date().toISOString(),
  fingerprint,
  metrics_definition: 'fixtures/gold/METRICS.md (fixed 2026-09-17, before measurement)',
  composition: {
    booklet_68: items.filter((i) => i.component === 'booklet_68').length,
    rfq_60: 0,
    rfq_60_status: 'ABSENT — no 60-line real RFQ exists in either repository; production holds 1 RFQ with 2 lines. Slot reserved.',
    error_corpus: items.filter((i) => i.component === 'error_corpus').length,
    fresh_heldout: heldoutCount,
    total: items.length,
  },
  overall: { live_text: summarise(rows, 'live_text'), specialty: summarise(rows, 'specialty') },
  by_component: Object.fromEntries(components.map((c) => {
    const s = rows.filter((r) => r.component === c)
    return [c, s.length ? { live_text: summarise(s, 'live_text'), specialty: summarise(s, 'specialty') } : null]
  })),
}

// Error corpus is pass/fail per named generation, not a percentage.
report.error_corpus_adjudication = rows.filter((r) => r.component === 'error_corpus').map((r) => {
  const e = r.expect
  const wrongFamily = e.must_not_family && r.resolution.family === e.must_not_family
  const wrongIntent = e.must_not_intent && r.resolution.intent === e.must_not_intent
  const gotExpected = e.expect_family ? r.resolution.family === e.expect_family : null
  return {
    id: r.id, line: r.line, broke_in: e.broke_in, fixed_in: e.fixed_in, still_open: e.open,
    resolved_to: `${r.resolution.family ?? 'unresolved'}/${r.resolution.intent ?? '-'} (${r.resolution.level})`,
    regressed: Boolean(wrongFamily || wrongIntent),
    reaches_expected_family: gotExpected,
    verdict: (wrongFamily || wrongIntent) ? 'REGRESSED — went where it must not' : gotExpected === false ? 'NOT WRONG, BUT NOT RIGHT' : gotExpected ? 'HOLDS' : 'n/a',
  }
})
report.error_corpus_regressions = report.error_corpus_adjudication.filter((a) => a.regressed).length

/*
 * THE SEAL HAS TO HOLD IN THE OUTPUT TOO.
 *
 * The per-item rows carry the line text, so writing them into the repository
 * would publish the held-out sample and burn it on the first run — the exact
 * accidental compromise the design is meant to prevent. Held-out rows are
 * therefore redacted to their HMAC in the repo copy, and the unredacted rows go
 * to the vault, mode 600, beside the sample itself.
 */
const hmacKeyPath = join(homedir(), '.farq-gold-heldout', 'manifest-hmac.key')
const hmacKey = existsSync(hmacKeyPath) ? readFileSync(hmacKeyPath, 'utf8').trim() : null
const redact = (r) => r.component !== 'fresh_heldout' ? r : {
  ...r,
  line: hmacKey ? `HMAC:${createHmac('sha256', hmacKey).update(r.line).digest('hex').slice(0, 32)}` : 'REDACTED',
  line_redacted: true,
}
writeFileSync('fixtures/gold/baseline-cpo-v10.report.json', JSON.stringify(report, null, 1))
writeFileSync('fixtures/gold/baseline-cpo-v10.rows.jsonl', rows.map((r) => JSON.stringify(redact(r))).join('\n') + '\n')
const vaultRows = join(homedir(), '.farq-gold-heldout', 'baseline-cpo-v10.rows.unredacted.jsonl')
writeFileSync(vaultRows, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', { mode: 0o600 })

const pct = (n, d) => d ? `${((n / d) * 100).toFixed(1)}%` : '—'
for (const path of ['live_text', 'specialty']) {
  const o = report.overall[path]
  console.log(`\n=== ${path.toUpperCase()} — ${o.items} items ===`)
  console.log(`  returned suppliers at all : ${o.returned_suppliers_at_all}  (${pct(o.returned_suppliers_at_all, o.items)})`)
  console.log(`  suppliers per item        : median ${o.suppliers_per_item.median}, mean ${o.suppliers_per_item.mean}`)
  console.log(`  distribution             : ${JSON.stringify(o.suppliers_per_item.distribution)}`)
  const p = o.precision_at_5
  if (p.refused) console.log(`  precision@5              : REFUSED (circular on this path)`)
  else {
    console.log(`  precision@5              : ${p.appropriate} appropriate / ${p.wrong_material} wrong-material / ${p.unsure} unsure  (of ${p.positions} filled positions)`)
    console.log(`  items with any wrong mat.: ${o.items_with_any_wrong_material}`)
  }
  console.log(`  resolved to a family     : ${o.resolved_to_a_family} / ${o.items}`)
  console.log(`  zeros                    : ${o.zero_count}  ${JSON.stringify(o.zero_reasons)}`)
}
for (const c of components) {
  const b = report.by_component[c]
  if (!b) continue
  const l = b.live_text, sp = b.specialty
  console.log(`\n--- component ${c} (${l.items} items) ---`)
  console.log(`  resolved to a family      : ${l.resolved_to_a_family} / ${l.items}  (${pct(l.resolved_to_a_family, l.items)})`)
  console.log(`  live_text  returned any   : ${l.returned_suppliers_at_all}  median ${l.suppliers_per_item.median}`)
  console.log(`  live_text  precision@5    : ${l.precision_at_5.appropriate} appropriate / ${l.precision_at_5.wrong_material} wrong / ${l.precision_at_5.unsure} unsure  of ${l.precision_at_5.positions}`)
  console.log(`  live_text  zeros          : ${l.zero_count} ${JSON.stringify(l.zero_reasons)}`)
  console.log(`  specialty  returned any   : ${sp.returned_suppliers_at_all}  median ${sp.suppliers_per_item.median}`)
  console.log(`  specialty  zeros          : ${sp.zero_count} ${JSON.stringify(sp.zero_reasons)}`)
}
console.log(`\nerror corpus: ${report.error_corpus_regressions} regressions of ${report.error_corpus_adjudication.length}`)
for (const a of report.error_corpus_adjudication) console.log(`  ${a.verdict.padEnd(34)} ${a.id} «${a.line}» -> ${a.resolved_to}`)
console.log(`\nwritten: fixtures/gold/baseline-cpo-v10.report.json (+ .rows.jsonl, held-out lines redacted to HMAC)`)
console.log(`unredacted rows: ${vaultRows} (mode 600, outside the repo)`)
