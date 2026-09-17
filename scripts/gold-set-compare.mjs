/**
 * The verdict tool. This is what will judge the retriever+verifier shadow run.
 *
 * The question, per fixtures/gold/METRICS.md §6:
 *   does the cascade raise coverage WITHOUT raising confident-wrong?
 *
 * A coverage gain paid for with even one new confident error is a FAILURE, not a
 * wash. There is no threshold below which a new confident error is tolerated,
 * because the failure being guarded against — a real supplier receiving a request
 * for a material it does not sell — is what produced the «غير متوفر» replies.
 *
 *   node scripts/gold-set-compare.mjs cpo-v10 cpo-v11
 */
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const [base, cand] = process.argv.slice(2)
if (!base || !cand) { console.error('usage: gold-set-compare.mjs <baseline-version> <candidate-version>'); process.exit(1) }

const rows = (v) => {
  const p = `fixtures/gold/baseline-${v}.rows.jsonl`
  if (!existsSync(p)) { console.error(`missing ${p}`); process.exit(1) }
  return new Map(readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return [r.id, r] }))
}
const A = rows(base), B = rows(cand)

// Held-out lines are readable only from the vault, and only by the measuring lane.
const vault = join(homedir(), '.farq-gold-heldout', 'heldout-2026-09-17.jsonl')
const heldLines = new Map()
if (existsSync(vault)) for (const l of readFileSync(vault, 'utf8').split('\n').filter(Boolean)) { const h = JSON.parse(l); heldLines.set(h.id, h.line) }
const text = (r) => r.line_redacted ? (heldLines.get(r.id) ?? r.line) : r.line

const moved = { coverage_gained: [], coverage_lost: [], new_confident_wrong: [], wrong_cleared: [], family_changed: [] }
for (const [id, a] of A) {
  const b = B.get(id); if (!b) continue
  const line = text(a)
  if (a.resolution.family !== b.resolution.family) moved.family_changed.push({ id, line, from: a.resolution.family, to: b.resolution.family })
  if (a.live_text.count === 0 && b.live_text.count > 0) moved.coverage_gained.push({ id, line, to: b.live_text.count })
  if (a.live_text.count > 0 && b.live_text.count === 0) moved.coverage_lost.push({ id, line, from: a.live_text.count, reason: b.live_text.zero_reason })
  const wa = a.live_text.wrong_material, wb = b.live_text.wrong_material
  if (wb > wa) moved.new_confident_wrong.push({ id, line, from: wa, to: wb, suppliers: b.live_text.judged.filter((j) => j.verdict === 'WRONG_MATERIAL').map((j) => `${j.name} [${j.evidence.slice(0, 40)}]`) })
  if (wb < wa) moved.wrong_cleared.push({ id, line, from: wa, to: wb })
}

const sum = (M, f) => [...M.values()].reduce((acc, r) => acc + f(r), 0)
const table = [
  ['items resolving to a family', [...A.values()].filter((r) => r.resolution.family).length, [...B.values()].filter((r) => r.resolution.family).length],
  ['items returning suppliers', [...A.values()].filter((r) => r.live_text.count > 0).length, [...B.values()].filter((r) => r.live_text.count > 0).length],
  ['appropriate in top-5', sum(A, (r) => r.live_text.appropriate), sum(B, (r) => r.live_text.appropriate)],
  ['WRONG-MATERIAL in top-5', sum(A, (r) => r.live_text.wrong_material), sum(B, (r) => r.live_text.wrong_material)],
  ['unsure in top-5', sum(A, (r) => r.live_text.unsure), sum(B, (r) => r.live_text.unsure)],
  ['zeros', [...A.values()].filter((r) => r.live_text.count === 0).length, [...B.values()].filter((r) => r.live_text.count === 0).length],
]
console.log(`\n${base}  ->  ${cand}   (${A.size} gold items)\n`)
for (const [label, x, y] of table) {
  const d = y - x
  console.log(`  ${label.padEnd(30)} ${String(x).padStart(5)} -> ${String(y).padStart(5)}   ${d === 0 ? '' : d > 0 ? `+${d}` : d}`)
}

for (const [label, list] of [['COVERAGE GAINED', moved.coverage_gained], ['COVERAGE LOST', moved.coverage_lost], ['NEW CONFIDENT-WRONG', moved.new_confident_wrong], ['WRONG-MATERIAL CLEARED', moved.wrong_cleared], ['FAMILY CHANGED', moved.family_changed]]) {
  if (!list.length) continue
  console.log(`\n  ${label} (${list.length}):`)
  for (const e of list.slice(0, 25)) console.log(`    ${e.id}  «${e.line}»  ${JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => !['id', 'line'].includes(k))))}`)
}

const gainedCoverage = moved.coverage_gained.length > moved.coverage_lost.length
const newErrors = moved.new_confident_wrong.reduce((a, e) => a + (e.to - e.from), 0)

/*
 * A lost family does not always zero the pool: the text path can still return
 * suppliers for a line that resolved to nothing, and every one of them is then
 * UNSURE rather than APPROPRIATE. Counting only pool loss would report that as
 * "no move", so it is called out on its own — the buyer went from a pool that
 * could be vouched for to a pool that cannot.
 */
const familiesLost = moved.family_changed.filter((e) => e.from && !e.to)
const familiesGained = moved.family_changed.filter((e) => !e.from && e.to)
console.log('')
if (newErrors > 0 && gainedCoverage) console.log(`VERDICT: FAIL (bought coverage with ${newErrors} new confident error${newErrors === 1 ? '' : 's'})`)
else if (newErrors > 0) console.log(`VERDICT: FAIL (${newErrors} new confident error${newErrors === 1 ? '' : 's'}, no coverage gain to show for it)`)
else if (moved.coverage_lost.length > moved.coverage_gained.length) console.log(`VERDICT: REGRESSION (${moved.coverage_lost.length - moved.coverage_gained.length} net items lost their pool, no new confident errors)`)
else if (familiesLost.length > familiesGained.length) console.log(`VERDICT: REGRESSION (${familiesLost.length - familiesGained.length} net items lost their family — pool survives but can no longer be vouched for: ${familiesLost.map((e) => `«${e.line}»`).join(', ')})`)
else if (gainedCoverage || familiesGained.length) console.log(`VERDICT: PASS (coverage up on ${moved.coverage_gained.length} items, ${familiesGained.length} families gained, zero new confident errors)`)
else console.log('VERDICT: NO MOVE')
