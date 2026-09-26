/**
 * Grade the local read + naming path against a stress pack's ground truth.
 *
 *   node scripts/stress-pack-eval.mjs <pack dir> [--pdf other.pdf] [--json out.json]
 *
 * The pack holds `boq_1650_text.pdf` and `expected_ground_truth.json`. Only
 * what the browser does WITHOUT the API is graded here: the column read, the
 * quantity/unit per row, the description-column and gap guards, the ontology
 * naming, context inheritance and the send guard. Supplier ranking needs the
 * register and the OCR page needs the API, so neither is graded.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const args = process.argv.slice(2)
const flagValues = new Set(['--json', '--pdf'].flatMap((f) => (args.includes(f) ? [args[args.indexOf(f) + 1]] : [])))
const dir = args.find((a) => !a.startsWith('--') && !flagValues.has(a))
if (!dir) {
  console.error('usage: node scripts/stress-pack-eval.mjs <pack dir> [--json out.json]')
  process.exit(2)
}
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null
const pdfPath = args.includes('--pdf') ? resolve(args[args.indexOf('--pdf') + 1]) : resolve(dir, 'boq_1650_text.pdf')
const truth = JSON.parse(readFileSync(resolve(dir, 'expected_ground_truth.json'), 'utf8'))

const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true }, appType: 'custom' })

const arabicOnly = (s) =>
  String(s || '')
    .normalize('NFKC')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[^ء-ي]/g, '')
const reversed = (s) => [...s].reverse().join('')

try {
  const table = await server.ssrLoadModule('/src/lib/boqPdfTable.ts')
  const parse = await server.ssrLoadModule('/src/lib/parseBoq.ts')
  const cpo = await server.ssrLoadModule('/src/lib/procurementOntology.ts')
  const lineRes = await server.ssrLoadModule('/src/lib/lineResolution.ts')
  const guards = await server.ssrLoadModule('/src/lib/sendGuards.ts')

  // ---- read the PDF exactly as the layouts test does -----------------------
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdfPath)), useSystemFonts: true, isEvalSupported: false, verbosity: 0 }).promise
  const pages = []
  const parts = []
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent()
    const glyphs = content.items
      .filter((i) => i && typeof i.str === 'string' && i.str)
      .map((i) => ({ str: i.str, x: Number(i.transform?.[4] ?? 0), y: Number(i.transform?.[5] ?? 0), width: Number(i.width ?? 0) }))
    pages.push({ page: p, glyphs })
    for (const line of table.pageTextRows(glyphs)) parts.push(line)
  }
  const t0 = performance.now()
  const tbl = table.extractBoqTable(pages)
  const read = parse.resolveParsedLines({ text: parts.join('\n'), table: tbl.rows.length ? tbl : null, fileName: 'boq_1650_text.pdf' })
  const lines = parse.sanitizeBoqLines(read.lines)
  const readMs = Math.round(performance.now() - t0)

  // Printed numbers meet the ground truth by number. Rows the booklet never
  // numbered (its bare layout) come back counted above every printed number,
  // in reading order, so they meet the unnumbered ground-truth items in order.
  const printedIds = new Set(truth.items.map((i) => i.sequence).filter((n) => n !== null))
  const printedMax = Math.max(...printedIds)
  const gt = new Map()
  const byId = new Map()
  const unnumberedTruth = truth.items.filter((i) => i.layout === 'C')
  const syntheticLines = lines.filter((l) => l.id > printedMax)
  for (const t of truth.items) if (t.sequence !== null && t.layout !== 'C') gt.set(t.sequence, t)
  for (const l of lines) if (l.id <= printedMax) byId.set(l.id, l)
  // Unnumbered rows meet their truth by what they say, not by position: a row
  // the reader dropped (no unit, «%») would otherwise shift every row after it.
  const sig = (name, qty) => `${arabicOnly(name)}|${String(name).replace(/[^0-9a-z]/gi, '').toLowerCase()}|${qty}`
  const pool = new Map()
  for (const l of syntheticLines) {
    const k = sig(l.name, guards.readQty(String(l.qty ?? '')))
    if (!pool.has(k)) pool.set(k, [])
    pool.get(k).push(l)
  }
  unnumberedTruth.forEach((t, i) => {
    const key = `C${i}`
    gt.set(key, t)
    t._key = key
    const want = typeof t.expected_quantity === 'number' ? t.expected_quantity : null
    const k = sig(t.raw_description, want)
    const hit = pool.get(k)?.shift()
    if (hit) byId.set(key, hit)
  })
  for (const t of truth.items) if (t._key === undefined) t._key = t.sequence
  const gtLine = (t) => (t ? byId.get(t._key) : undefined)

  // ---- 1. read: rows, quantity, unit ------------------------------------
  const readReport = {
    source: read.source,
    table_rows: tbl.rows.length,
    table_issues: tbl.issues?.length ?? 0,
    issue_kinds: {},
    lines_read: lines.length,
    lines_expected: truth.expected_total_items,
    ids_matched: 0,
    qty_correct: 0,
    unit_correct: 0,
    name_arabic_forward: 0,
    name_arabic_reversed: 0,
    name_arabic_missing: 0,
    description_column_suspect: read.descriptionColumnSuspect,
    coded_items_suspect: read.codedItemsSuspect,
    read_ms: readMs,
  }
  for (const issue of tbl.issues || []) readReport.issue_kinds[issue.kind] = (readReport.issue_kinds[issue.kind] || 0) + 1

  const qtyOf = (l) => guards.readQty(String(l.qty ?? ''))
  const norm = (u) => String(u || '').replace(/\s+/g, '').replace('2', '²').replace('3', '³')
  const wrongQty = []
  const wrongUnit = []
  for (const [seq, t] of gt) {
    const l = byId.get(seq)
    if (!l) continue
    readReport.ids_matched++
    const want = t.expected_quantity
    const got = qtyOf(l)
    const qtyOk = typeof want === 'number' ? got !== null && Math.abs(got - want) < 1e-6 : got === null
    if (qtyOk) readReport.qty_correct++
    else if (wrongQty.length < 15) wrongQty.push({ seq, want, got: l.qty, trap: t.trap_id })
    const unitOk = norm(l.unit) === norm(t.expected_unit)
    if (unitOk) readReport.unit_correct++
    else if (wrongUnit.length < 15) wrongUnit.push({ seq, want: t.expected_unit, got: l.unit, trap: t.trap_id })
    const wantAr = arabicOnly(t.raw_description)
    const gotAr = arabicOnly(l.name)
    if (!wantAr) continue
    if (gotAr.includes(wantAr) || wantAr.includes(gotAr) && gotAr.length > 3) readReport.name_arabic_forward++
    else if (gotAr.includes(reversed(wantAr))) readReport.name_arabic_reversed++
    else readReport.name_arabic_missing++
  }
  readReport.wrong_qty_sample = wrongQty
  readReport.wrong_unit_sample = wrongUnit

  // ---- 2. traps in the read ---------------------------------------------
  const trap = (id) => truth.items.find((i) => i.trap_id === id)
  const line = (id) => gtLine(trap(id))
  const readTraps = {
    qty_385_not_2085: qtyOf(line('T_QUANTITY_CODE_385_NOT_2085') || { qty: '' }),
    wrapped_1: line('T_WRAPPED_3_LINES_1') ? { qty: line('T_WRAPPED_3_LINES_1').qty, name: line('T_WRAPPED_3_LINES_1').name.slice(0, 60) } : null,
    wrapped_2: line('T_WRAPPED_3_LINES_2') ? { qty: line('T_WRAPPED_3_LINES_2').qty, name: line('T_WRAPPED_3_LINES_2').name.slice(0, 60) } : null,
    amp_43: line('T_AMP_ITEM43') ? { id: line('T_AMP_ITEM43').id, qty: line('T_AMP_ITEM43').qty } : null,
    amp_44: line('T_AMP_ITEM44') ? { id: line('T_AMP_ITEM44').id, qty: line('T_AMP_ITEM44').qty } : null,
    group_legitimate_kept: Boolean(line('T_GROUP_LEGITIMATE')),
    legit_duplicate_both_kept: Boolean(line('T_LEGIT_DUPLICATE_A') && line('T_LEGIT_DUPLICATE_B')),
    sequence_gap_ids_present: truth.expected_sequence_gap.map((n) => Boolean(byId.get(n))),
    synthetic_rows: syntheticLines.length,
    unnumbered_truth: unnumberedTruth.length,
    sequence_gap_reported: (tbl.issues || []).filter((i) => /gap|missing|number/i.test(i.kind)).length,
    unicode_rtl: line('T_UNICODE_RTL') ? line('T_UNICODE_RTL').name : null,
    arabic_indic_3_5: line('T_QTY_ARABIC_3_500')?.qty ?? null,
    thousands_1250_5: line('T_QTY_1250_5')?.qty ?? null,
    arabic_decimal_12_75: line('T_QTY_AR_DECIMAL')?.qty ?? null,
    empty_unit: line('T_EMPTY_UNIT')?.unit ?? null,
  }

  // ---- 3. send guard ------------------------------------------------------
  const sendGuard = {}
  for (const id of truth.expected_send_guard_blocks) {
    const t = truth.items.find((i) => i.item_id === id)
    const l = gtLine(t)
    sendGuard[id] = { read: Boolean(l), qty_raw: l?.qty ?? null, blocked: l ? guards.readQty(String(l.qty ?? '')) === null : null }
  }

  // ---- 4. naming ----------------------------------------------------------
  // The pack's family vocabulary is its own; grade at the level the pack can
  // check: the twelve pairs must split, the forbidden trade must not win, weak
  // words must not name confidently, work lines must not be supply, and the
  // Level C lines must reach the model lane.
  const inputs = lines.map((l) => ({ name: l.name, spec: l.spec }))
  const t1 = performance.now()
  const resolutions = lineRes.resolveLinesSync(inputs)
  const namingMs = Math.round(performance.now() - t1)
  const resOfLine = new Map(lines.map((l, i) => [l, resolutions[i]]))
  const resOf = (t) => resOfLine.get(gtLine(t))
  const levels = { A: 0, B: 0, C: 0, not_supply: 0 }
  for (const r of resolutions) {
    if (!r) { levels.C++; continue }
    if (r.not_supply) levels.not_supply++
    const code = r.level === 'specific_intent' ? 'A' : r.level === 'local_resolved' ? 'B' : 'C'
    levels[code]++
  }
  const describe = (r) => (r ? { level: r.level, sector: r.sector, family: r.family, intent: r.canonical_intent_id, not_supply: r.not_supply, inherited: r.inherited_from_line_above } : null)

  const pairs = []
  for (let n = 1; n <= 12; n++) {
    const id = `T_CLASS_PAIR_${String(n).padStart(2, '0')}`
    const two = truth.items.filter((i) => i.trap_id === id)
    const rs = two.map((t) => describe(resOf(t)))
    const fams = rs.map((r) => r?.family || r?.sector || null)
    pairs.push({ pair: id, lines: two.map((t) => t.raw_description), got: rs.map((r) => (r ? `${r.sector || '-'}/${r.family || '-'}/${r.intent || '-'}` : 'unread')), split: Boolean(fams[0] && fams[1] && fams[0] !== fams[1]) })
  }
  const weak = truth.items.filter((i) => i.trap_id === 'T_WEAK_SIGNAL').map((t) => ({ line: t.raw_description, got: describe(resOf(t)) }))
  const work = truth.items.filter((i) => i.trap_id === 'T_WORK_NOT_SUPPLY').map((t) => ({ line: t.raw_description, not_supply: Boolean(resOf(t)?.not_supply), work_only: Boolean(gtLine(t)?.workOnly) }))
  const levelC = truth.items.filter((i) => /^T_LEVEL_C_/.test(i.trap_id || '')).map((t) => ({ line: t.raw_description, got: describe(resOf(t)), ai_eligible: resOf(t)?.unresolved_bucket === 'ai_eligible' }))
  const context = ['T_CONTEXT_BASE_NEAR', 'T_CONTEXT_INHERIT_WITHIN_WINDOW', 'T_CONTEXT_BASE_FAR', 'T_CONTEXT_OUTSIDE_WINDOW'].map((id) => ({ trap: id, line: trap(id)?.raw_description, got: describe(resOf(trap(id))) }))
  const consistency = truth.items.filter((i) => i.trap_id === 'T_CONSISTENCY_BUTTERFLY_VALVE').map((t) => ({ line: t.raw_description, got: describe(resOf(t)) }))
  const attributes = truth.items.filter((i) => i.trap_id === 'T_ATTRIBUTE_SENSITIVE').map((t) => {
    const r = resOf(t)
    return { line: t.raw_description, got: describe(r), pool_facets: r?.pool_facets ?? r?.debug?.pool_facets ?? null }
  })
  const anomaly = truth.items.filter((i) => i.trap_id === 'T_DESCRIPTION_COLUMN_ANOMALY').map((t) => gtLine(t)?.name ?? null)

  const report = { pack: truth.pack_version, read: readReport, read_traps: readTraps, send_guard: sendGuard, naming: { levels, naming_ms: namingMs, pairs, weak, work, level_c: levelC, context, consistency, attributes, anomaly_names: anomaly } }
  console.log(JSON.stringify(report, null, 1))
  if (jsonOut) writeFileSync(resolve(jsonOut), JSON.stringify(report, null, 2))
} finally {
  await server.close()
}
