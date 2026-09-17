/**
 * cpo-v5 → cpo-v6 movement audit for held-out batches.
 *
 * Joins three sources positionally (all are the same corpus in the same order):
 *   joined.v5.json   v5 resolution + the archive's own `section`/`src_cat` labels
 *   *.cpo-v6.rows.jsonl  v6 resolution
 *
 * Answers, per cell, where rows MOVED rather than whether a rate improved: a
 * positional rule that stops a word from deciding has to send the line
 * somewhere, and that somewhere is where the next error hides.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const joinedPath = process.argv[2]
const v6Path = process.argv[3]
const outPath = process.argv[4]

const v5 = JSON.parse(readFileSync(joinedPath, 'utf8'))
const v6 = readFileSync(v6Path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
if (v5.length !== v6.length) throw new Error(`length mismatch ${v5.length} vs ${v6.length}`)

const key = (r) => `${r.family ?? '-'}/${r.intent ?? '-'}`
const cellKey = (r) => `${key(r)} | ${r.src_cat ?? '-'}`

// Sanity: the two runs must describe the same lines, or the positional join lies.
let lineMismatch = 0
for (let i = 0; i < v5.length; i++) if (v5[i].line !== v6[i].line) lineMismatch++

const moves = new Map()
const newlyPoolable = new Map()
const lostPoolable = new Map()
let poolV5 = 0
let poolV6 = 0

for (let i = 0; i < v5.length; i++) {
  const a = v5[i]
  const b = v6[i]
  if (a.poolable) poolV5++
  if (b.poolable) poolV6++

  if (key(a) !== key(b) || a.level !== b.level) {
    const k = `${a.level} ${key(a)}  ==>  ${b.level} ${key(b)}  | src=${a.section ?? '-'} / ${a.src_cat ?? '-'}`
    const e = moves.get(k) ?? { n: 0, sample: a.line, v5: key(a), v6: key(b), lvl5: a.level, lvl6: b.level, section: a.section, src_cat: a.src_cat, conf6: b.confidence, term6: b.matched_term }
    e.n++
    moves.set(k, e)
  }

  if (!a.poolable && b.poolable) {
    const k = cellKey({ ...b, src_cat: a.src_cat })
    const e = newlyPoolable.get(k) ?? { n: 0, sample: b.line, v6: key(b), level: b.level, conf: b.confidence, term: b.matched_term, section: a.section, src_cat: a.src_cat }
    e.n++
    newlyPoolable.set(k, e)
  }
  if (a.poolable && !b.poolable) {
    const k = cellKey(a)
    const e = lostPoolable.get(k) ?? { n: 0, sample: a.line, v5: key(a), src_cat: a.src_cat }
    e.n++
    lostPoolable.set(k, e)
  }
}

const sort = (m) => [...m.values()].sort((x, y) => y.n - x.n)
const out = {
  corpus: joinedPath,
  v6_rows: v6Path,
  lines: v5.length,
  line_mismatch: lineMismatch,
  poolable_v5: poolV5,
  poolable_v6: poolV6,
  newly_poolable_total: sort(newlyPoolable).reduce((s, e) => s + e.n, 0),
  lost_poolable_total: sort(lostPoolable).reduce((s, e) => s + e.n, 0),
  moves: sort(moves),
  newly_poolable_cells: sort(newlyPoolable),
  lost_poolable_cells: sort(lostPoolable),
}
writeFileSync(outPath, JSON.stringify(out, null, 2))

console.log(`lines ${out.lines}  line_mismatch ${lineMismatch}`)
console.log(`poolable v5 ${poolV5} -> v6 ${poolV6}`)
console.log(`newly poolable ${out.newly_poolable_total} in ${newlyPoolable.size} cells`)
console.log(`lost poolable  ${out.lost_poolable_total} in ${lostPoolable.size} cells`)
console.log(`moved cells    ${moves.size}`)
