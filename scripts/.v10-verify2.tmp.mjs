/**
 * Corrected collision definition.
 *
 * My first pass excluded any pair where T was a literal SUBSTRING of U. In
 * Arabic that is wrong: suffixation means the base is always a substring of the
 * form it derives («زجاج» inside «زجاجي»), so that filter silently deleted every
 * nisba collision and reported v9 = 0. The right filter is TOKEN containment —
 * would T match U if terms only matched whole words, with no generated forms?
 *
 * collision(T of A, U of B) := A != B, T != U, termIndex(U, T) >= 0,
 *                              and T's tokens are NOT a contiguous run of U's.
 */
import { createServer } from 'vite'
import { readFileSync, existsSync } from 'node:fs'

const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' })
const load = async (v) => ({
  v,
  m: await server.ssrLoadModule(`/scripts/.tmp-vers/${v}/procurementOntology.ts`),
  data: JSON.parse(readFileSync(`scripts/.tmp-vers/${v}/procurementOntology.data.json`, 'utf8')),
})
const V = { v9: await load('v9'), v10: await load('v10') }

const collectTerms = ({ m, data }) => {
  const out = []
  for (const family of data.families) {
    const walk = (node) => {
      for (const tier of ['strong_terms', 'weak_terms']) {
        for (const t of node[tier] ?? []) out.push({ term: t, norm: m.normalizeProcurementText(t), family: family.id, sector: family.sector })
      }
      for (const c of node.categories ?? []) walk(c)
      for (const i of node.intents ?? []) walk(i)
    }
    walk(family)
  }
  return out
}
const tokenRun = (tNorm, uNorm) => {
  const t = tNorm.split(' ').filter(Boolean)
  const u = uNorm.split(' ').filter(Boolean)
  for (let i = 0; i + t.length <= u.length; i++) if (t.every((w, j) => u[i + j] === w)) return true
  return false
}
const collisionsOf = ({ m, data }) => {
  const terms = collectTerms({ m, data })
  const set = new Map()
  for (const U of terms) {
    for (const T of terms) {
      if (T.family === U.family || T.norm === U.norm) continue
      if (tokenRun(T.norm, U.norm)) continue      // literal whole-word reach
      if (m.termIndex(U.norm, T.term) < 0) continue // no reach at all
      set.set(`${T.family}:${T.norm} -> ${U.family}:${U.norm}`, { T, U })
    }
  }
  return set
}

const c9 = collisionsOf(V.v9)
const c10 = collisionsOf(V.v10)
const removed = [...c9.keys()].filter((k) => !c10.has(k))
const added = [...c10.keys()].filter((k) => !c9.has(k))
console.log('=== collisions, MY corrected definition (token-level) ===')
console.log(`  v9  ${c9.size}`)
console.log(`  v10 ${c10.size}`)
console.log(`  removed ${removed.length}   added ${added.length}   net ${c10.size - c9.size}`)
const bySector = (list, src) => {
  let cross = 0
  for (const k of list) { const { T, U } = src.get(k); if (T.sector !== U.sector) cross++ }
  return cross
}
console.log(`  of removed, cross-SECTOR (the ones that misroute an RFQ): ${bySector(removed, c9)}`)
console.log(`  of added,   cross-SECTOR: ${bySector(added, c10)}`)

console.log('\n--- glass / mineral-fibre pairs among the REMOVED ---')
for (const k of removed.filter((k) => /زجاج|معدن/.test(k))) console.log(`  removed: ${k}`)
console.log('--- glass / mineral-fibre pairs still PRESENT in v10 ---')
for (const k of [...c10.keys()].filter((k) => /زجاج|معدن/.test(k))) console.log(`  present: ${k}`)

console.log('\n--- every ADDED collision, adjudicated as a real line ---')
for (const k of added) {
  const { T, U } = c10.get(k)
  const r = V.v10.m.resolveOntology(U.norm)
  const verdict = r?.family === U.family ? 'benign (right family wins)' : r?.family == null ? 'benign (falls back, unresolved)' : `WRONG -> ${r.family}`
  console.log(`  ${verdict.padEnd(32)} «${U.norm}» [${U.family}]  reached by «${T.norm}» [${T.family}]`)
}

// ------------------------------------------------- booklet register, v9 vs v10
console.log('\n=== the register that actually matters: real booklet short-form items ===')
const bookletPath = ['fixtures/boq/reference-booklet-68.shortform.txt', 'fixtures/boq/reference-booklet-68.items.txt'].find((p) => existsSync(p))
console.log(`booklet fixture: ${bookletPath ?? 'NOT FOUND'}`)
if (bookletPath) {
  const items = readFileSync(bookletPath, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean)
  console.log(`items: ${items.length}`)
  let movedN = 0
  const key = (r) => `${r?.family ?? '-'}|${r?.intent ?? '-'}|${r?.level_code}|${r?.poolable}`
  for (const it of items) {
    const a = V.v9.m.resolveOntology(it)
    const b = V.v10.m.resolveOntology(it)
    if (key(a) !== key(b)) {
      movedN++
      console.log(`  MOVED «${it}»\n      v9  ${key(a)}\n      v10 ${key(b)}`)
    }
  }
  console.log(`booklet items whose resolution changed v9 -> v10: ${movedN} of ${items.length}`)
}

await server.close()
