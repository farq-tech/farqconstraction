/** Iteration harness for the computed guard predicate. */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const d = require('../src/lib/procurementOntology.data.json')

const ALL_TIERS = ['strong_terms', 'weak_terms', 'context_terms']
const DECIDING = ['strong_terms', 'weak_terms']
const key = (t) => t.toLowerCase().trim()

const decidesIn = new Map() // term -> families where it is strong/weak
const vocabOf = new Map() // family -> all terms in any tier
for (const f of d.families) {
  const bag = new Set()
  const walk = (n) => {
    for (const tier of ALL_TIERS) for (const t of n[tier] ?? []) bag.add(key(t))
    for (const tier of DECIDING) {
      for (const t of n[tier] ?? []) {
        if (!decidesIn.has(key(t))) decidesIn.set(key(t), new Set())
        decidesIn.get(key(t)).add(f.id)
      }
    }
    for (const c of n.categories ?? []) walk(c)
    for (const i of n.intents ?? []) walk(i)
  }
  walk(f)
  vocabOf.set(f.id, bag)
}

let depth = 0
const problems = []
for (const f of d.families) {
  const carried = new Map()
  const walk = (n, path) => {
    const here = `${path}/${n.id}`
    carried.set(here, {
      terms: new Set([...(n.strong_terms ?? []), ...(n.weak_terms ?? [])]),
      guards: n.term_guards ?? [],
    })
    for (const c of n.categories ?? []) walk(c, here)
    for (const i of n.intents ?? []) walk(i, here)
  }
  walk(f, '')

  for (const [path, node] of carried) {
    for (const g of node.guards) {
      const blocked = [...(g.block_any ?? []), ...(g.blocked_by_head ?? [])]
      // FOREIGN: can decide some other family, and this family never uses it.
      const foreign = blocked.filter((b) => {
        const owners = decidesIn.get(key(b))
        return owners && [...owners].some((o) => o !== f.id) && !vocabOf.get(f.id).has(key(b))
      })
      for (const term of g.terms) {
        if (!node.terms.has(term)) continue
        for (const [anc, ancNode] of carried) {
          if (!path.startsWith(`${anc}/`)) continue
          if (!ancNode.terms.has(term)) continue
          if (ancNode.guards.some((x) => x.terms.includes(term))) continue
          if (!foreign.length) {
            depth++
            continue
          }
          problems.push(`TRADE GUARD UNMIRRORED «${term}» at ${path}, free at ${anc}\n      foreign: ${foreign.join(', ')}`)
        }
      }
    }
  }
}
console.log(`depth-guard offences (benign, automatic): ${depth}`)
console.log(`trade-guard offences needing a mirror: ${problems.length}`)
for (const p of problems) console.log('  ' + p)
