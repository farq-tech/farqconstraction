/**
 * Mine REAL example lines per intent, for the stage-2 documents.
 *
 * Source: the `cpo-v10` held-out row dumps, which already carry the resolver's
 * answer for all 183,942 archive lines. Only Level A lines decided by a strong
 * term are taken, because a weaker resolution is exactly the case the retriever
 * is supposed to improve on — seeding the documents with v10's guesses would
 * teach the retriever v10's mistakes and then measure it against them.
 *
 * WHAT IS DELIBERATELY EXCLUDED, and this is the whole methodological point:
 *
 *   - the owner's 68-item booklet, in either ordering
 *   - the 60-line real catalogue sample used as the second shadow corpus
 *
 * Both are MEASUREMENT. The booklet's adjudication table has carried the note
 * "nothing here may be fed back into the ontology as terms, or the next
 * measurement means nothing" since v5, and an example is vocabulary by another
 * name. Archive lines are fair game because they are not scored.
 *
 * The archives are template-collapsed — 184,010 lines hold 2,874 distinct
 * tokens — so per-intent examples are deduplicated on their normalized token
 * SET, not on the string. Otherwise one template contributes six near-identical
 * examples and the document says one thing six times.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const SOURCES = [
  'fixtures/boq/heldout-b3-10-v10.cpo-v10.rows.jsonl',
  'fixtures/boq/heldout-b11-20-v10.cpo-v10.rows.jsonl',
]
const OUT = 'fixtures/ontology/cascade-intent-examples.json'
const MAX_PER_INTENT = 8

/** Matching-only folding, kept in step with `normalizeProcurementText`. */
const fold = (text) =>
  String(text || '')
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/[-–—_/\\،,.:;()[\]{}"'“”«»]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const LEAD = /^(?:و?توريد\s+وتركيب|و?توريد|و?تركيب|و?تنفيذ|اعمال|عمل|شراء)\s+/

const byIntent = new Map()
const shapes = new Map()
let read = 0
let taken = 0

for (const source of SOURCES) {
  for (const raw of readFileSync(source, 'utf8').split('\n')) {
    if (!raw) continue
    read++
    let row
    try {
      row = JSON.parse(raw)
    } catch {
      continue
    }
    if (row.level !== 'A' || !row.intent || row.source !== 'ontology_intent') continue
    // The archives all open with «توريد». Keeping it in every example would put
    // the supply verb in all 218 documents, where it discriminates nothing.
    const line = String(row.line || '').replace(/\s+/g, ' ').trim()
    const trimmed = line.replace(LEAD, '').trim()
    if (trimmed.length < 6) continue

    const bucket = byIntent.get(row.intent) ?? []
    if (bucket.length >= MAX_PER_INTENT) continue
    const shapeKey = `${row.intent}\u0000${[...new Set(fold(trimmed).split(' ').filter((t) => t.length > 2 && !/\d/.test(t)))].sort().join(' ')}`
    if (shapes.has(shapeKey)) continue
    shapes.set(shapeKey, true)
    bucket.push(trimmed)
    byIntent.set(row.intent, bucket)
    taken++
  }
}

const payload = {
  note: 'Real archive lines cpo-v10 resolved at Level A by a strong term. Booklet and second-corpus lines are excluded by construction — they are the measurement.',
  ontology_version: 'cpo-v10',
  sources: SOURCES,
  rows_read: read,
  examples_taken: taken,
  intents_with_examples: byIntent.size,
  examples: Object.fromEntries([...byIntent.entries()].sort(([a], [b]) => a.localeCompare(b))),
}
writeFileSync(OUT, `${JSON.stringify(payload, null, 1)}\n`)
console.log(`read ${read} rows · ${taken} examples · ${byIntent.size} intents have at least one · → ${OUT}`)
