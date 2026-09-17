/**
 * Candidate separating signal: is the derived form the HEAD of the foreign
 * family's term, or only a MODIFIER inside it?
 *
 * If a foreign family only ever uses the derived form as a modifier («صوف
 * زجاجي» — head «صوف»), then allowing the base to reach that form does not let
 * the base impersonate that family: the family's own term is longer and scores
 * higher. If the foreign family uses the derived form as a whole term or head
 * («امنيه» standing alone), the competition is head-to-head and refusal is right.
 */
import { createServer } from 'vite'
import { readFileSync } from 'node:fs'

const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const m = await server.ssrLoadModule('/src/lib/procurementOntology.ts')
const DATA = JSON.parse(readFileSync('src/lib/procurementOntology.data.json', 'utf8'))

const owners = new Map()
for (const family of DATA.families) {
  const walk = (node) => {
    for (const tier of ['strong_terms', 'weak_terms']) {
      for (const term of node[tier] ?? []) {
        const norm = m.normalizeProcurementText(term)
        for (const word of norm.split(' ')) {
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

// Is «معدن» really absent from the vocabulary? That is the load-bearing fact:
// if it is, the gate is NEVER asked about معدن -> معدني.
console.log('=== is the claimed derivation even performed? ===')
for (const w of ['معدن', 'ارض', 'زجاج', 'خشب']) {
  const o = owners.get(w)
  console.log(`  «${w}» in vocabulary: ${o ? 'YES -> ' + [...o.keys()].join(',') : 'NO — the gate is never asked about it'}`)
}

const NISBA = ['يات', 'يين', 'يه', 'ي']
const stemOf = (w) => { for (const s of NISBA) if (w.endsWith(s) && w.length - s.length >= 3) return w.slice(0, -s.length); return w }

console.log('\n=== every REFUSED derivation, classified by the candidate signal ===')
const rows = []
for (const base of owners.keys()) {
  if (stemOf(base) !== base) continue
  for (const suf of NISBA) {
    const derived = `${base}${suf}`
    if (!owners.has(derived)) continue
    const ofBase = owners.get(base)
    const ofForm = owners.get(derived)
    const foreign = [...ofForm.keys()].filter((f) => !ofBase.has(f))
    if (!foreign.length) continue
    // In EVERY foreign family, does the derived form appear only as a modifier?
    let headSomewhere = false
    const detail = []
    for (const f of foreign) {
      for (const term of ofForm.get(f)) {
        const words = term.split(' ')
        const isHeadOrWhole = words.length === 1 || words[0] === derived
        if (isHeadOrWhole) headSomewhere = true
        detail.push(`${f}:«${term}»${isHeadOrWhole ? ' [HEAD]' : ' [modifier]'}`)
      }
    }
    rows.push({ base, derived, headSomewhere, detail })
  }
}
for (const r of rows.sort((a, b) => Number(a.headSomewhere) - Number(b.headSomewhere))) {
  console.log(`  ${r.headSomewhere ? 'keep REFUSE (head-to-head)' : 'could ALLOW (modifier-only)'}  ${r.base} -> ${r.derived}`)
  console.log(`      ${r.detail.slice(0, 3).join(' ; ')}`)
}
const allowable = rows.filter((r) => !r.headSomewhere)
console.log(`\nrefused ${rows.length}  of which modifier-only (candidate ALLOW) ${allowable.length}  head-to-head (keep refusing) ${rows.length - allowable.length}`)

await server.close()
