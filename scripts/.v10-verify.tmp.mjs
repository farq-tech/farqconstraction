/**
 * Three independent checks of the v10 claims.
 *
 * MY collision definition, stated so it can be disagreed with: an ordered pair
 * (term T of family A, term U of family B), A != B, where T MATCHES the line U
 * through the resolver's own matcher but T is NOT a literal substring of U. So
 * the reach was manufactured by morphology, not by the words being there.
 * Applied identically to v9 and v10, which is what makes the direction sound
 * even where the absolute number differs from the lane's.
 */
import { createServer } from 'vite'
import { readFileSync, existsSync } from 'node:fs'

const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' })
const load = async (v) => {
  const m = await server.ssrLoadModule(`/scripts/.tmp-vers/${v}/procurementOntology.ts`)
  const data = JSON.parse(readFileSync(`scripts/.tmp-vers/${v}/procurementOntology.data.json`, 'utf8'))
  return { m, data, v }
}
const V = { v9: await load('v9'), v10: await load('v10') }

const collectTerms = ({ m, data }) => {
  const out = []
  for (const family of data.families) {
    const walk = (node) => {
      for (const tier of ['strong_terms', 'weak_terms']) {
        for (const term of node[tier] ?? []) {
          out.push({ term, norm: m.normalizeProcurementText(term), family: family.id, sector: family.sector, tier })
        }
      }
      for (const c of node.categories ?? []) walk(c)
      for (const i of node.intents ?? []) walk(i)
    }
    walk(family)
  }
  return out
}

const collisionsOf = ({ m, data, v }) => {
  const terms = collectTerms({ m, data })
  const set = new Map()
  for (const U of terms) {
    for (const T of terms) {
      if (T.family === U.family) continue
      if (T.norm === U.norm) continue // identical vocabulary in two families is a duplicate, not a morphology collision
      if (U.norm.includes(T.norm)) continue // literal reach, not manufactured
      if (m.termIndex(U.norm, T.term) < 0) continue
      set.set(`${T.family}:${T.norm} -> ${U.family}:${U.norm}`, { T, U })
    }
  }
  return set
}

console.log('=== collisions under MY definition (morphology-manufactured cross-family reach) ===')
const c9 = collisionsOf(V.v9)
const c10 = collisionsOf(V.v10)
console.log(`  v9  ${c9.size}`)
console.log(`  v10 ${c10.size}`)
const removed = [...c9.keys()].filter((k) => !c10.has(k))
const added = [...c10.keys()].filter((k) => !c9.has(k))
console.log(`  removed ${removed.length}   added ${added.length}   net ${c10.size - c9.size}`)

console.log('\n--- ADDED under my counting (each resolved as a line to test real behaviour) ---')
for (const k of added) {
  const { U } = c10.get(k)
  const r = V.v10.m.resolveOntology(U.norm)
  const ok = r?.family === U.family
  console.log(`  ${ok ? 'benign ' : 'SUSPECT'} ${k}`)
  console.log(`           line «${U.norm}» -> ${r?.family ?? 'unresolved'} / ${r?.intent ?? '-'} (${r?.level_code}) expected ${U.family}`)
}

console.log('\n--- glass and mineral-fibre: confirmed on real LINES, both versions ---')
const probes = ['الياف زجاجيه', 'خزان الياف زجاجيه', 'صوف زجاجي', 'الياف معدنيه', 'بلاطه سقف معدني', 'باب زجاجي سحاب', 'باب زجاج']
for (const line of probes) {
  const a = V.v9.m.resolveOntology(line)
  const b = V.v10.m.resolveOntology(line)
  const f = (r) => `${r?.family ?? 'unresolved'}/${r?.intent ?? '-'}(${r?.level_code},pool=${r?.poolable})`
  const moved = f(a) !== f(b)
  console.log(`  ${moved ? 'MOVED ' : 'same  '} «${line}»\n        v9  ${f(a)}\n        v10 ${f(b)}`)
}

// ---------------------------------------------------------------- short lines
console.log('\n=== do SHORT lines move between v9 and v10? ===')
const corpora = ['fixtures/boq/heldout-b11-20.full.flat.txt', 'fixtures/boq/heldout-b3-10.full.flat.txt']
const lines = []
for (const p of corpora) if (existsSync(p)) lines.push(...readFileSync(p, 'utf8').split('\n').filter(Boolean))
console.log(`archive lines available: ${lines.length}`)

// Short lines IN THE ARCHIVE REGISTER: take the head of each archive line, which
// is the archive's own wording, not invented vocabulary.
const shortSet = new Set()
for (const l of lines) {
  const norm = V.v10.m.normalizeProcurementText(l)
  const words = norm.split(' ').filter(Boolean)
  if (!words.length) continue
  for (const n of [1, 2, 3]) if (words.length >= n) shortSet.add(words.slice(0, n).join(' '))
}
const shorts = [...shortSet]
console.log(`distinct short lines derived from archive heads (1-3 words): ${shorts.length}`)
let moved = 0
const movedRows = []
for (const s of shorts) {
  const a = V.v9.m.resolveOntology(s)
  const b = V.v10.m.resolveOntology(s)
  const key = (r) => `${r?.family ?? '-'}|${r?.intent ?? '-'}|${r?.level_code}|${r?.poolable}`
  if (key(a) !== key(b)) { moved++; movedRows.push({ s, a, b }) }
}
console.log(`short lines whose resolution CHANGED v9 -> v10: ${moved} of ${shorts.length}`)
for (const r of movedRows.slice(0, 25)) {
  console.log(`  «${r.s}»`)
  console.log(`      v9  ${r.a?.family ?? '-'}/${r.a?.intent ?? '-'} (${r.a?.level_code}, pool=${r.a?.poolable})`)
  console.log(`      v10 ${r.b?.family ?? '-'}/${r.b?.intent ?? '-'} (${r.b?.level_code}, pool=${r.b?.poolable})`)
}

await server.close()
