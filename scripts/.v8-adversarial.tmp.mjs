/**
 * Adversarial probe against the v8 supply-side chokepoint.
 *
 * Three questions, each written to break a specific promise:
 *   A. can a POSITIVE claim still land without passing `bestHit`?
 *   B. can an EXCLUSION be defeated by burying it in a clause? (raw on purpose)
 *   C. does `extractFacets` — which splits supplier pools — behave?
 */
import { createServer } from 'vite'

const server = await createServer({
  configFile: './vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})
const m = await server.ssrLoadModule('/src/lib/procurementOntology.ts')

const res = m.resolveOntology('رشاش حريق')
const profile = {
  search_terms: res.search_terms || [],
  supplier_terms: res.supplier_terms || [],
  preferred_archetypes: res.preferred_archetypes || [],
  allowed_archetypes: res.allowed_archetypes || [],
  hard_conflicts: res.hard_conflicts || [],
  soft_conflicts: res.soft_conflicts || [],
  negative_terms: res.negative_terms || [],
}
console.log(`line «رشاش حريق» -> ${res.level}@${res.confidence} ${res.family}/${res.intent}`)
console.log(`negative_terms (${profile.negative_terms.length}):`, profile.negative_terms.slice(0, 10).join(', '))

const show = (label, hay, want) => {
  const e = m.evaluateSupplier(hay, profile)
  const bad = want === 'reject' ? e.auto_tick : !e.auto_tick
  console.log(
    `  ${bad ? 'XX' : 'ok'}  ${label.padEnd(46)} ${e.verdict.padEnd(13)} auto_tick=${String(e.auto_tick).padEnd(5)} score=${e.score}`,
  )
}

console.log('\nA. POSITIVE CLAIMS — can one land without passing bestHit?')
show('baseline: real fire supplier', 'مؤسسة الحماية من الحريق - رشاشات حريق ومضخات', 'accept')
show('v7 attack: clause burial (مادة)', 'مؤسسة الري الحديث - شبكات ري مادة رشاش حريق', 'reject')
show('v7 attack: clause burial (تصنيف)', 'مصنع دهانات - دهان مقاوم للحريق تصنيف رشاش حريق', 'reject')
// NEW: the clause rule deliberately does not open a clause at index 0, so a
// haystack that LEADS with the attribute keyword has no clause at all.
show('NEW: keyword at position 0', 'تصنيف رشاش حريق - مؤسسة الري الحديث للزراعة', 'reject')
show('NEW: keyword at 0, paint factory', 'مادة رشاش حريق - مصنع دهانات وبويات', 'reject')
// NEW: burial behind a word that is not a clause key at all.
show('NEW: non-clause burial (يشبه)', 'مؤسسة الري الحديث - منتج يشبه رشاش حريق', 'reject')
show('NEW: negation, unmodelled', 'مؤسسة الري الحديث - لا نورد رشاشات حريق', 'reject')

console.log('\nB. EXCLUSIONS — raw on purpose. Can a clause hide a disqualifier?')
const neg = profile.negative_terms[0]
if (neg) {
  show(`bare negative «${neg}»`, `مؤسسة ${neg} للتوريد`, 'reject')
  show(`negative inside clause (مادة ${neg})`, `مؤسسة توريد عامة مادة ${neg}`, 'reject')
  show(`negative inside clause (تصنيف ${neg})`, `شركة معدات تصنيف ${neg}`, 'reject')
}

console.log('\nC. FACETS — pool-splitting, guard-free. Does the clause rule hold?')
for (const line of [
  'رشاش حريق نحاس',
  'رشاش حريق مادة نحاس',
  'مواسير حديد مقاس 100 مم',
  'مواسير مادة حديد مقاس 100 مم',
]) {
  const r = m.resolveOntology(line)
  const facets = Object.entries(r.pool_affecting_facets || {})
  console.log(
    `  «${line}»`.padEnd(42),
    `${r.family}/${r.intent}`.padEnd(34),
    'pool_facets=' + (facets.length ? facets.map(([k, v]) => `${k}=${v}`).join(',') : '(none)'),
  )
}

await server.close()
