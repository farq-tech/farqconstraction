import { describe, expect, it } from 'vitest'
import type { ConstructionAiDraft } from '../api/constructionClient'
import { aiErrorAr, confidenceAr, declineScopeAr, deliveryAr, humanReasonAr, leadTimeAr, panelDrafts, priceLineAr, profileChoicesReady, profileUpdateAr, REPLY_KIND_AR, vatAr } from './inboxAi'

const draft = (type: ConstructionAiDraft['type'], state: ConstructionAiDraft['state'] = 'PENDING'): ConstructionAiDraft =>
  ({ id: `${type}-${state}`, message_id: 'm', type, state, confidence: 0.9, payload: {} })

describe('فهم الرسالة — labels', () => {
  it('says the reply kind, VAT, delivery, lead time and confidence in plain Arabic', () => {
    expect(REPLY_KIND_AR.PRICE_IN_TEXT).toBe('سعر في الرسالة')
    expect(vatAr(true)).toBe('شامل الضريبة')
    expect(vatAr(true, true)).toMatch(/يُفهم/)
    expect(vatAr(false)).toBe('غير شامل الضريبة')
    expect(vatAr(null)).toBe('الضريبة غير مذكورة')
    expect(deliveryAr(false)).toBe('التوصيل على المشتري')
    expect(leadTimeAr(3)).toBe('3 أيام')
    expect(leadTimeAr(null)).toBe('غير مذكورة')
    expect(confidenceAr(0.9)).toBe('عالية (90٪)')
    expect(confidenceAr(0.55)).toMatch(/منخفضة/)
  })
  it('shows a box price with its per-piece price', () => {
    expect(priceLineAr({ line_key: 'L1', unit_price: 0.04, includes_vat: null, sale_unit: 'BOX', pack_size: 100, sale_unit_price: 4 })).toBe('4 ريال للعلبة (100 حبة) = 0.04 للحبة')
    expect(priceLineAr({ line_key: 'L1', unit_price: 17.5, includes_vat: true })).toBe('17.5 ريال')
  })
  it('names profile facts, decline scopes and review reasons', () => {
    expect(profileUpdateAr({ type: 'NOT_SUPPORTED_CATEGORY', normalized_value: 'electrical' })).toBe('ما يبيع: كهرباء')
    expect(profileUpdateAr({ type: 'TRADE_SPECIALTY', normalized_value: 'plumbing' })).toBe('تخصصه: سباكة')
    expect(declineScopeAr('temporary')).toMatch(/بدون تغيير في نشاطه/)
    expect(humanReasonAr('PROMPT_INJECTION_SUSPECT')).toMatch(/ما نفّذنا شيء/)
    expect(humanReasonAr('HUMAN_ONLY:NEGOTIATION')).toBe('يحتاج ردك أنت')
    expect(aiErrorAr('AI_ACTIONS_DISABLED')).toMatch(/موقوف/)
  })
})

describe('فهم الرسالة — drafts', () => {
  it('lists pending quote, decline and profile drafts only (the reply card handles replies)', () => {
    const list = panelDrafts([draft('REPLY_DRAFT'), draft('SUPPLIER_PROFILE_DRAFT'), draft('QUOTE_DRAFT', 'APPROVED'), draft('DECLINE_DRAFT'), draft('QUOTE_DRAFT')])
    expect(list.map((d) => d.type)).toEqual(['QUOTE_DRAFT', 'DECLINE_DRAFT', 'SUPPLIER_PROFILE_DRAFT'])
  })
  it('a conflicting profile fact waits for إضافة / استبدال / تجاهل', () => {
    const updates = [{ type: 'TRADE_SPECIALTY', normalized_value: 'plumbing', merge: 'ADD' as const }, { type: 'NOT_SUPPORTED_CATEGORY', normalized_value: 'electrical', merge: 'CONFLICT' as const }]
    expect(profileChoicesReady(updates, {})).toBe(false)
    expect(profileChoicesReady(updates, { 1: 'REPLACE' })).toBe(true)
  })
})
