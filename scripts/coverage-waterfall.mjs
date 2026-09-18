/**
 * COVERAGE WATERFALL — what each fix recovers, and what only a database can say.
 *
 * Attribution across the five stages of this repair, over the three real
 * booklets. Farq's matching is stubbed, so read the two kinds of number apart:
 *
 *   STRUCTURAL   determined by the pipeline alone, true whatever the supplier
 *                data holds. «How many lines reach the engine» and «does the
 *                engine's answer survive the trip back» are structural.
 *   DATA-BOUND   determined by what is in the supplier corpus. «How many lines
 *                have a real supplier» is data-bound and CANNOT be measured
 *                here. Those cells read DB-REQUIRED, never a guess.
 *
 * The stub answers every line identically, on purpose: it isolates the
 * structural loss. A stage that drops an answer drops it for every line, so the
 * count it costs is exact.
 *
 * Usage:  node scripts/coverage-waterfall.mjs [--json]
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { createServer } from 'vite'

const FIXTURES = [
  'fixtures/boq/warehouse-ops-02.flat.txt',
  'fixtures/boq/site-safety-02.flat.txt',
  'fixtures/boq/datacenter-cyber-01.flat.txt',
].filter((p) => existsSync(resolve(p)))

const jsonOnly = process.argv.includes('--json')

/* ------------------------------------------------------------------ *
 * The stub backend.
 *
 * NOTE ON A CORRECTED BASELINE. An earlier version of this script modelled a
 * fourth stage, «the evidence-grade contract», on the belief that the BOQ
 * candidate filter refused every supplier Postgres returned. It does not:
 * `explainSupplierMatch` stamps `evidence_grade` before `matchBoqCatalog` sees a
 * supplier, so that predicate always worked. That stage is gone and the baseline
 * below assumes the engine could answer all along. What the baseline could not do
 * is ASK for most of the booklet, or KEEP the answers it got.
 * ------------------------------------------------------------------ */

/** One answer shape for every line, so a dropped answer costs an exact count. */
function backendAnswer(key) {
  const itemId = 'stub-material'
  const confirmed = [0, 1].map((i) => ({
    id: `${key}-c${i}`, name_ar: `مورد ${i}`, grade: 'DIRECT',
    channel: 'بريد', origin: 'material', rfq_eligible: true,
  }))
  const potential = [0, 1, 2].map((i) => ({
    id: `${key}-p${i}`, name_ar: `محتمل ${i}`, grade: 'REVIEW',
    channel: 'واتساب', origin: 'family', rfq_eligible: false,
  }))
  return {
    line_key: key, key, kind: 'NAME',
    farq_spec_id: itemId,
    suppliers: confirmed,
    potential_suppliers: potential,
    auto_selected_supplier_ids: confirmed.map((s) => s.id),
    resolution: {
      source: 'MATERIAL', material: itemId, material_name_ar: 'مادة',
      family: 'stub-family', intent: 'stub-intent',
    },
    coverage: {
      target: 5, confirmed: confirmed.length, potential: potential.length,
      trade_contractors: 0,
      total: confirmed.length + potential.length,
      auto_selected: confirmed.length,
      under_target: confirmed.length + potential.length < 5,
    },
    gap_reason: confirmed.length + potential.length >= 5 ? null : 'BELOW_TARGET',
  }
}

/* ------------------------------------------------------------------ *
 * The stages.
 * ------------------------------------------------------------------ */

const STAGES = [
  {
    id: 'baseline',
    label: 'BASELINE (as shipped)',
    lineCap: 80,
    keepSuggestions: false,
    note: '80-line cap; lines 81+ never asked. Suggestions parsed then discarded.',
  },
  {
    id: 'batching',
    label: '+ full-line batching',
    lineCap: Infinity,
    keepSuggestions: false,
    note: 'every supplyable line asks, in batches of the server limit',
  },
  {
    id: 'suggestions',
    label: '+ candidate/suggestion integration',
    lineCap: Infinity,
    keepSuggestions: true,
    note: 'map/family answers reach the screen instead of being counted and dropped',
  },
]

const server = await createServer({
  configFile: './vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
})

const report = { stages: [], notes: {} }

try {
  const parse = await server.ssrLoadModule('/src/lib/parseBoq.ts')

  // Extract once: extraction is identical at every stage.
  const booklets = FIXTURES.map((fixture) => {
    const text = readFileSync(resolve(fixture), 'utf8')
    const { lines } = parse.resolveParsedLines({
      text, fileName: basename(fixture).replace(/\.flat\.txt$/, '.pdf'),
    })
    return { fixture, supplyable: parse.sanitizeBoqLines(lines) }
  })
  const totalSupplyable = booklets.reduce((n, b) => n + b.supplyable.length, 0)

  for (const stage of STAGES) {
    let sent = 0
    let withConfirmed = 0
    let withAnySupplier = 0
    let zero = 0
    let atTarget = 0

    for (const booklet of booklets) {
      // The line cap is applied where the shipped code applied it: to the
      // whole booklet, before any request is made.
      const asking = Number.isFinite(stage.lineCap)
        ? booklet.supplyable.slice(0, stage.lineCap)
        : booklet.supplyable
      sent += asking.length
      const askingKeys = new Set(asking.map((l) => `line-${l.id}`))

      for (const line of booklet.supplyable) {
        const key = `line-${line.id}`
        if (!askingKeys.has(key)) { zero += 1; continue }
        const answer = backendAnswer(key)
        const confirmed = answer.suppliers.length
        const potential = stage.keepSuggestions ? answer.potential_suppliers.length : 0
        const total = confirmed + potential
        if (confirmed > 0) withConfirmed += 1
        if (total > 0) withAnySupplier += 1; else zero += 1
        if (total >= 5) atTarget += 1
      }
    }

    report.stages.push({
      id: stage.id, label: stage.label, note: stage.note,
      supplyable: totalSupplyable,
      lines_reaching_backend: sent,
      lines_never_sent: totalSupplyable - sent,
      lines_with_confirmed_supplier: withConfirmed,
      lines_with_any_supplier: withAnySupplier,
      lines_with_zero: zero,
      lines_at_or_above_target: atTarget,
    })
  }

  report.notes = {
    structural:
      'lines_reaching_backend and lines_never_sent are pipeline facts: true whatever the supplier corpus holds.',
    data_bound:
      'lines_with_confirmed_supplier here reflects a stub that answers every line. Against the real corpus this number is DB-REQUIRED — the stub proves the answer SURVIVES the pipeline, not that an answer exists.',
    true_data_gap:
      'No cell in this table may be read as a true data gap. A data gap needs: extracted + supplyable + backend matching completed + resolution completed + full server-side retrieval + no cap + no stale-map failure + zero qualified suppliers. Only a run against the construction database can establish that.',
  }

  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log('COVERAGE WATERFALL — three real booklets, %d supplyable lines\n', totalSupplyable)
    const pad = (s, n) => String(s).padStart(n)
    console.log('stage                                reach   never   confirmed   any   zero  >=5')
    console.log('-'.repeat(82))
    for (const s of report.stages) {
      console.log(
        `${s.label.padEnd(36)}${pad(s.lines_reaching_backend, 5)}${pad(s.lines_never_sent, 8)}` +
        `${pad(s.lines_with_confirmed_supplier, 12)}${pad(s.lines_with_any_supplier, 6)}` +
        `${pad(s.lines_with_zero, 7)}${pad(s.lines_at_or_above_target, 5)}`,
      )
      console.log(`  ${s.note}`)
    }
    console.log('\nATTRIBUTION')
    for (let i = 1; i < report.stages.length; i++) {
      const prev = report.stages[i - 1]
      const cur = report.stages[i]
      const gainReach = cur.lines_reaching_backend - prev.lines_reaching_backend
      const gainAny = cur.lines_with_any_supplier - prev.lines_with_any_supplier
      console.log(
        `  ${cur.label.padEnd(36)} reach ${gainReach >= 0 ? '+' : ''}${gainReach}   answered ${gainAny >= 0 ? '+' : ''}${gainAny}`,
      )
    }
    // The suggestions stage adds nothing above, because the stub gives every
    // line a material match — there is nothing left for a suggestion to answer.
    // Its real effect is on lines whose ONLY answer is a suggestion, and how many
    // of those a booklet has is a property of the supplier data, not the code.
    // Stated as a ratio, which IS structural, rather than as an invented count.
    const suggestionOnly = report.stages.at(-1)
    console.log('\nSUGGESTION STAGE — stated as a ratio, because the count is DB-bound')
    console.log('  A line whose only answer is a map or family suggestion showed:')
    console.log('    before   0 suppliers  (parsed into candidate_count, then discarded)')
    console.log('    after    every supplier Farq returned for it')
    console.log('  So the gain is 100% of such lines, and HOW MANY there are is DB-REQUIRED.')
    console.log(`  Target reached on ${suggestionOnly.lines_at_or_above_target}/${suggestionOnly.supplyable} lines here only because the stub answers every line with 2+3.`)

    console.log('\nHOW TO READ THIS')
    console.log('  STRUCTURAL  :', report.notes.structural)
    console.log('  DATA-BOUND  :', report.notes.data_bound)
    console.log('  TRUE GAPS   :', report.notes.true_data_gap)
  }
} finally {
  await server.close()
}
