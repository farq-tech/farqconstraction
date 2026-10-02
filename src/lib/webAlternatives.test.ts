import { describe, expect, it } from 'vitest'
import {
  canSearch,
  hiddenCount,
  matchStateLabel,
  priceText,
  safeLink,
  visibleAlternatives,
  webStatusNote,
  type WebAlternative,
} from './webAlternatives'
import { resolveServices } from './services'

const alt = (state: WebAlternative['match_state'], extra: Partial<WebAlternative> = {}): WebAlternative => ({
  product_master_id: null, brand: 'B', manufacturer: null, product_name: 'P', model: null, sku: null,
  match_state: state, match_confidence: 1, match_reasons: [], rejection_reasons: [], missing_critical_attributes: [],
  matched_attrs: [], missing_attrs: [], source_url: 'https://maker.example/p', source_domain: 'maker.example', source_type: 'MANUFACTURER',
  source_type_ar: 'موقع الشركة المصنّعة', datasheet_url: null, certification: null, country_of_origin: null,
  price: null, price_type: 'unknown', price_available: false, pricing_candidate: state === 'CONFIRMED_EQUIVALENT', last_verified_at: '2026-10-02T08:00:00Z',
  ...extra,
})

describe('«بدائل من الإنترنت»', () => {
  it('labels the three states in Arabic', () => {
    expect(matchStateLabel('CONFIRMED_EQUIVALENT')).toBe('مطابق مؤكد')
    expect(matchStateLabel('NEEDS_CONFIRMATION')).toBe('يحتاج تأكيد')
    expect(matchStateLabel('REJECTED')).toBe('غير مطابق')
  })

  it('hides unverified and rejected candidates by default', () => {
    const list = [alt('CONFIRMED_EQUIVALENT'), alt('NEEDS_CONFIRMATION'), alt('REJECTED'), alt('UNVERIFIED_CANDIDATE')]
    expect(visibleAlternatives(list).map((a) => a.match_state)).toEqual(['CONFIRMED_EQUIVALENT', 'NEEDS_CONFIRMATION'])
    expect(visibleAlternatives(list, true)).toHaveLength(4)
    expect(hiddenCount(list)).toBe(2)
  })

  it('hides an alternative the server held back as dearer than the line’s reference', () => {
    const list = [alt('CONFIRMED_EQUIVALENT'), alt('NEEDS_CONFIRMATION', { hidden_reason: 'MORE_EXPENSIVE', hidden_reason_ar: 'أغلى من السعر المرجعي للبند' })]
    expect(visibleAlternatives(list)).toHaveLength(1)
    expect(hiddenCount(list)).toBe(1)
  })

  it('price is optional and shown only as a dated public reference', () => {
    expect(priceText(alt('CONFIRMED_EQUIVALENT'))).toMatch(/السعر غير معروف/)
    const priced = alt('CONFIRMED_EQUIVALENT', { price_available: true, price_type: 'public_reference', price: { price: 1.25, currency: 'USD', price_type: 'public_reference', source_url: 'https://x', observed_at: '2026-10-02T00:00:00Z' } })
    expect(priceText(priced)).toBe('سعر مرجعي عام: 1.25 USD (2026-10-02)')
  })

  it('links only https sources', () => {
    expect(safeLink('https://maker.example/p')).toBe('https://maker.example/p')
    expect(safeLink('javascript:alert(1)')).toBeNull()
    expect(safeLink('http://maker.example')).toBeNull()
  })

  it('search button only where nothing was searched or the search failed', () => {
    expect(canSearch(null)).toBe(true)
    expect(canSearch({ line_id: 'a', status: 'NOT_SEARCHED', alternatives: [] })).toBe(true)
    expect(canSearch({ line_id: 'a', status: 'CACHE', alternatives: [] })).toBe(false)
    expect(webStatusNote({ line_id: 'a', status: 'SEARCHED', alternatives: [] })).toMatch(/لم نجد/)
  })

  it('the service is off unless the server enables it', () => {
    expect(resolveServices(null).has('internet_alternative_discovery')).toBe(false)
    expect(resolveServices({ gating: 'off', services: [{ key: 'internet_alternative_discovery', enabled: true }] } as never).has('internet_alternative_discovery')).toBe(true)
  })
})
