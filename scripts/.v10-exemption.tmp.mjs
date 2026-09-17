/**
 * Attack the phrase exemption.
 *
 * Its justification is «the head has already pinned the trade». That is false by
 * construction wherever the head word is itself owned by many families. Find
 * multi-word terms whose head is generic, because there the exemption fires and
 * nothing has been pinned.
 */
import { createServer } from 'vite'
import { readFileSync } from 'node:fs'

const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const m = await server.ssrLoadModule('/src/lib/procurementOntology.ts')
const DATA = JSON.parse(readFileSync('src/lib/procurementOntology.data.json', 'utf8'))

const owners = new Map()
const terms = []
for (const family of DATA.families) {
  const walk = (node, path) => {
    for (const tier of ['strong_terms', 'weak_terms']) {
      for (const term of node[tier] ?? []) {
        const norm = m.normalizeProcurementText(term)
        const words = norm.split(' ').filter(Boolean)
        if (words.length > 1) terms.push({ norm, words, family: family.id, sector: family.sector, path })
        for (const w of words) {
          if (!owners.has(w)) owners.set(w, new Set())
          owners.get(w).add(family.id)
        }
      }
    }
    for (const c of node.categories ?? []) walk(c, `${path}/${c.id}`)
    for (const i of node.intents ?? []) walk(i, `${path}/${i.id}`)
  }
  walk(family, family.id)
}

const NISBA = ['يات', 'يين', 'يه', 'ي']
const stemOf = (w) => { for (const s of NISBA) if (w.endsWith(s) && w.length - s.length >= 3) return w.slice(0, -s.length); return w }

// A term is exposed when its HEAD is generic (owned by several families) AND at
// least one later word derives into a form another family owns. Then derivation
// is free and the head pinned nothing.
const exposed = []
for (const t of terms) {
  const head = t.words[0]
  const headOwners = owners.get(head)?.size ?? 0
  if (headOwners < 3) continue
  for (const w of t.words.slice(1)) {
    if (!/[\u0621-\u064A]/.test(w[0] || '')) continue
    const base = stemOf(w)
    for (const suf of NISBA) {
      const derived = `${base}${suf}`
      if (derived === w) continue
      const o = owners.get(derived)
      if (!o) continue
      const foreign = [...o].filter((f) => f !== t.family)
      if (!foreign.length) continue
      exposed.push({ term: t.norm, family: t.family, head, headOwners, word: w, derived, foreign })
    }
  }
}
console.log(`multi-word terms: ${terms.length}`)
console.log(`exposed (generic head >=3 owners AND a later word derives into another family's form): ${exposed.length}\n`)
for (const e of exposed.slice(0, 25)) {
  console.log(`  «${e.term}» [${e.family}]`)
  console.log(`      head «${e.head}» owned by ${e.headOwners} families -> pins nothing`)
  console.log(`      «${e.word}» derives to «${e.derived}» owned by: ${e.foreign.join(', ')}`)
}

await server.close()
