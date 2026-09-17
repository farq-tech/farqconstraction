/**
 * WHAT LANDING v6 → v10 ACTUALLY CHANGES, line by line.
 *
 * The production port reads v6. Every accuracy number quoted to the owner
 * describes v9 or v10. This measures the distance on the register he actually
 * uploads — the 68 real short-form booklet items — because the archive corpora
 * cannot see it: v6 and v10 produce byte-identical output on all 183,942
 * archive rows, so they are incapable of distinguishing the two generations.
 *
 *   npx tsx scripts/.v6-v10-gap.tmp.mts
 */
import { readFileSync } from 'node:fs'
import { resolveOntology as v10 } from '../src/lib/procurementOntology'

/**
 * The adjudicated list is read out of the eval script's source rather than
 * imported, because importing it would run that script and because the script
 * is a frozen artifact of the v10 patch — a measurement should not edit the
 * thing it measures.
 */
const source = readFileSync(new URL('./booklet-shortform-eval.mts', import.meta.url), 'utf8')
const literal = source.slice(source.indexOf('const ADJUDICATED'))
const body = literal.slice(literal.indexOf('= [') + 2, literal.indexOf('\n]') + 2)
const ADJUDICATED = new Function(`return ${body}`)() as Array<
  [string, string | null, string | null]
>
// @ts-expect-error — reconstructed v6 tree, resolved at runtime
const { resolveOntology: v6 } = await import('/tmp/v6tree/src/lib/procurementOntology.ts')

type Row = { family: string | null; intent: string | null; confidence: number; poolable: boolean }
const shape = (r: Row) => `${r.family ?? 'NULL'}/${r.intent ?? '-'}`

/** Did this generation reach the adjudicated answer? */
const reached = (r: Row, wantFamily: string | null, wantIntent: string | null) =>
  wantIntent ? r.intent === wantIntent : wantFamily ? r.family === wantFamily : !r.poolable

/** Confidently wrong: poolable, and pointing at a trade that cannot supply it. */
const wrong = (r: Row, wantFamily: string | null, wantIntent: string | null) =>
  (r.poolable && wantFamily !== null && r.family !== wantFamily) ||
  (r.intent !== null && wantIntent !== null && r.intent !== wantIntent) ||
  (r.poolable && wantFamily === null)

const gained: string[] = []
const lost: string[] = []
const deepened: string[] = []
const errorsFixed: string[] = []
const errorsIntroduced: string[] = []
let identical = 0

for (const [line, wantFamily, wantIntent] of ADJUDICATED) {
  const a = v6(line) as Row
  const b = v10(line) as Row
  const sa = shape(a)
  const sb = shape(b)
  if (sa === sb && a.confidence === b.confidence && a.poolable === b.poolable) {
    identical++
    continue
  }

  const ra = reached(a, wantFamily, wantIntent)
  const rb = reached(b, wantFamily, wantIntent)
  const wa = wrong(a, wantFamily, wantIntent)
  const wb = wrong(b, wantFamily, wantIntent)
  const label = `${sa} @${a.confidence}  ->  ${sb} @${b.confidence}   ::  ${line}`

  if (wa && !wb) errorsFixed.push(label)
  else if (!wa && wb) errorsIntroduced.push(label)
  else if (!ra && rb) gained.push(label)
  else if (ra && !rb) lost.push(label)
  else if (!a.intent && b.intent) deepened.push(label)
  else deepened.push(label)
}

const block = (title: string, rows: string[]) => {
  console.log(`\n=== ${title}: ${rows.length} ===`)
  for (const r of rows) console.log(`   ${r}`)
}

console.log(`68 adjudicated booklet items, v6 -> v10`)
console.log(`  identical: ${identical}     moved: ${68 - identical}`)
block('CONFIDENT ERRORS FIXED', errorsFixed)
block('CONFIDENT ERRORS INTRODUCED', errorsIntroduced)
block('ANSWER GAINED (was not reaching the adjudicated answer, now does)', gained)
block('ANSWER LOST', lost)
block('MOVED WITHOUT CHANGING CORRECTNESS', deepened)
