import { createServer } from 'vite'
const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const m = await server.ssrLoadModule('/src/lib/procurementOntology.ts')

const res = m.resolveOntology('رشاش حريق')
const profile = {
  search_terms: res.search_terms || [], supplier_terms: res.supplier_terms || [],
  preferred_archetypes: res.preferred_archetypes || [], allowed_archetypes: res.allowed_archetypes || [],
  hard_conflicts: res.hard_conflicts || [], soft_conflicts: res.soft_conflicts || [], negative_terms: res.negative_terms || [],
}

// Is «من» — a v7 PREPOSITION_CLAUSE_KEY meant for BOQ lines — eating the claim
// of any supplier whose own name contains it? Company names use «من» constantly.
console.log('HYPOTHESIS: the demand-side clause vocabulary is being applied to supplier prose.')
for (const hay of [
  'مؤسسة الحماية من الحريق - رشاشات حريق ومضخات',   // «من» present
  'مؤسسة الحماية ضد الحريق - رشاشات حريق ومضخات',   // «ضد» instead
  'مؤسسة الحماية الحريق - رشاشات حريق ومضخات',      // no preposition
  'رشاشات حريق ومضخات - مؤسسة الحماية من الحريق',   // «من» after the claim
  'شركة مكافحة الحرائق في الرياض - رشاشات حريق',    // «في» present
  'مصنع رشاشات حريق معتمد',                          // clean
]) {
  const e = m.evaluateSupplier(hay, profile)
  console.log(`  ${e.verdict.padEnd(12)} auto_tick=${String(e.auto_tick).padEnd(5)} score=${String(e.score).padEnd(3)} matched=${e.matched_terms.length}  «${hay}»`)
}

// The exclusion path is raw ON PURPOSE. Find an intent that actually carries
// negative_terms so the promise can be tested rather than assumed.
console.log('\nB. EXCLUSION PATH — find a profile with negative_terms and try to bury them.')
let found = null
for (const probe of ['مرشح مياه', 'فلتر', 'مقياس ضغط', 'صاج', 'قطاع حديد', 'ماسورة', 'كابل', 'بلاطة سقف معدني', 'مواسير', 'باب زجاج']) {
  const r = m.resolveOntology(probe)
  if ((r.negative_terms || []).length) { found = { probe, r }; break }
}
if (!found) console.log('  no probed intent carries negative_terms — the raw path is UNEXERCISED here')
else {
  const p = {
    search_terms: found.r.search_terms || [], supplier_terms: found.r.supplier_terms || [],
    preferred_archetypes: found.r.preferred_archetypes || [], allowed_archetypes: found.r.allowed_archetypes || [],
    hard_conflicts: found.r.hard_conflicts || [], soft_conflicts: found.r.soft_conflicts || [], negative_terms: found.r.negative_terms || [],
  }
  const neg = p.negative_terms[0]
  console.log(`  using «${found.probe}» -> ${found.r.family}/${found.r.intent}; negative «${neg}»`)
  for (const hay of [`مؤسسة ${neg} للتوريد`, `مؤسسة توريد عامة مادة ${neg}`, `شركة معدات تصنيف ${neg}`, `مورد من ${neg} بالرياض`]) {
    const e = m.evaluateSupplier(hay, p)
    console.log(`    ${e.verdict.padEnd(12)} reasons=${e.reasons.join(';')}  «${hay}»`)
  }
}
await server.close()
