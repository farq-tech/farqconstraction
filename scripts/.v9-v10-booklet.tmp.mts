/** Does v10 move anything v9 did not? Booklet lines and supplier archetypes. */
import { readFileSync } from 'node:fs'
import { resolveOntology as r10, classifySupplierArchetypes as a10 } from '../src/lib/procurementOntology'
// @ts-expect-error runtime import of a reconstructed tree
const { resolveOntology: r9, classifySupplierArchetypes: a9 } = await import('/tmp/v9tree/src/lib/procurementOntology.ts')
// @ts-expect-error runtime import of a reconstructed tree
const { resolveOntology: r6, classifySupplierArchetypes: a6 } = await import('/tmp/v6tree/src/lib/procurementOntology.ts')

const src = readFileSync(new URL('./booklet-shortform-eval.mts', import.meta.url), 'utf8')
const lit = src.slice(src.indexOf('const ADJUDICATED'))
const ADJ = new Function(`return ${lit.slice(lit.indexOf('= [') + 2, lit.indexOf('\n]') + 2)}`)() as Array<[string, string|null, string|null]>

const shape = (x: any) => `${x.family ?? 'NULL'}/${x.intent ?? '-'}@${x.confidence}`
let moved = 0
for (const [line] of ADJ) {
  const a = shape(r9(line)), b = shape(r10(line))
  if (a !== b) { moved++; console.log(`  v9 ${a}  ->  v10 ${b}   ::  ${line}`) }
}
console.log(`booklet: ${moved} of ${ADJ.length} lines differ between v9 and v10`)

// SUPPLY SIDE: the map is built from supplier text, so archetype changes move it.
const suppliers = readFileSync('fixtures/suppliers/messy-supplier-list.csv', 'utf8')
  .split('\n').slice(1).map((l) => l.split(',').slice(1).join(' ').trim()).filter((l) => l.length > 3)
let s6 = 0, s9 = 0
for (const s of suppliers) {
  const k6 = JSON.stringify(a6(s)), k9 = JSON.stringify(a9(s)), k10 = JSON.stringify(a10(s))
  if (k6 !== k10) { s6++; if (s6 <= 8) console.log(`  v6 ${k6} -> v10 ${k10}  ::  ${s.slice(0, 60)}`) }
  if (k9 !== k10) s9++
}
console.log(`\nsupplier archetypes over ${suppliers.length} records: v6->v10 changed ${s6}, v9->v10 changed ${s9}`)
