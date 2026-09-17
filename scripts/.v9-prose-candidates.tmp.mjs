/**
 * Second derivation pass: if the BOQ openers do not transfer, what — if
 * anything — plays their role in company prose? Candidates are constructions
 * where a supplier MENTIONS a trade without CLAIMING it.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const raw = require('/Users/m4pro/farq/artifacts/atlas-supplier-enrichment/existing-suppliers.private.json')
const rows = Array.isArray(raw) ? raw : raw.suppliers || raw.rows || Object.values(raw)[0]

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

const texts = rows
  .map((r) => norm([r.name_ar, r.name_en, r.supplied_items_text, r.business_type].filter(Boolean).join(' ')))
  .filter(Boolean)

/** Constructions where a mention plausibly is NOT a claim. */
const CANDIDATES = [
  // exclusion
  'عدا', 'ما عدا', 'بدون', 'غير', 'باستثناء', 'except', 'excluding', 'other than',
  // reference to someone else's work
  'لصالح', 'عملاء', 'عميل', 'مشاريع سابقه', 'clients', 'projects for', 'supplied to',
  // likeness, not identity
  'مثل', 'مشابه', 'بديل', 'similar to', 'equivalent to', 'such as',
  // record field labels that could be concatenated in
  'النشاط', 'التصنيف', 'تصنيف', 'الفئه', 'القسم', 'نوع النشاط', 'activity', 'category', 'classification',
  // the BOQ words that were applied to prose
  'ماده', 'من', 'في', 'مع', 'عن', 'الى',
]

console.log(`corpus: ${texts.length} records\n`)
for (const c of CANDIDATES) {
  const n = norm(c)
  const re = new RegExp(`(?:^| )${n}(?= |$)`, 'g')
  let hits = 0
  const samples = []
  for (const t of texts) {
    re.lastIndex = 0
    if (!re.test(t)) continue
    hits++
    if (samples.length < 3) samples.push(t.slice(0, 74))
  }
  if (!hits) continue
  console.log(`  «${c}» ×${hits}`)
  for (const s of samples) console.log(`      ${s}`)
}
console.log(
  '\n  ZERO: ' +
    CANDIDATES.filter((c) => {
      const re = new RegExp(`(?:^| )${norm(c)}(?= |$)`)
      return !texts.some((t) => re.test(t))
    })
      .map((c) => `«${c}»`)
      .join(' '),
)
