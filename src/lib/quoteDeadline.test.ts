import { describe, expect, it } from 'vitest'
import {
  addBusinessDays,
  arabicDayMonth,
  checkQuoteDeadline,
  minimumQuoteDeadline,
  quoteUrgencyPayload,
  riyadhToday,
} from './quoteDeadline'
import { DELIVERY_CITY_REQUIRED_AR, REQUEST_TYPE_REQUIRED_AR, requestTermsBlockers, suggestedRequestType } from './sendGuards'
import { requestTermsErrorAr } from '../api/constructionClient'

// Wed 7 Oct 2026, 10:00 Riyadh.
const WED = new Date('2026-10-07T07:00:00Z')

describe('the minimum quote deadline: 5 Saudi business days after today in Riyadh', () => {
  it('reads today in Riyadh, not in the device timezone', () => {
    expect(riyadhToday(new Date('2026-10-07T20:59:00Z'))).toBe('2026-10-07')
    expect(riyadhToday(new Date('2026-10-07T21:00:00Z'))).toBe('2026-10-08')
  })
  it('skips Friday and Saturday and does not count today', () => {
    expect(minimumQuoteDeadline(WED)).toBe('2026-10-14')
    expect(addBusinessDays('2026-10-09', 5)).toBe('2026-10-15') // sent on a Friday
    expect(addBusinessDays('2026-10-10', 5)).toBe('2026-10-15') // sent on a Saturday
    expect(addBusinessDays('2026-10-08', 1)).toBe('2026-10-11') // Thu → Sun
  })
  it('writes the date the way people read it', () => {
    expect(arabicDayMonth('2026-10-14')).toBe('14 أكتوبر')
  })
})

describe('checkQuoteDeadline', () => {
  it('accepts the minimum and later', () => {
    expect(checkQuoteDeadline({ deadline: '2026-10-14' }, WED)).toMatchObject({ ok: true, minimum: '2026-10-14', early: false })
    expect(checkQuoteDeadline({ deadline: '2026-10-20' }, WED).ok).toBe(true)
  })
  it('refuses the bead-mastic two-day deadline unless urgent with a reason', () => {
    const r = checkQuoteDeadline({ deadline: '2026-10-09' }, WED)
    expect(r).toMatchObject({ ok: false, code: 'TOO_SOON' })
    expect(r.message_ar).toContain('14 أكتوبر')
    expect(r.message_ar).toContain('طلب مستعجل')
    expect(checkQuoteDeadline({ deadline: '2026-10-09', urgent: true, urgentReason: ' ' }, WED).code).toBe('URGENT_REASON_REQUIRED')
    expect(checkQuoteDeadline({ deadline: '2026-10-09', urgent: true, urgentReason: 'x'.repeat(121) }, WED).code).toBe('URGENT_REASON_REQUIRED')
    expect(checkQuoteDeadline({ deadline: '2026-10-09', urgent: true, urgentReason: 'صب يوم الأحد' }, WED)).toMatchObject({ ok: true, early: true })
  })
  it('never accepts a deadline before today, even urgent', () => {
    expect(checkQuoteDeadline({ deadline: '2026-10-06', urgent: true, urgentReason: 'عاجل جدًا' }, WED).code).toBe('PAST')
    expect(checkQuoteDeadline({ deadline: '' }, WED).ok).toBe(false)
  })
  it('sends the urgent fields only for an early deadline marked urgent', () => {
    expect(quoteUrgencyPayload({ deadline: '2026-10-09', urgent: true, urgentReason: '  صب   يوم الأحد ' }, WED)).toEqual({
      quote_urgent: true,
      quote_urgent_reason: 'صب يوم الأحد',
    })
    expect(quoteUrgencyPayload({ deadline: '2026-10-15', urgent: true, urgentReason: 'صب يوم الأحد' }, WED)).toEqual({})
    expect(quoteUrgencyPayload({ deadline: '2026-10-09', urgent: true, urgentReason: '' }, WED)).toEqual({})
  })
})

describe('request terms before a send', () => {
  it('asks for the scope and the city', () => {
    const out = requestTermsBlockers({ requestType: '', city: ' ', quoteDeadline: '2026-10-14' }, WED)
    expect(out).toEqual([DELIVERY_CITY_REQUIRED_AR, REQUEST_TYPE_REQUIRED_AR])
    expect(requestTermsBlockers({ requestType: 'SUPPLY_ONLY', city: 'الرياض', quoteDeadline: '2026-10-14' }, WED)).toEqual([])
  })
  it('suggests supply and install only when every line says so', () => {
    expect(suggestedRequestType(['توريد وتركيب بلاط', 'توريد و تركيب أبواب'])).toBe('SUPPLY_AND_INSTALL')
    expect(suggestedRequestType(['توريد وتركيب بلاط', 'أسمنت'])).toBe('')
    expect(suggestedRequestType([])).toBe('')
  })
  it('maps the API refusals to Arabic', () => {
    expect(requestTermsErrorAr('CONSTRUCTION_QUOTE_DEADLINE_TOO_SOON', { message: 'minimum 2026-10-14' })).toContain('14 أكتوبر')
    expect(requestTermsErrorAr('CONSTRUCTION_REQUEST_TYPE_REQUIRED')).toBe(REQUEST_TYPE_REQUIRED_AR)
    expect(requestTermsErrorAr('CONSTRUCTION_DELIVERY_CITY_REQUIRED')).toBe(DELIVERY_CITY_REQUIRED_AR)
    expect(requestTermsErrorAr('SOMETHING_ELSE')).toBeNull()
  })
})

describe('invite terms lines', () => {
  it('carry scope, price basis, place, deadline and urgency in the API wording', async () => {
    const { rfqTermsLines } = await import('./rfqEmailPreview')
    expect(
      rfqTermsLines({ requestType: 'SUPPLY_ONLY', city: 'الرياض', district: 'حي النرجس', quoteDeadline: '2026-10-14', quoteDeadlineTime: '17:00', urgentReason: 'صب يوم الأحد' }),
    ).toEqual([
      'نوع الطلب: توريد فقط — بدون تركيب',
      'التسعير: سعر الوحدة قبل الضريبة، واذكر ضريبة القيمة المضافة 15% لحالها',
      'التسليم: الرياض — حي النرجس',
      'آخر موعد للعرض: 14 أكتوبر الساعة 17:00',
      'مستعجل: صب يوم الأحد',
    ])
  })
})
