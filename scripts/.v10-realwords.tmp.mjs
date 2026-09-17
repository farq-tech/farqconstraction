/**
 * Two generated forms ARE real Arabic words with a different meaning:
 *
 *   «درج» (stairs)  -> generated «درجات», which is really the plural of «درجة»
 *                      = DEGREE / GRADE. «درجات الحرارة» is temperature.
 *   «حجر» (stone)   -> generated «حجرات», which is really the plural of «حجرة»
 *                      = ROOM.
 *
 * Both are common in Saudi tender prose, so this is the case where "inert"
 * would stop being true. Tested as lines, v9 against v10.
 */
import { createServer } from 'vite'
import { readFileSync, existsSync } from 'node:fs'

const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' })
const load = async (v) => ({ v, m: await server.ssrLoadModule(`/scripts/.tmp-vers/${v}/procurementOntology.ts`) })
const V = { v9: await load('v9'), v10: await load('v10') }

const key = (r) => `${r?.family ?? 'unresolved'}/${r?.intent ?? '-'} (${r?.level_code}, pool=${r?.poolable})`
const probes = [
  'درجات الحراره',
  'مقياس درجات الحراره',
  'ثرموستات لضبط درجات الحراره',
  'مروحه شفط للحمامات وعدد درجات الحراره',
  'حجرات النوم',
  'دهان حجرات المكاتب',
  'تكييف حجرات المرضي',
  'عدد الحجرات ثلاثه',
  'درج رخام',
  'حجر بازلت',
]
console.log('=== do the two real-word collisions actually fire? ===')
for (const line of probes) {
  const a = V.v9.m.resolveOntology(line)
  const b = V.v10.m.resolveOntology(line)
  const moved = key(a) !== key(b)
  console.log(`  ${moved ? 'MOVED ' : 'same  '} «${line}»`)
  console.log(`         v9  ${key(a)}`)
  console.log(`         v10 ${key(b)}`)
}

// Does real prose contain these tokens at all?
console.log('\n=== do these tokens occur in the real corpora? ===')
const corpora = ['fixtures/boq/heldout-b11-20.full.flat.txt', 'fixtures/boq/heldout-b3-10.full.flat.txt', 'fixtures/boq/reference-booklet-68.shortform.txt']
const counts = new Map()
let total = 0
for (const p of corpora) {
  if (!existsSync(p)) continue
  for (const raw of readFileSync(p, 'utf8').split('\n')) {
    if (!raw.trim()) continue
    total++
    const norm = V.v10.m.normalizeProcurementText(raw)
    for (const t of ['درجات', 'حجرات', 'درجه', 'حجره', 'درج', 'حجر']) {
      if (norm.split(' ').includes(t)) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
  }
}
console.log(`lines scanned: ${total}`)
for (const t of ['درجات', 'حجرات', 'درجه', 'حجره', 'درج', 'حجر']) console.log(`  «${t}» appears in ${counts.get(t) ?? 0} lines`)

await server.close()
