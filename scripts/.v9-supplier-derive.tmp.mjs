/**
 * DERIVE THE SUPPLIER-PROSE CLAUSE VOCABULARY FROM REAL SUPPLIER DESCRIPTIONS.
 *
 * The BOQ openers were derived from 136 real booklet lines and falsified there.
 * They were then applied to company prose, which is a different register, and
 * they degraded it. So the same method is run again against the register that
 * actually matters here: 10,104 real supplier records.
 *
 * For each candidate opener the question is the one the rule exists to answer:
 * when this word appears, is what FOLLOWS it something other than this
 * supplier's own trade? In a BOQ line the answer is usually yes (it is an
 * attribute of the product). In company prose it may be the opposite.
 *
 *   node scripts/.v9-supplier-derive.tmp.mjs
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const CORPUS = '/Users/m4pro/farq/artifacts/atlas-supplier-enrichment/existing-suppliers.private.json'
const raw = require(CORPUS)
const rows = Array.isArray(raw) ? raw : raw.suppliers || raw.rows || Object.values(raw)[0]

/** The same normalization the resolver uses, inlined so this stays standalone. */
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

/** What `evaluateSupplier` actually receives in production: who they are + what they sell. */
const texts = rows
  .map((r) => norm([r.name_ar, r.name_en, r.supplied_items_text, r.business_type].filter(Boolean).join(' ')))
  .filter(Boolean)

console.log(`corpus: ${texts.length} supplier records\n`)

const CLAUSE = require('../src/lib/procurementOntology.data.json').clause_rule
const TOKENS = [
  ...CLAUSE.attribute_clause_keys.keys.filter((k) => /[\u0621-\u064A]/.test(k)),
  ...CLAUSE.preposition_clause_keys.keys.map((k) => k.key),
]
const PROCLITICS = CLAUSE.proclitic_clause_openers.openers.map((o) => o)

const countToken = (tok) => {
  let total = 0
  let atZero = 0
  const after = new Map()
  const re = new RegExp(`(?:^| )${tok}(?= |$)`, 'g')
  for (const t of texts) {
    let m
    re.lastIndex = 0
    while ((m = re.exec(t))) {
      total++
      if (m.index === 0) atZero++
      const rest = t.slice(m.index + m[0].length).trim().split(' ').slice(0, 2).join(' ')
      if (rest) after.set(rest, (after.get(rest) ?? 0) + 1)
    }
  }
  return { total, atZero, after }
}

const countProclitic = ({ prefix, min_stem }) => {
  let total = 0
  let atZero = 0
  const after = new Map()
  for (const t of texts) {
    for (const word of t.split(' ')) {
      if (!word.startsWith(prefix)) continue
      if (word.length - prefix.length < min_stem) continue
      total++
      if (t.startsWith(word)) atZero++
      after.set(word, (after.get(word) ?? 0) + 1)
    }
  }
  return { total, atZero, after }
}

const top = (map, n = 6) =>
  [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${k}×${v}`)
    .join(' · ')

console.log('=== STANDALONE TOKENS (BOQ attribute keys + prepositions) ===')
const rankedTok = TOKENS.map((tok) => [tok, countToken(tok)]).sort((a, b) => b[1].total - a[1].total)
for (const [tok, c] of rankedTok) {
  if (!c.total) continue
  console.log(`  «${tok}»  hits=${String(c.total).padStart(5)}  at_index_0=${String(c.atZero).padStart(4)}`)
  console.log(`      follows: ${top(c.after)}`)
}
console.log('\n  ZERO HITS: ' + rankedTok.filter(([, c]) => !c.total).map(([t]) => `«${t}»`).join(' '))

console.log('\n=== PROCLITICS ===')
for (const p of PROCLITICS) {
  const c = countProclitic(p)
  console.log(`  «${p.prefix}»  hits=${String(c.total).padStart(5)}  at_index_0=${String(c.atZero).padStart(4)}`)
  console.log(`      words: ${top(c.after, 8)}`)
}
