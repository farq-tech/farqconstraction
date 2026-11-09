import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveOntology } from './procurementOntology'

/**
 * cpo-v14 — the wider dictionary's measured BOQ probes. Kept in a separate
 * worker from the ontology's structural/property suite because resolving the
 * whole catalogue retains compiled term regexes in the resolver's process-wide
 * cache. Every fixture assertion remains active in the normal Vitest run.
 */
describe('cpo-v14: the wider dictionary keeps its probes', () => {
  const { probes } = JSON.parse(
    readFileSync(new URL('../../fixtures/ontology/cpo-v14-probes.json', import.meta.url), 'utf8'),
  ) as {
    probes: Array<{
      line: string
      expect_intent?: string
      expect_family?: string
      expect_not_intent?: string
      expect_not_family?: string
    }>
  }

  it('has a probe set', () => expect(probes.length).toBeGreaterThan(700))

  for (const probe of probes) {
    it(probe.line, () => {
      const result = resolveOntology(probe.line)
      if (probe.expect_intent) expect(result.intent, probe.line).toBe(probe.expect_intent)
      if (probe.expect_family) expect(result.family, probe.line).toBe(probe.expect_family)
      if (probe.expect_not_intent) expect(result.intent, probe.line).not.toBe(probe.expect_not_intent)
      if (probe.expect_not_family) expect(result.family, probe.line).not.toBe(probe.expect_not_family)
    })
  }
})
