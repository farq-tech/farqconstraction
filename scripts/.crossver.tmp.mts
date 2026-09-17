/**
 * THE SPLIT-LANDING HAZARD, measured rather than asserted.
 *
 * v9 moved the clause rule into the payload and v10 moved morphology. So the
 * resolver now READS rules it used to carry. This asks what a v10 resolver does
 * when it is paired with a v6 payload — the state production would be in if the
 * two files landed in separate commits.
 */
// @ts-expect-error runtime import of a cross-version pairing
const m = await import('/tmp/crossver/src/lib/procurementOntology.ts')
console.log('  version the pairing REPORTS:', m.ONTOLOGY_VERSION)
console.log('  clause_rule found in payload:', Boolean(m.CLAUSE_RULE?.attribute_clause_keys?.length))

const probes: Array<[string, string, string]> = [
  ['وصلة PPR Elbow مقاس 50 مم ربط Solvent Cement', 'solvent', '1,984 pipe fittings -> lubricants'],
  ['VCD Opposed Blade مادة Aluminium', 'aluminium', '331 dampers -> facade cladding'],
  ['Backflow Preventer توصيل Lug', 'lug', '64 backflow preventers -> cable lugs'],
]
for (const [text, term, why] of probes) {
  let d: unknown
  try {
    d = m.termDecidesIn(text, term, 'boq_line')
  } catch (e) {
    d = `THREW: ${(e as Error).message}`
  }
  console.log(`  decides=${String(d).padEnd(6)} «${term}»  <-  ${why}`)
}
