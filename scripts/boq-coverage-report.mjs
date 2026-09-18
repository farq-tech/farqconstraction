/**
 * BOQ coverage report — the invariant, measured on the real booklets.
 *
 * The question this answers is not «how good is the matching» but «did every
 * supplyable line the parser found actually reach Farq's supplier matching».
 * Before batching, the answer on these three fixtures was 240 of 462: the upload
 * sent the first 80 lines of each booklet and keyword-matched the rest in the
 * browser.
 *
 * Farq's matching is stubbed here — this measures the PIPELINE, on a machine with
 * no construction database. What it proves is the part that was broken in the
 * client: rows_sent_to_backend === supplyable_rows, and rows_skipped_by_cap === 0.
 *
 * Usage:
 *   node scripts/boq-coverage-report.mjs
 *   node scripts/boq-coverage-report.mjs --json
 *   node scripts/boq-coverage-report.mjs fixtures/boq/warehouse-ops-02.flat.txt
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, basename } from 'node:path'
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

/** Farq's answer, stubbed: two confirmed and three family suppliers a line. */
function stubRows(lines) {
  return lines.map((line) => ({
    line_key: line.line_key,
    key: line.line_key,
    kind: 'NAME',
    farq_spec_id: 'stub-material',
    suppliers: [0, 1].map((i) => ({
      id: `${line.line_key}-c${i}`, name_ar: `مورد ${i}`, grade: 'DIRECT',
      channel: 'بريد', origin: 'material', rfq_eligible: true,
    })),
    potential_suppliers: [0, 1, 2].map((i) => ({
      id: `${line.line_key}-p${i}`, name_ar: `محتمل ${i}`, grade: 'REVIEW',
      channel: 'واتساب', origin: 'family', rfq_eligible: false,
    })),
    auto_selected_supplier_ids: [`${line.line_key}-c0`, `${line.line_key}-c1`],
    resolution: { source: 'MATERIAL', material: 'stub-material', family: 'stub-family', intent: 'stub-intent' },
    coverage: { target: 5, confirmed: 2, potential: 3, total: 5, auto_selected: 2, under_target: false },
    gap_reason: null,
  }))
}

const report = { fixtures: [], totals: null, invariants: null }

try {
  const parse = await server.ssrLoadModule('/src/lib/parseBoq.ts')

  let sentKeys = []
  let batchSizes = []
  let directoryFetches = 0

  // Stubbed at the NETWORK boundary, not the module boundary: this way the real
  // client mapping (grades, potential suppliers, auto-selected ids) is exercised
  // too, and ESM's read-only exports are not fought with.
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url)
    if (href.includes('/api/construction/boq/match')) {
      const body = JSON.parse(String(init.body || '{}'))
      const rows = body.rows || []
      batchSizes.push(rows.length)
      sentKeys.push(...rows.map((r) => r.key))
      return new Response(JSON.stringify({ ok: true, data: { rows: stubRows(rows.map((r) => ({ line_key: r.key }))) } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (href.includes('/api/construction/catalog')) {
      directoryFetches += 1
      return new Response(JSON.stringify({ ok: true, data: { suppliers: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ ok: true, data: {} }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  const grand = {
    raw_rows: 0, supplyable_rows: 0, rows_shown: 0, rows_sent: 0, rows_skipped_by_cap: 0,
    at_or_above_target: 0, one_to_four: 0, zero_supplier: 0,
    confirmed_material: 0, family_fallback: 0, degraded: 0, match_failed: 0,
    non_supplyable: 0, batches: 0, directory_fetches: 0,
  }

  for (const fixture of fixtures) {
    sentKeys = []
    batchSizes = []
    directoryFetches = 0
    const text = readFileSync(resolve(fixture), 'utf8')
    const resolved = parse.resolveParsedLines({
      text,
      fileName: basename(fixture).replace(/\.flat\.txt$/, '.pdf'),
    })
    const raw = resolved.lines
    const supplyable = parse.sanitizeBoqLines(raw)
    const result = await parse.matchSuppliersForItems(supplyable)

    const state = (s) => result.items.filter((i) => i.state === s).length
    const row = {
      fixture,
      raw_rows: raw.length,
      supplyable_rows: supplyable.length,
      rows_shown: result.items.length,
      rows_sent: sentKeys.length,
      rows_skipped_by_cap: supplyable.length - sentKeys.length,
      batches: batchSizes.length,
      max_batch: batchSizes.length ? Math.max(...batchSizes) : 0,
      at_or_above_target: result.items.filter((i) => (i.coverage?.totalCount ?? 0) >= (i.coverage?.targetCount ?? 5)).length,
      one_to_four: result.items.filter((i) => {
        const n = i.coverage?.totalCount ?? 0
        return n >= 1 && n < (i.coverage?.targetCount ?? 5)
      }).length,
      zero_supplier: result.items.filter((i) => (i.coverage?.totalCount ?? 0) === 0).length,
      confirmed_material: result.items.filter((i) => i.coverage?.resolution === 'material').length,
      family_fallback: result.items.filter((i) => i.coverage?.resolution === 'family' || i.coverage?.resolution === 'intent_map').length,
      degraded: result.items.filter((i) => i.coverage?.degraded).length,
      match_failed: state('MATCH_FAILED'),
      non_supplyable: state('NON_SUPPLYABLE'),
      match_pending: state('MATCH_PENDING'),
      directory_fetches: directoryFetches,
      evidence_invented_by_ui: result.items
        .flatMap((i) => i.suppliers)
        .filter((s) => s.evidence !== 'مورد محتمل' && !s.grade).length,
    }
    report.fixtures.push(row)
    for (const key of Object.keys(grand)) grand[key] += row[key] ?? 0
  }

  report.totals = grand
  report.invariants = {
    'rows_sent === supplyable_rows': grand.rows_sent === grand.supplyable_rows,
    'rows_shown === supplyable_rows': grand.rows_shown === grand.supplyable_rows,
    'rows_skipped_by_cap === 0': grand.rows_skipped_by_cap === 0,
    'match_pending === 0 after completion': report.fixtures.every((f) => f.match_pending === 0),
    'evidence_invented_by_ui === 0': report.fixtures.every((f) => f.evidence_invented_by_ui === 0),
    'directory_fetches === 0 on healthy upload': grand.directory_fetches === 0,
  }

  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log('BOQ COVERAGE — pipeline invariants on the real booklets')
    console.log('(Farq matching stubbed: this measures the client pipeline, not match quality)\n')
    for (const f of report.fixtures) {
      console.log(basename(f.fixture))
      console.log(`  raw rows                ${f.raw_rows}`)
      console.log(`  supplyable rows         ${f.supplyable_rows}`)
      console.log(`  rows shown in UI        ${f.rows_shown}`)
      console.log(`  rows sent to backend    ${f.rows_sent}  in ${f.batches} batch(es), max ${f.max_batch}`)
      console.log(`  rows skipped by cap     ${f.rows_skipped_by_cap}   <- MUST be 0`)
      console.log(`  >= target suppliers     ${f.at_or_above_target}`)
      console.log(`  1..4 suppliers          ${f.one_to_four}`)
      console.log(`  0 suppliers             ${f.zero_supplier}`)
      console.log(`  match failed            ${f.match_failed}`)
      console.log(`  degraded (keyword)      ${f.degraded}`)
      console.log(`  directory downloads     ${f.directory_fetches}   <- MUST be 0 when healthy`)
      console.log(`  UI-invented evidence    ${f.evidence_invented_by_ui}   <- MUST be 0\n`)
    }
    console.log('TOTALS')
    console.log(`  supplyable rows         ${grand.supplyable_rows}`)
    console.log(`  rows sent to backend    ${grand.rows_sent}`)
    console.log(`  rows skipped by cap     ${grand.rows_skipped_by_cap}`)
    console.log(`  batches issued          ${grand.batches}\n`)
    console.log('INVARIANTS')
    let ok = true
    for (const [name, passed] of Object.entries(report.invariants)) {
      console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}`)
      if (!passed) ok = false
    }
    if (!ok) process.exitCode = 1
  }
} finally {
  await server.close()
}
