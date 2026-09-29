import { describe, expect, it } from 'vitest'
import {
  EMPTY_SITE_SUPPLY,
  cleanSpecCard,
  perUnitFromSaleUnit,
  siteSupplyPayload,
  siteSupplyProblems,
  specCardSummary,
  storedSiteSupplyFacts,
  validLink,
} from './specCard'
import { buildRfqLinesFromItems } from './rfqPackages'
import type { BOQItem } from '../types'

const item = (partial: Partial<BOQItem> & Pick<BOQItem, 'id' | 'name'>): BOQItem => ({
  qty: '1',
  unit: 'عدد',
  status: 'ready',
  supplierCount: 0,
  suppliers: [],
  ...partial,
})

describe('spec card', () => {
  it('an empty card sends nothing; a filled one is trimmed and bad links are dropped', () => {
    expect(cleanSpecCard(undefined)).toBeUndefined()
    expect(cleanSpecCard({ brand: '  ', any_approved_brand: false, sale_units: [] })).toBeUndefined()
    expect(
      cleanSpecCard({
        brand: ' Panasonic ',
        thickness: '0.6 مم',
        sale_units: [{ unit: 'BOX', pack_size: 100 }, { unit: 'PIECE', pack_size: 7 }],
        reference_photo_url: 'javascript:alert(1)',
      }),
    ).toEqual({ brand: 'Panasonic', thickness: '0.6 مم', sale_units: [{ unit: 'BOX', pack_size: 100 }, { unit: 'PIECE' }] })
  })

  it('reads as one line for the supplier', () => {
    expect(specCardSummary({ any_approved_brand: true, length: '3 م', sale_units: [{ unit: 'CARTON', pack_size: 12 }] })).toBe(
      'أي ماركة معتمدة • الطول: 3 م • وحدة البيع: كرتون 12',
    )
  })

  it('the line builder sends spec_card only when filled', () => {
    const lines = buildRfqLinesFromItems([
      item({ id: 1, name: 'فوم', specCard: { grade: 'B2', dimensions: '750 مل' } }),
      item({ id: 2, name: 'غراء' }),
    ])
    expect(lines[0].spec_card).toEqual({ grade: 'B2', dimensions: '750 مل' })
    expect('spec_card' in lines[1]).toBe(false)
  })
})

describe('site and supply', () => {
  it('blocks only malformed input', () => {
    expect(siteSupplyProblems(EMPTY_SITE_SUPPLY)).toEqual([])
    expect(siteSupplyProblems({ ...EMPTY_SITE_SUPPLY, mapUrl: 'مو رابط' })).toHaveLength(1)
    expect(siteSupplyProblems({ ...EMPTY_SITE_SUPPLY, paymentCode: 'CREDIT' })).toHaveLength(1)
    expect(siteSupplyProblems({ ...EMPTY_SITE_SUPPLY, paymentCode: 'CREDIT', creditDays: '30' })).toEqual([])
  })

  it('adds to the request body only what was filled', () => {
    expect(siteSupplyPayload(EMPTY_SITE_SUPPLY)).toEqual({ delivery: {}, commercial_terms: {} })
    expect(
      siteSupplyPayload({ ...EMPTY_SITE_SUPPLY, district: ' حي السلي ', mapUrl: 'https://maps.app.goo.gl/x', deliveryMode: 'EITHER', paymentCode: 'CREDIT', creditDays: '45' }),
    ).toEqual({
      delivery: { district: 'حي السلي', map_url: 'https://maps.app.goo.gl/x', mode: 'EITHER' },
      commercial_terms: { payment_terms_code: 'CREDIT', payment_terms: 'CREDIT', credit_days: 45 },
    })
  })

  it('an older stored request shows no extra facts', () => {
    expect(storedSiteSupplyFacts({ delivery: { city: 'الرياض' } })).toEqual([])
    expect(storedSiteSupplyFacts({ delivery: { district: 'حي النرجس', mode: 'PICKUP' }, commercial_terms: { payment_terms_code: 'CREDIT', credit_days: 30 } })).toEqual([
      'حي النرجس',
      'استلام من المورد',
      'الدفع: آجل 30 يوم',
    ])
  })

  it('validLink and the per-unit conversion match the API', () => {
    expect(validLink('data:x')).toBeNull()
    expect(perUnitFromSaleUnit(45, 100)).toBe(0.45)
    expect(perUnitFromSaleUnit(10, 3)).toBe(3.333333)
    expect(perUnitFromSaleUnit(10, 0)).toBeNull()
  })
})
