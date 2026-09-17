/**
 * Does the sector+position signal beat v10's symmetric refusal?
 *
 * Success = it allows «زجاج» -> «زجاجي» (so «باب زجاجي سحاب» needs no phrase
 * exemption) while NOT increasing collisions and NOT moving the booklet or the
 * archives. If it does that, the boundary is a wall at the current level of
 * description rather than a wall.
 */
import { createServer } from 'vite'
import { readFileSync, existsSync } from 'node:fs'

const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' })
const load = async (v) => ({
  v,
  m: await server.ssrLoadModule(`/scripts/.tmp-vers/${v}/procurementOntology.ts`),
  data: JSON.parse(readFileSync(`scripts/.tmp-vers/${v}/procurementOntology.data.json`, 'utf8')),
})
const V = { v9: await load('v9'), v10: await load('v10'), sig: await load('v10sig') }
console.log(`sig variant loaded, version ${V.sig.m.ONTOLOGY_VERSION} (payload identical to v10, resolver differs by one function)`)

// --- 1. the gate's decisions, side by side
console.log('\n=== the 17 gate decisions: v10 versus the signal ===')
const NISBA = ['يات', 'يين', 'يه', 'ي']
const stemOf = (w) => { for (const s of NISBA) if (w.endsWith(s) && w.length - s.length >= 3) return w.slice(0, -s.length); return w }
// Probe behaviourally: does the base term reach the derived form as a line?
const singles = new Set()
for (const family of V.v10.data.families) {
  const walk = (node) => {
    for (const tier of ['strong_terms', 'weak_terms']) {
      for (const t of node[tier] ?? []) {
        const w = V.v10.m.normalizeProcurementText(t).split(' ').filter(Boolean)
        if (w.length === 1 && /[\u0621-\u064A]/.test(w[0][0])) singles.add(w[0])
      }
    }
    for (const c of node.categories ?? []) walk(c)
    for (const i of node.intents ?? []) walk(i)
  }
  walk(family)
}
let diffs = 0
for (const base of [...singles].sort()) {
  if (stemOf(base) !== base) continue
  for (const suf of NISBA) {
    const derived = `${base}${suf}`
    const a = V.v10.m.termIndex(derived, base) >= 0
    const b = V.sig.m.termIndex(derived, base) >= 0
    if (a !== b) { diffs++; console.log(`  «${base}» -> «${derived}»   v10=${a ? 'reaches' : 'refused'}   signal=${b ? 'reaches' : 'refused'}`) }
  }
}
console.log(`gate decisions that differ: ${diffs}`)

// --- 2. the lines that motivated everything
console.log('\n=== the lines the whole argument is about ===')
const key = (r) => `${r?.family ?? 'unresolved'}/${r?.intent ?? '-'} (${r?.level_code}, pool=${r?.poolable})`
for (const line of ['زجاجي', 'باب زجاجي سحاب', 'صوف زجاجي', 'الياف زجاجيه', 'خزان الياف زجاجيه', 'الياف معدنيه', 'بلاطه سقف معدني', 'شبكي', 'فلتر شبكي', 'طابعه شبكيه', 'جهاز لوحي', 'بوابه امنيه', 'بلاستر جبسي']) {
  console.log(`  «${line}»`)
  console.log(`      v10    ${key(V.v10.m.resolveOntology(line))}`)
  console.log(`      signal ${key(V.sig.m.resolveOntology(line))}`)
}

// --- 3. collisions under my definition
const collectTerms = ({ m, data }) => {
  const out = []
  for (const family of data.families) {
    const walk = (node) => {
      for (const tier of ['strong_terms', 'weak_terms']) for (const t of node[tier] ?? []) out.push({ term: t, norm: m.normalizeProcurementText(t), family: family.id, sector: family.sector })
      for (const c of node.categories ?? []) walk(c)
      for (const i of node.intents ?? []) walk(i)
    }
    walk(family)
  }
  return out
}
const tokenRun = (t, u) => { const a = t.split(' '), b = u.split(' '); for (let i = 0; i + a.length <= b.length; i++) if (a.every((w, j) => b[i + j] === w)) return true; return false }
const collisions = ({ m, data }) => {
  const terms = collectTerms({ m, data })
  const set = new Map()
  for (const U of terms) for (const T of terms) {
    if (T.family === U.family || T.norm === U.norm) continue
    if (tokenRun(T.norm, U.norm)) continue
    if (m.termIndex(U.norm, T.term) < 0) continue
    set.set(`${T.family}:${T.norm} -> ${U.family}:${U.norm}`, { T, U })
  }
  return set
}
const c10 = collisions(V.v10), cs = collisions(V.sig)
console.log('\n=== collisions, my definition ===')
console.log(`  v10 ${c10.size}   signal ${cs.size}`)
const newOnes = [...cs.keys()].filter((k) => !c10.has(k))
console.log(`  collisions the signal ADDS: ${newOnes.length}`)
for (const k of newOnes) {
  const { U } = cs.get(k)
  const r = V.sig.m.resolveOntology(U.norm)
  console.log(`    ${r?.family === U.family ? 'benign' : r?.family == null ? 'benign(fallback)' : 'WRONG->' + r.family} ${k}`)
}

// --- 4. booklet and archive short lines must not move
console.log('\n=== does the signal disturb the booklet or the archives? ===')
const items = readFileSync('fixtures/boq/reference-booklet-68.shortform.txt', 'utf8').split('\n').map((s) => s.trim()).filter(Boolean)
let bMoved = 0
for (const it of items) {
  const a = key(V.v10.m.resolveOntology(it)), b = key(V.sig.m.resolveOntology(it))
  if (a !== b) { bMoved++; console.log(`  booklet MOVED «${it}»\n      v10    ${a}\n      signal ${b}`) }
}
console.log(`booklet items moved: ${bMoved} of ${items.length}`)

const lines = []
for (const p of ['fixtures/boq/heldout-b11-20.full.flat.txt', 'fixtures/boq/heldout-b3-10.full.flat.txt']) if (existsSync(p)) lines.push(...readFileSync(p, 'utf8').split('\n').filter(Boolean))
let aMoved = 0
const sample = lines.filter((_, i) => i % 7 === 0)
for (const l of sample) if (key(V.v10.m.resolveOntology(l)) !== key(V.sig.m.resolveOntology(l))) aMoved++
console.log(`archive lines moved: ${aMoved} of ${sample.length} sampled (every 7th of ${lines.length})`)

await server.close()
