import { describe, expect, it } from 'vitest'
import type { ConstructionComparison, ConstructionRfq } from '../api/constructionClient'
import { awardBlockReason, awardReviewSignature, pricedAwardLineIds, type AwardOffer } from './awardFlow'

const rfq = { id: 'r1', status: 'CLOSED', invitations: [], supplier_count: 1, response_count: 1, created_at: '' } satisfies ConstructionRfq
const offer: AwardOffer = { supplier: { id: 's1' }, offer: { quoteVersionId: 'q1', totals: { total: 100 }, currency: 'SAR' }, eligibility: { eligible: true } }
const comparison: ConstructionComparison = { rfq, supplier_responses: [offer], awaiting_supplier_ids: [], quote_matrix: { basis: '', requested_line_count: 3, supplier_count: 1, complete_quote_count: 0, lines: ['PRICED', 'UNAVAILABLE', 'QUANTITY_MISMATCH'].map((status, index) => ({ id: `l${index}`, name_ar: '', quantity: 1, uom: '', offers: [{ supplier_id: 's1', status, unit_price: 100, line_total: 100, quantity: 1, currency: 'SAR', prices_include_tax: false }] })) } }

describe('award review guards', () => {
  it('accepts an identified eligible offer, without selecting another quote', () => { expect(awardBlockReason(rfq, offer)).toBeNull() })
  it('rejects a draft, cancelled or already awarded request', () => {
    for (const status of ['DRAFT', 'DRAFT_NOT_SENT', 'CANCELLED']) expect(awardBlockReason({ ...rfq, status }, offer)).not.toBeNull()
    expect(awardBlockReason({ ...rfq, award: { id: 'a', status: 'APPROVED' } }, offer)).not.toBeNull()
    expect(awardBlockReason({ ...rfq, award: { id: 'a', status: 'CANCELLED' } }, offer)).toBeNull()
  })
  it('requires closed submissions before award', () => { expect(awardBlockReason({ ...rfq, status: 'SENT' }, offer)).toContain('أغلق استلام العروض') })
  it('never substitutes an offer id for a missing quote-version id', () => { expect(awardBlockReason(rfq, { ...offer, offer: { offerId: 'q1', totals: { total: 100 } } })).not.toBeNull() })
  it('rejects absent, nonfinite and negative totals and ineligible offers', () => {
    for (const total of [undefined, NaN, Infinity, -1, 0]) expect(awardBlockReason(rfq, { ...offer, offer: { ...offer.offer, totals: { total } } })).not.toBeNull()
    expect(awardBlockReason(rfq, { ...offer, eligibility: { eligible: false } })).not.toBeNull()
  })
  it('awards only comparable priced lines for the selected supplier', () => {
    expect(pricedAwardLineIds(comparison, 's1')).toEqual(['l0'])
    expect(pricedAwardLineIds(comparison, 'another')).toEqual([])
    expect(pricedAwardLineIds({ ...comparison, quote_matrix: undefined }, 's1')).toEqual([])
  })
  it('detects quote revisions, tax changes and changed scope before submission', () => {
    const signature = awardReviewSignature(comparison, offer)
    expect(awardReviewSignature(structuredClone(comparison), structuredClone(offer))).toBe(signature)
    expect(awardReviewSignature(comparison, { ...offer, offer: { ...offer.offer, totals: { total: 101 } } })).not.toBe(signature)
    expect(awardReviewSignature(comparison, { ...offer, offer: { ...offer.offer, prices_include_tax: true } })).not.toBe(signature)
    const changed = structuredClone(comparison)
    changed.quote_matrix!.lines[0]!.offers[0]!.status = 'UNAVAILABLE'
    expect(awardReviewSignature(changed, offer)).not.toBe(signature)
  })
})
