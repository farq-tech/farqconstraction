/** The other half-landing: a v10 PAYLOAD under a v6 RESOLVER. */
// @ts-expect-error runtime import of a cross-version pairing
const m = await import('/tmp/crossver2/src/lib/procurementOntology.ts')
console.log('  version the pairing REPORTS:', m.ONTOLOGY_VERSION)
console.log('  exports termDecidesIn (added v9):', typeof m.termDecidesIn)
const probes: Array<[string, string, string]> = [
  ['لوحات توزيع كهربائية', 'لوحة', 'v10 feminine plural (want true)'],
  ['أرضيات إيبوكسي صناعية', 'ارض', 'v10 derivation gate (want false)'],
]
for (const [text, term, why] of probes) {
  console.log(`  termIndex=${String(m.termIndex(text, term)).padEnd(4)} «${term}»  <-  ${why}`)
}
for (const line of ['قاطع 32 امبير', 'باب زجاجي سحاب (منزلق)', 'لوحات توزيع']) {
  const r = m.resolveOntology(line)
  console.log(`  ${String(r.family ?? 'NULL').padEnd(22)}${String(r.intent ?? '-').padEnd(22)}@${r.confidence}  ::  ${line}`)
}
