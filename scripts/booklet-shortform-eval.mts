/**
 * The 68 real short-form booklet items. This is the set that revealed v5's
 * families were catalogue and MEP shaped: median line length two words, 90% at
 * three or fewer, against 12-15 in the archives.
 */
import { readFileSync } from 'node:fs'
import { resolveOntology, ONTOLOGY_VERSION } from '/Volumes/Extreme SSD/cunstraction/farqconstraction/src/lib/procurementOntology'

const lines = readFileSync('fixtures/boq/reference-booklet-68.shortform.txt', 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
const rows = lines.map((l) => ({ line: l, r: resolveOntology(l) }))
const n = rows.length
const A = rows.filter((x) => x.r.level_code === 'A')
const B = rows.filter((x) => x.r.level_code === 'B')
const C = rows.filter((x) => x.r.level_code === 'C')
const pool = rows.filter((x) => x.r.poolable)
const pct = (k: number) => ((100 * k) / n).toFixed(2) + '%'

console.log(`payload ${ONTOLOGY_VERSION} · ${n} real booklet items · 0 AI calls\n`)
console.log('                    cpo-v5 (measured)   cpo-v6')
console.log(`  Level A            ${'16.18%'.padStart(10)}   ${pct(A.length).padStart(10)}  (${A.length})`)
console.log(`  Level B            ${'    -  '.padStart(10)}   ${pct(B.length).padStart(10)}  (${B.length})`)
console.log(`  true unknown (C)   ${'14.71%'.padStart(10)}   ${pct(C.length).padStart(10)}  (${C.length})`)
console.log(`  poolable           ${'66.18%'.padStart(10)}   ${pct(pool.length).padStart(10)}  (${pool.length})`)

console.log('\n  --- items that still key no supplier pool ---')
for (const x of rows.filter((y) => !y.r.poolable)) {
  console.log(`    ${x.r.level_code} ${String(x.r.family ?? 'NULL').padEnd(20)} via "${x.r.debug.matched_term ?? '-'}"  ::  ${x.line}`)
}
const fams = new Map<string, number>()
for (const x of pool) fams.set(x.r.family!, (fams.get(x.r.family!) ?? 0) + 1)
console.log(`\n  --- ${fams.size} distinct pools across ${pool.length} poolable items ---`)
console.log('    ' + [...fams.entries()].sort((a, b) => b[1] - a[1]).map(([f, c]) => `${f}:${c}`).join(', '))
