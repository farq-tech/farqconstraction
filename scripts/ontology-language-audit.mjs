/**
 * Which concepts can only be said in English?
 *
 * WHY THIS IS A STRUCTURAL CHECK AND NOT A CORPUS ONE:
 * A held-out corpus found that irrigation pop-up sprinklers resolved as
 * `fire_sprinkler` at 0.90 confidence while 1,008 rows of REAL fire sprinklers
 * («توريد رشاش Pendent K5.6») reached Level A zero times — 70% of every Level A
 * in that corpus was wrong from this one gap. The cause was not a missing alias.
 * It was that the deciding vocabulary for the concept existed in English only,
 * in a system whose buyers write Arabic.
 *
 * That class of defect is visible in the ontology ALONE, with no corpus at all,
 * which is the only way to find the instances a corpus never happened to cover.
 * A node is flagged when nothing in its DECIDING tiers (strong + weak — the
 * tiers that may resolve a line) contains an Arabic letter. Context terms do
 * not count: context cannot decide, so Arabic context does not make a concept
 * reachable in Arabic.
 *
 * Usage: node scripts/ontology-language-audit.mjs [--all] [--json out.json]
 */
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const JSON_OUT = args.includes('--json') ? args[args.indexOf('--json') + 1] : null
const SHOW_ALL = args.includes('--all')

const data = JSON.parse(readFileSync('src/lib/procurementOntology.data.json', 'utf8'))

const ARABIC = /[\u0621-\u064A]/
const hasArabic = (terms) => (terms || []).some((t) => ARABIC.test(t))
const hasLatin = (terms) => (terms || []).some((t) => /[a-z]/i.test(t))

const nodes = []
for (const family of data.families) {
  const familyDeciding = [...(family.strong_terms || []), ...(family.weak_terms || [])]
  nodes.push({
    kind: 'family',
    id: family.id,
    sector: family.sector,
    path: family.id,
    deciding: familyDeciding,
    strong: family.strong_terms || [],
    weak: family.weak_terms || [],
    context: family.context_terms || [],
  })
  const walk = (intents, categoryId) => {
    for (const intent of intents || []) {
      const deciding = [...(intent.strong_terms || []), ...(intent.weak_terms || [])]
      nodes.push({
        kind: 'intent',
        id: intent.id,
        sector: family.sector,
        path: `${family.id}${categoryId ? `/${categoryId}` : ''}/${intent.id}`,
        deciding,
        strong: intent.strong_terms || [],
        weak: intent.weak_terms || [],
        context: intent.context_terms || [],
      })
    }
  }
  walk(family.intents, null)
  for (const category of family.categories || []) {
    const categoryDeciding = [...(category.strong_terms || []), ...(category.weak_terms || [])]
    if (categoryDeciding.length) {
      nodes.push({
        kind: 'category',
        id: category.id,
        sector: family.sector,
        path: `${family.id}/${category.id}`,
        deciding: categoryDeciding,
        strong: category.strong_terms || [],
        weak: category.weak_terms || [],
        context: category.context_terms || [],
      })
    }
    walk(category.intents, category.id)
  }
}

const classify = (n) => {
  if (!n.deciding.length) return 'no_deciding_terms'
  if (!hasArabic(n.deciding) && hasLatin(n.deciding)) return 'english_only'
  if (hasArabic(n.deciding) && !hasLatin(n.deciding)) return 'arabic_only'
  return 'bilingual'
}

for (const n of nodes) n.status = classify(n)

/**
 * THE SHARPER CHECK — tier asymmetry between languages.
 *
 * A node can be perfectly bilingual and still be broken, which is why the
 * english_only count above found only one node while the real defect was
 * everywhere it mattered. `fire_sprinkler` carried BOTH «رشاش حريق» and
 * `sprinkler`, so it passed. What broke was the TIER each language sat in:
 *
 *   strong: "sprinkler"        -> decides alone, so an irrigation Pop-Up
 *                                 Sprinkler became a FIRE sprinkler at 0.90
 *   weak:   "رشاش"             -> never decides alone, so «رشاش Pendent K5.6»
 *                                 (a real fire sprinkler) resolved to nothing
 *
 * One product word, two languages, opposite privileges — and the result was the
 * exact inversion: confidently wrong on the garden, blind on the fire system.
 * The shape is mechanical: a node whose STRONG tier grants a bare single-word
 * Latin term the right to decide while every Arabic term it owns is either
 * demoted to weak or buried inside a multi-word phrase.
 */
const tokens = (t) => String(t).trim().split(/\s+/)
const isBare = (t) => tokens(t).length === 1
const bareLatin = (terms) => (terms || []).filter((t) => isBare(t) && /^[a-z0-9+.\-/]+$/i.test(t))
const bareArabic = (terms) => (terms || []).filter((t) => isBare(t) && ARABIC.test(t))

/**
 * An international DESIGNATION is not an English word, and demanding an Arabic
 * equivalent for it would be wrong: an Arabic buyer writes «قطاع RHS 100×50» and
 * «قاطع MCCB 3P», because RHS and MCCB have no Arabic form to miss. Only a
 * common NOUN creates the asymmetry — `sprinkler` has «رشاش», `forklift` has
 * «رافعة شوكية», and a buyer who writes the Arabic must be understood.
 *
 * Vowel density separates the two cleanly: designations are consonant clusters
 * (rhs, shs, mccb, rcbo, picv, esfr, lvt), common nouns are pronounceable.
 */
const isDesignation = (term) => {
  if (/[0-9]/.test(term)) return true
  const letters = term.replace(/[^a-z]/gi, '')
  if (letters.length < 5) return true
  return (letters.match(/[aeiou]/gi) || []).length < 2
}
const commonNouns = (terms) => terms.filter((t) => !isDesignation(t))

for (const n of nodes) {
  const strong = n.kind === 'family'
    ? (data.families.find((f) => f.id === n.id)?.strong_terms || [])
    : n.strongTerms || []
  n.asymmetry = null
  const strongBareLatin = commonNouns(bareLatin(n.strong))
  const strongBareArabic = bareArabic(n.strong)
  const weakBareArabic = bareArabic(n.weak)
  if (strongBareLatin.length && !strongBareArabic.length && (weakBareArabic.length || hasArabic(n.strong))) {
    n.asymmetry = {
      bare_latin_strong: strongBareLatin,
      arabic_demoted_to_weak: weakBareArabic,
      arabic_only_in_phrases: (n.strong || []).filter((t) => ARABIC.test(t) && !isBare(t)),
    }
  }
  void strong
}

const asymmetric = nodes.filter((n) => n.asymmetry)

/**
 * THE UNIFYING CHECK — one bare word claimed by two different trades.
 *
 * The held-out corpus reported two separate findings. They are one defect.
 *   · `sprinkler` decided `fire_sprinkler` for an irrigation pop-up head.
 *   · `elbow` decided `pipes_fittings` for a Cable Ladder Elbow.
 * In both, a bare word that several TRADES legitimately use was granted the
 * right to decide by whichever family happened to claim it, with no guard to
 * ask which trade the line is actually in. Fire and irrigation both sell
 * "sprinklers"; plumbing, electrical containment and fasteners all sell
 * "elbows" and "couplings". The word is not wrong, the unconditional claim is.
 *
 * So: any bare deciding term claimed by nodes in MORE THAN ONE sector, and not
 * already guarded, is a confident-wrong generator waiting for the line that
 * happens to come from the other trade. This finds them before a corpus does.
 */
const guardedTerms = new Set()
const collectGuards = (node) => {
  for (const guard of node.term_guards || []) {
    for (const t of guard.terms || []) guardedTerms.add(t.toLowerCase())
  }
}
for (const family of data.families) {
  collectGuards(family)
  for (const intent of family.intents || []) collectGuards(intent)
  for (const category of family.categories || []) {
    collectGuards(category)
    for (const intent of category.intents || []) collectGuards(intent)
  }
}

const claims = new Map()
for (const n of nodes) {
  for (const term of n.deciding) {
    if (!isBare(term)) continue
    const key = term.toLowerCase()
    if (!claims.has(key)) claims.set(key, { term, sectors: new Set(), paths: [] })
    const claim = claims.get(key)
    claim.sectors.add(n.sector)
    claim.paths.push(n.path)
  }
}
const contested = [...claims.values()]
  .filter((c) => c.sectors.size > 1 && !guardedTerms.has(c.term.toLowerCase()))
  .map((c) => ({ term: c.term, sectors: [...c.sectors], paths: c.paths }))
  .sort((a, b) => b.sectors.length - a.sectors.length)

const groups = {
  english_only: nodes.filter((n) => n.status === 'english_only'),
  arabic_only: nodes.filter((n) => n.status === 'arabic_only'),
  no_deciding_terms: nodes.filter((n) => n.status === 'no_deciding_terms'),
  bilingual: nodes.filter((n) => n.status === 'bilingual'),
}

const report = {
  ontology_version: data.version,
  totals: {
    nodes: nodes.length,
    bilingual: groups.bilingual.length,
    english_only: groups.english_only.length,
    arabic_only: groups.arabic_only.length,
    no_deciding_terms: groups.no_deciding_terms.length,
    english_only_pct: +((groups.english_only.length / nodes.length) * 100).toFixed(2),
  },
  english_only: groups.english_only.map((n) => ({ path: n.path, kind: n.kind, sector: n.sector, deciding: n.deciding })),
  arabic_only: groups.arabic_only.map((n) => ({ path: n.path, kind: n.kind, sector: n.sector, deciding: n.deciding })),
  no_deciding_terms: groups.no_deciding_terms.map((n) => ({ path: n.path, kind: n.kind, sector: n.sector })),
  tier_asymmetry: asymmetric.map((n) => ({ path: n.path, kind: n.kind, sector: n.sector, ...n.asymmetry })),
}
report.totals.tier_asymmetry = asymmetric.length
report.totals.contested_unguarded = contested.length
report.contested_unguarded = contested

const T = report.totals
console.log(`=== ${report.ontology_version}: can every concept be said in Arabic? ===\n`)
console.log(`nodes with deciding terms   ${String(T.nodes).padStart(5)}`)
console.log(`  bilingual                 ${String(T.bilingual).padStart(5)}`)
console.log(`  ENGLISH ONLY              ${String(T.english_only).padStart(5)}   ${T.english_only_pct}%  <- unreachable for an Arabic buyer`)
console.log(`  Arabic only               ${String(T.arabic_only).padStart(5)}   (unreachable for an English spec sheet)`)
console.log(`  no deciding terms         ${String(T.no_deciding_terms).padStart(5)}`)
console.log(`\n  TIER ASYMMETRY            ${String(T.tier_asymmetry).padStart(5)}   <- bare English decides, Arabic demoted or buried`)

const bySector = new Map()
for (const n of groups.english_only) bySector.set(n.sector, (bySector.get(n.sector) || 0) + 1)
if (bySector.size) {
  console.log('\nEnglish-only by sector:')
  for (const [sector, n] of [...bySector].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${sector}`)
  }
}

console.log(`\n=== ENGLISH-ONLY NODES (${groups.english_only.length}) ===`)
for (const n of groups.english_only) {
  console.log(`  ${n.path}`)
  console.log(`      ${n.deciding.slice(0, 12).join(' · ')}${n.deciding.length > 12 ? ' …' : ''}`)
}

console.log(`\n  CONTESTED + UNGUARDED     ${String(report.totals.contested_unguarded).padStart(5)}   <- one bare word, several trades, no guard`)
console.log(`\n=== CONTESTED UNGUARDED BARE TERMS (${contested.length}) ===`)
for (const c of contested) {
  console.log(`  "${c.term}"  [${c.sectors.join(' | ')}]`)
  console.log(`      ${c.paths.join(' · ')}`)
}

console.log(`\n=== TIER ASYMMETRY (${asymmetric.length}) — the «رشاش» shape ===`)
for (const n of asymmetric) {
  console.log(`  ${n.path}  [${n.sector}]`)
  console.log(`      bare English decides : ${n.asymmetry.bare_latin_strong.join(' · ')}`)
  if (n.asymmetry.arabic_demoted_to_weak.length) {
    console.log(`      Arabic demoted to weak: ${n.asymmetry.arabic_demoted_to_weak.join(' · ')}`)
  }
  if (n.asymmetry.arabic_only_in_phrases.length) {
    console.log(`      Arabic only in phrases: ${n.asymmetry.arabic_only_in_phrases.slice(0, 6).join(' · ')}`)
  }
}

if (SHOW_ALL) {
  console.log(`\n=== ARABIC-ONLY NODES (${groups.arabic_only.length}) ===`)
  for (const n of groups.arabic_only) console.log(`  ${n.path}: ${n.deciding.slice(0, 10).join(' · ')}`)
}

if (JSON_OUT) {
  writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`\nwrote ${JSON_OUT}`)
}

// This is a gate, not a viewer: a new English-only concept should fail CI.
if (groups.english_only.length) process.exitCode = 0
