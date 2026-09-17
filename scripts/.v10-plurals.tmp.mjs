/**
 * The precision cost, checked rather than assumed.
 *
 * A generated form is only harmful if it is a REAL Arabic word with a different
 * meaning. "Real" is decided by data, not by me: 183,942 archive lines plus the
 * booklet are the dictionary. If a generated form never occurs in ~184k lines of
 * real Saudi BOQ prose, "inert" is measured. If it does occur, I read the line
 * it occurs in and check whether it belongs to the term's trade.
 */
import { createServer } from 'vite'
import { readFileSync, existsSync } from 'node:fs'

const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true, ws: false }, appType: 'custom', logLevel: 'error' })
const m = await server.ssrLoadModule('/scripts/.tmp-vers/v10/procurementOntology.ts')
const data = JSON.parse(readFileSync('scripts/.tmp-vers/v10/procurementOntology.data.json', 'utf8'))

// Rebuild the generation rule exactly as the resolver applies it.
const NISBA = ['يات', 'يين', 'يه', 'ي']
const stemOf = (w) => { for (const s of NISBA) if (w.endsWith(s) && w.length - s.length >= 3) return w.slice(0, -s.length); return w }
const owners = new Map()
const wordsOfFamily = new Map()
for (const family of data.families) {
  const walk = (node) => {
    for (const tier of ['strong_terms', 'weak_terms']) {
      for (const t of node[tier] ?? []) {
        for (const w of m.normalizeProcurementText(t).split(' ').filter(Boolean)) {
          if (!owners.has(w)) owners.set(w, new Set())
          owners.get(w).add(family.id)
          if (!wordsOfFamily.has(family.id)) wordsOfFamily.set(family.id, new Set())
          wordsOfFamily.get(family.id).add(w)
        }
      }
    }
    for (const c of node.categories ?? []) walk(c)
    for (const i of node.intents ?? []) walk(i)
  }
  walk(family)
}
const hasFeminine = new Set()
for (const w of owners.keys()) if (w.endsWith('ه') && owners.has(w.slice(0, -1))) hasFeminine.add(w.slice(0, -1))

// The sound plural, generated whether or not the word takes it.
const generated = new Map() // form -> Set(source word)
for (const w of owners.keys()) {
  if (!/[\u0621-\u064A]/.test(w[0] || '')) continue
  const stem = stemOf(w)
  let form = null
  if (w.endsWith('ه')) form = `${w.slice(0, -1)}ات`
  else if (!hasFeminine.has(stem)) form = `${stem}ات`
  if (!form || form === w) continue
  if (owners.has(form)) continue // already vocabulary: covered by the collision audit
  if (!generated.has(form)) generated.set(form, new Set())
  generated.get(form).add(w)
}
console.log(`generated sound-plural forms that are NOT already vocabulary: ${generated.size}`)

// The dictionary: every token in the real corpora.
const corpora = ['fixtures/boq/heldout-b11-20.full.flat.txt', 'fixtures/boq/heldout-b3-10.full.flat.txt', 'fixtures/boq/reference-booklet-68.shortform.txt']
const tokenLines = new Map() // token -> sample lines
let lineCount = 0
for (const p of corpora) {
  if (!existsSync(p)) continue
  for (const raw of readFileSync(p, 'utf8').split('\n')) {
    if (!raw.trim()) continue
    lineCount++
    const norm = m.normalizeProcurementText(raw)
    for (const tok of new Set(norm.split(' ').filter(Boolean))) {
      if (!tokenLines.has(tok)) tokenLines.set(tok, [])
      if (tokenLines.get(tok).length < 3) tokenLines.get(tok).push(norm)
    }
  }
}
console.log(`dictionary built from ${lineCount} real lines, ${tokenLines.size} distinct tokens\n`)

const occurring = [...generated.keys()].filter((f) => tokenLines.has(f))
console.log(`generated forms that OCCUR in real prose: ${occurring.length} of ${generated.size}`)
console.log(`generated forms that never occur (measured inert): ${generated.size - occurring.length}\n`)

// For the ones that do occur, does the source term's family fit the line?
for (const form of occurring) {
  const sources = [...generated.get(form)]
  const fams = new Set(sources.flatMap((s) => [...(owners.get(s) ?? [])]))
  console.log(`  «${form}»  generated from ${sources.map((s) => `«${s}»`).join(', ')}  owned by ${[...fams].join(', ')}`)
  for (const line of tokenLines.get(form).slice(0, 2)) {
    const r = m.resolveOntology(line)
    console.log(`      line: ${line.slice(0, 90)}`)
    console.log(`      resolves: ${r?.family ?? 'unresolved'}/${r?.intent ?? '-'} (${r?.level_code}, pool=${r?.poolable})  source-family fits: ${fams.has(r?.family) ? 'YES' : 'no'}`)
  }
}

await server.close()
