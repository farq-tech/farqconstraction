/**
 * CROSS-FAMILY COLLISIONS CREATED BY INFLECTION — the instrument, kept so any
 * future widening of the morphology rule can be measured rather than argued.
 *
 * A collision is: term A, owned by family FA, reaches the text of term B owned
 * by a DIFFERENT family — and reaches it only through morphology. If A is a
 * literal phrase inside B, the collision predates the rule and is not counted;
 * the question this answers is what a WIDENING costs.
 *
 * Read the count as an UPPER BOUND on risk, not as a prediction of behaviour:
 * every one of the eight collisions v10 added resolves to the correct family at
 * line level, because the head concept decides a layer above this one.
 *
 *   npx tsx scripts/.v10-morph-audit.tmp.mjs
 *   AUDIT_RESOLVER=/tmp/v9tree/src/lib/procurementOntology.ts \
 *   AUDIT_PAYLOAD=/tmp/v9tree/src/lib/procurementOntology.data.json \
 *   AUDIT_JSON=/tmp/before.json npx tsx scripts/.v10-morph-audit.tmp.mjs
 */
const RESOLVER = process.env.AUDIT_RESOLVER ?? '../src/lib/procurementOntology.ts'
const { termIndex, normalizeProcurementText: norm } = await import(RESOLVER)
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const DATA = require(process.env.AUDIT_PAYLOAD ?? '../src/lib/procurementOntology.data.json')

const DECIDING = ['strong_terms', 'weak_terms']
const terms = new Map()
for (const family of DATA.families) {
  const walk = (node) => {
    for (const tier of DECIDING) {
      for (const t of node[tier] ?? []) {
        if (!terms.has(t)) terms.set(t, new Set())
        terms.get(t).add(family.id)
      }
    }
    for (const c of node.categories ?? []) walk(c)
    for (const i of node.intents ?? []) walk(i)
  }
  walk(family)
}
const all = [...terms.keys()]
console.log(`${all.length} deciding terms across ${DATA.families.length} families\n`)

/** Literal phrase containment, same boundary semantics, no morphology. */
const literalHit = (hayRaw, termRaw) => {
  const hay = norm(hayRaw)
  const t = norm(termRaw)
  if (!t) return false
  for (let from = 0; ; from++) {
    const at = hay.indexOf(t, from)
    if (at < 0) return false
    const before = at === 0 ? ' ' : hay[at - 1]
    const after = at + t.length >= hay.length ? ' ' : hay[at + t.length]
    if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) return true
    from = at
  }
}

const collisions = []
for (const a of all) {
  const fa = terms.get(a)
  for (const b of all) {
    if (a === b) continue
    const fb = terms.get(b)
    if ([...fa].some((f) => fb.has(f))) continue // shared term is not a collision
    if (literalHit(b, a)) continue // predates morphology
    if (termIndex(b, a) < 0) continue
    collisions.push({ claimer: a, claimerFamilies: [...fa], victim: b, victimFamilies: [...fb] })
  }
}

console.log(`=== ${collisions.length} CROSS-FAMILY COLLISIONS CREATED BY INFLECTION ===\n`)
const byClaimer = new Map()
for (const c of collisions) {
  const k = `«${c.claimer}» [${c.claimerFamilies.join(',')}]`
  if (!byClaimer.has(k)) byClaimer.set(k, [])
  byClaimer.get(k).push(`«${c.victim}» [${c.victimFamilies.join(',')}]`)
}
for (const [k, v] of [...byClaimer.entries()].sort((x, y) => y[1].length - x[1].length)) {
  console.log(`  ${k}`)
  for (const victim of v) console.log(`      claims ${victim}`)
}
console.log(`\nTOTAL ${collisions.length}`)

if (process.env.AUDIT_JSON) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync(
    process.env.AUDIT_JSON,
    JSON.stringify(collisions.map((c) => `${c.claimer} => ${c.victim}`).sort(), null, 1),
  )
}
