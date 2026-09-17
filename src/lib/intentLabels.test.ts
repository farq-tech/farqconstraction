import { describe, expect, it } from 'vitest'
import { intentLabelAr } from './intentLabels'
import { buildOntologyResolution } from './canonicalIntent'
import { isKnownIntentId } from './procurementOntology'
import { isStaleBundleError } from './parseBoq'

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

describe('a stale page is not a statement about the booklet', () => {
  it('recognises the dynamic-import failure in every browser wording', () => {
    expect(isStaleBundleError('pdfjs-dist: Failed to fetch dynamically imported module: https://x/assets/pdf-BPOO2IQW.js')).toBe(true)
    expect(isStaleBundleError('error loading dynamically imported module')).toBe(true)
    expect(isStaleBundleError('Importing a module script failed.')).toBe(true)
  })
  it('does not swallow a real extraction failure', () => {
    expect(isStaleBundleError('Invalid PDF structure')).toBe(false)
    expect(isStaleBundleError('')).toBe(false)
    expect(isStaleBundleError(null)).toBe(false)
  })
})
