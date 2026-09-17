/**
 * Is the inflection/derivation boundary a real wall, or a wall at the current
 * level of description?
 *
 * The gate refuses a derivation when the derived form is claimed by a family
 * that does not also claim the base. That is already a structural signal. The
 * question is whether ANY signal separates «معدن»→«معدني» (must refuse: the
 * derived form means a DIFFERENT MATERIAL) from «زجاج»→«زجاجي» (should allow:
 * same material, different products) without a human deciding.
 */
import { createServer } from 'vite'
import { readFileSync } from 'node:fs'

const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const m = await server.ssrLoadModule('/src/lib/procurementOntology.ts')
const DATA = JSON.parse(readFileSync('src/lib/procurementOntology.data.json', 'utf8'))

// Rebuild the owners index, but keep the SECTOR and the full term, which the
// resolver's own index discards. If a separating signal exists it will need
// more than family ids.
const owners = new Map() // word -> Map<familyId, {sector, terms:Set}>
for (const family of DATA.families) {
  const walk = (node) => {
    for (const tier of ['strong_terms', 'weak_terms']) {
      for (const term of node[tier] ?? []) {
        const norm = m.normalizeProcurementText(term)
        for (const word of norm.split(' ')) {
          if (!word) continue
          if (!owners.has(word)) owners.set(word, new Map())
          const byFam = owners.get(word)
          if (!byFam.has(family.id)) byFam.set(family.id, { sector: family.sector, terms: new Set() })
          byFam.get(family.id).terms.add(norm)
        }
      }
    }
    for (const c of node.categories ?? []) walk(c)
    for (const i of node.intents ?? []) walk(i)
  }
  walk(family)
}

const NISBA = ['يات', 'يين', 'يه', 'ي']
const stemOf = (w) => {
  for (const s of NISBA) if (w.endsWith(s) && w.length - s.length >= 3) return w.slice(0, -s.length)
  return w
}
const describe = (word) => {
  const byFam = owners.get(word)
  if (!byFam) return '(unowned)'
  return [...byFam.entries()].map(([f, v]) => `${f}[${v.sector}]`).join(' + ')
}

console.log('=== the four words at the centre of the claim ===')
for (const w of ['معدن', 'معدني', 'معدنيه', 'زجاج', 'زجاجي', 'زجاجيه', 'خشب', 'خشبي', 'ارض', 'ارضي', 'ارضيه']) {
  console.log(`  ${w.padEnd(9)} -> ${describe(w)}`)
}

// Enumerate every base whose nisba derivation is CONTESTED, i.e. the derived
// form is owned by someone. Those are the only cases the gate has to judge.
console.log('\n=== every contested derivation (derived form is owned by some family) ===')
const contested = []
for (const base of owners.keys()) {
  if (stemOf(base) !== base) continue // base must itself be a stem, not a nisba
  for (const suf of NISBA) {
    const derived = `${base}${suf}`
    if (!owners.has(derived)) continue
    const ofBase = owners.get(base)
    const ofForm = owners.get(derived)
    const foreign = [...ofForm.keys()].filter((f) => !ofBase.has(f))
    contested.push({ base, derived, ofBase, ofForm, foreign, allowed: foreign.length === 0 })
  }
}
contested.sort((a, b) => a.base.localeCompare(b.base))
for (const c of contested) {
  console.log(`  ${c.allowed ? 'ALLOW ' : 'REFUSE'} ${c.base} -> ${c.derived}`)
  console.log(`         base owned by: ${[...c.ofBase.entries()].map(([f, v]) => `${f}[${v.sector}]`).join(' + ')}`)
  console.log(`         form owned by: ${[...c.ofForm.entries()].map(([f, v]) => `${f}[${v.sector}]`).join(' + ')}`)
  if (c.foreign.length) {
    for (const f of c.foreign) {
      console.log(`         foreign «${f}» terms: ${[...c.ofForm.get(f).terms].slice(0, 4).join(' | ')}`)
    }
  }
}
console.log(`\ncontested total ${contested.length}  allowed ${contested.filter((c) => c.allowed).length}  refused ${contested.filter((c) => !c.allowed).length}`)

await server.close()
