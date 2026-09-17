/**
 * Candidate separating signal #2: SECTOR DISTANCE.
 *
 * The risk the engine actually cares about is cross-TRADE misrouting — sending
 * an RFQ to a supplier in the wrong business. So: allow a derivation when every
 * foreign owner of the derived form sits in a sector the base already occupies;
 * refuse when a foreign owner is in a different sector.
 *
 * If this separates «زجاج»→«زجاجي» (allow) from «شبك»→«شبكي» (refuse) with no
 * human deciding, the boundary is a wall at the current level of description,
 * not a wall.
 */
import { createServer } from 'vite'
import { readFileSync } from 'node:fs'

const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const m = await server.ssrLoadModule('/src/lib/procurementOntology.ts')
const DATA = JSON.parse(readFileSync('src/lib/procurementOntology.data.json', 'utf8'))

const sectorOf = new Map(DATA.families.map((f) => [f.id, f.sector]))
const owners = new Map()
const singleWordTerms = new Map()
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
        for (const w of words) {
          if (!owners.has(w)) owners.set(w, new Map())
          if (!owners.get(w).has(family.id)) owners.get(w).set(family.id, new Set())
          owners.get(w).get(family.id).add(norm)
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

console.log('base -> derived | v10 gate | sector signal | foreign owners (sector)')
let agree = 0, differ = 0
const changes = []
for (const [term, fams] of [...singleWordTerms].sort()) {
  const base = stemOf(term)
  if (base !== term) continue
  const baseSectors = new Set([...fams].map((f) => sectorOf.get(f)))
  for (const suf of NISBA) {
    const derived = `${base}${suf}`
    const ofForm = owners.get(derived)
    if (!ofForm) continue
    const foreign = [...ofForm.keys()].filter((f) => !fams.has(f))
    const v10 = foreign.length === 0 ? 'ALLOW' : 'REFUSE'
    const crossSector = foreign.filter((f) => !baseSectors.has(sectorOf.get(f)))
    const signal = crossSector.length === 0 ? 'ALLOW' : 'REFUSE'
    if (v10 === signal) agree++; else { differ++; changes.push({ term, derived, v10, signal }) }
    console.log(
      `  ${term} -> ${derived}`.padEnd(30) +
      `| ${v10.padEnd(6)} | ${signal.padEnd(6)} | ` +
      foreign.map((f) => `${f}(${sectorOf.get(f)})`).join(' + '),
    )
  }
}
console.log(`\nbase sectors are compared against foreign owners' sectors.`)
console.log(`agree ${agree}  differ ${differ}`)
console.log('\nwhere the sector signal would change the gate:')
for (const c of changes) console.log(`  «${c.term}» -> «${c.derived}»  v10=${c.v10}  sector-signal=${c.signal}`)

await server.close()
