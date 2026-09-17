/**
 * Bypass probe: does the SUPPLY side honour the two eligibility rules that the
 * demand side now funnels through `bestHit`?
 *
 * `evaluateSupplier` and `classifySupplierArchetypes` call `termIndex` directly,
 * so a term sitting inside an attribute clause — or guarded out on the demand
 * side — still scores, and can return `auto_tick: true`.
 */
import { createServer } from 'vite'

const server = await createServer({
  configFile: './vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})
const m = await server.ssrLoadModule('/src/lib/procurementOntology.ts')

const line = 'رشاش حريق'
const res = m.resolveOntology(line)
console.log(`DEMAND SIDE: «${line}» -> ${res.level}@${res.confidence} ${res.family}/${res.intent}`)

const profile = {
  search_terms: res.search_terms || [],
  supplier_terms: res.supplier_terms || [],
  preferred_archetypes: res.preferred_archetypes || [],
  allowed_archetypes: res.allowed_archetypes || [],
  hard_conflicts: res.hard_conflicts || [],
  soft_conflicts: res.soft_conflicts || [],
  negative_terms: res.negative_terms || [],
}
console.log('  preferred archetypes:', profile.preferred_archetypes.join(', ') || '(none)')
console.log('  search terms        :', profile.search_terms.slice(0, 8).join(', '))

// Each haystack is a plausible supplier self-description. The question is
// whether an irrigation company can be auto-ticked for a FIRE sprinkler line.
const suppliers = [
  ['fire company (should PASS)', 'مؤسسة الحماية من الحريق - توريد وتركيب رشاشات حريق ومضخات'],
  ['irrigation co, bare', 'مؤسسة الري الحديث - شبكات ري وزراعة'],
  ['irrigation co naming sprinklers', 'مؤسسة الري الحديث - توريد شبكات ري بالرشاشات'],
  ['irrigation co, attribute clause', 'مؤسسة الري الحديث - شبكات ري مادة رشاش حريق'],
  ['paint co, clause mention', 'مصنع دهانات - دهان مقاوم للحريق تصنيف رشاش حريق'],
  ['English irrigation', 'Modern Irrigation Est. - irrigation sprinkler head supplier'],
]

console.log('\nSUPPLY SIDE (evaluateSupplier — raw termIndex, no guards, no clause rule):')
for (const [label, hay] of suppliers) {
  const e = m.evaluateSupplier(hay, profile)
  console.log(
    `  ${label.padEnd(32)} ${e.verdict.padEnd(13)} auto_tick=${String(e.auto_tick).padEnd(5)} score=${String(e.score).padEnd(3)} matched=${e.matched_terms.slice(0, 4).join(',')}`,
  )
}

await server.close()
