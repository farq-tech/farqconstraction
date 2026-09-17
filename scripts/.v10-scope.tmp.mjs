/**
 * `constrained` is decided PER TERM (`words.length > 1`), so `derivationAllowed`
 * is only ever consulted for SINGLE-WORD terms. That is the true population the
 * boundary claim governs — much smaller than word-level ownership suggests.
 */
import { createServer } from 'vite'
import { readFileSync } from 'node:fs'

const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const m = await server.ssrLoadModule('/src/lib/procurementOntology.ts')
const DATA = JSON.parse(readFileSync('src/lib/procurementOntology.data.json', 'utf8'))

const owners = new Map()      // word -> Map<family, Set<term>>
const singleWordTerms = new Map() // term -> Set<family>
for (const family of DATA.families) {
  const walk = (node) => {
    for (const tier of ['strong_terms', 'weak_terms']) {
      for (const term of node[tier] ?? []) {
        const norm = m.normalizeProcurementText(term)
        const words = norm.split(' ').filter(Boolean)
        if (words.length === 1 && /[\u0621-\u064A]/.test(words[0][0])) {
          if (!singleWordTerms.has(norm)) singleWordTerms.set(norm, new Set())
          singleWordTerms.get(norm).add(family.id)
        }
        for (const word of words) {
          if (!word) continue
          if (!owners.has(word)) owners.set(word, new Map())
          if (!owners.get(word).has(family.id)) owners.get(word).set(family.id, new Set())
          owners.get(word).get(family.id).add(norm)
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

console.log(`Arabic single-word terms in the vocabulary: ${singleWordTerms.size}`)
console.log('\n=== the ONLY cases where the gate actually decides (single-word term with an owned derived form) ===')
let n = 0
for (const [term, fams] of [...singleWordTerms].sort()) {
  const base = stemOf(term)
  if (base !== term) continue
  for (const suf of NISBA) {
    const derived = `${base}${suf}`
    const ofForm = owners.get(derived)
    if (!ofForm) continue
    const foreign = [...ofForm.keys()].filter((f) => !fams.has(f))
    n++
    console.log(`  ${foreign.length ? 'REFUSE' : 'ALLOW '}  «${term}» (term of ${[...fams].join(',')}) -> «${derived}»`)
    for (const f of foreign) console.log(`            foreign ${f}: ${[...ofForm.get(f)].slice(0, 3).join(' | ')}`)
  }
}
console.log(`\ngate is consulted on ${n} base/suffix pairs that have an owned derived form`)

// And the reverse question: which single-word terms derive FREELY because
// nothing owns the derived form? Those are where the rule silently expands.
let free = 0
for (const [term, fams] of singleWordTerms) {
  const base = stemOf(term)
  if (base !== term) continue
  for (const suf of NISBA) if (!owners.has(`${base}${suf}`)) free++
}
console.log(`gate waves through ${free} base/suffix pairs whose derived form is unowned (no evidence either way)`)

await server.close()
