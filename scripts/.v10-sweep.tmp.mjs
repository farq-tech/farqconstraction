/**
 * Automated attack over the whole exposed population.
 *
 * For every exposure (generic head + a word that derives into another family's
 * form), take the FOREIGN family's own terms that contain the derived form and
 * resolve them as lines. If the exempted family steals a foreign family's own
 * term, the exemption has fired where the head pinned nothing.
 */
import { createServer } from 'vite'
import { readFileSync } from 'node:fs'

const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' })
const m = await server.ssrLoadModule('/src/lib/procurementOntology.ts')
const DATA = JSON.parse(readFileSync('src/lib/procurementOntology.data.json', 'utf8'))
const sectorOf = new Map(DATA.families.map((f) => [f.id, f.sector]))

const owners = new Map()
const termsOfFamily = new Map()
const multi = []
for (const family of DATA.families) {
  const walk = (node) => {
    for (const tier of ['strong_terms', 'weak_terms']) {
      for (const term of node[tier] ?? []) {
        const norm = m.normalizeProcurementText(term)
        const words = norm.split(' ').filter(Boolean)
        if (words.length > 1) multi.push({ norm, words, family: family.id })
        if (!termsOfFamily.has(family.id)) termsOfFamily.set(family.id, new Set())
        termsOfFamily.get(family.id).add(norm)
        for (const w of words) {
          if (!owners.has(w)) owners.set(w, new Set())
          owners.get(w).add(family.id)
        }
      }
    }
    for (const c of node.categories ?? []) walk(c)
    for (const i of node.intents ?? []) walk(i)
  }
  walk(family)
}
const NISBA = ['يات', 'يين', 'يه', 'ي']
const stemOf = (w) => { for (const s of NISBA) if (w.endsWith(s) && w.length - s.length >= 3) return w.slice(0, -s.length); return w }

// Collect the exposures, deduplicated.
const exposures = new Map()
for (const t of multi) {
  if ((owners.get(t.words[0])?.size ?? 0) < 3) continue
  for (const w of t.words.slice(1)) {
    if (!/[\u0621-\u064A]/.test(w[0] || '')) continue
    const base = stemOf(w)
    for (const suf of NISBA) {
      const derived = `${base}${suf}`
      if (derived === w) continue
      const o = owners.get(derived)
      if (!o) continue
      for (const foreign of [...o].filter((f) => f !== t.family)) {
        exposures.set(`${t.norm}|${derived}|${foreign}`, { term: t.norm, family: t.family, derived, foreign })
      }
    }
  }
}
console.log(`deduplicated exposures: ${exposures.size}`)

let tested = 0, stolen = 0
const thefts = []
for (const e of exposures.values()) {
  for (const foreignTerm of termsOfFamily.get(e.foreign) ?? []) {
    if (!foreignTerm.includes(e.derived)) continue
    const r = m.resolveOntology(foreignTerm)
    tested++
    const got = r?.family ?? null
    if (got && got !== e.foreign) {
      stolen++
      thefts.push({ line: foreignTerm, expected: e.foreign, got, level: r.level_code, poolable: r.poolable, via: e.term })
    }
  }
}
console.log(`foreign-owned lines resolved: ${tested}`)
console.log(`lines where a DIFFERENT family won: ${stolen}\n`)
const seen = new Set()
for (const t of thefts) {
  const k = `${t.line}|${t.got}`
  if (seen.has(k)) continue
  seen.add(k)
  console.log(`  «${t.line}»  expected ${t.expected} [${sectorOf.get(t.expected)}]`)
  console.log(`       got ${t.got} [${sectorOf.get(t.got)}]  level ${t.level} poolable=${t.poolable}  (exempted term «${t.via}»)`)
}

await server.close()
