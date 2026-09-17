import { describe, expect, it } from 'vitest'
import { intentLabelAr } from './intentLabels'
import { buildOntologyResolution } from './canonicalIntent'
import { isKnownIntentId } from './procurementOntology'

describe('what the booklet match now sends, and how it is labelled', () => {
  it('labels an intent id from the ontology data, and falls back to the id', () => {
    expect(intentLabelAr('handrail_balustrade')).toBe('الدرابزين والحواجز')
    expect(intentLabelAr('not_an_intent')).toBe('not_an_intent')
    expect(intentLabelAr(null)).toBe('')
  })

  it('names the owner\'s test line with an id the ontology recognises', () => {
    const wire = buildOntologyResolution('درابزين حديدي')
    expect(wire?.canonical_intent_id).toBe('handrail_balustrade')
    expect(wire?.not_supply).toBe(false)
  })

  it('never sends an id the ontology does not know', () => {
    for (const line of ['باب خشب', 'مراحيض', 'بلوكات حرارية', 'أسمنت بورتلاندي', 'شيء غامض تمامًا']) {
      const id = buildOntologyResolution(line)?.canonical_intent_id
      if (id) expect(isKnownIntentId(id)).toBe(true)
    }
  })

  it('sends nothing for an empty line rather than inventing a verdict', () => {
    expect(buildOntologyResolution('')).toBeNull()
  })
})
