import { describe, expect, it } from 'vitest'
import { constrainPetPosition, readableSourceDates, supplierDisplayName } from './presentationQuality'
import { formatInviteResponseStatus } from '../api/constructionClient'
describe('customer-facing quality regressions', () => {
  it('does not turn addresses or punctuation into supplier identities', () => {
    for (const raw of ['&', '1', ',,,,', '4971، مكة 24421 7682', '4971 مكة 24421', '٤٩٧١ مكة ٢٤٤٢١']) expect(supplierDisplayName(raw)).toBe('مورد — الاسم يحتاج تحقق')
    expect(supplierDisplayName('&', 'Aluminum House')).toBe('Aluminum House')
    expect(supplierDisplayName('- 7 شركة التوريد')).toBe('شركة التوريد')
  })
  it('keeps dragged and resized characters away from header and navigation', () => {
    expect(constrainPetPosition(999, -50, 390, 844, 128, 203)).toEqual({ x:230, y:220 })
    expect(constrainPetPosition(-99, 999, 390, 844, 128, 203)).toEqual({ x:8, y:541 })
  })
  it('never says waiting for a reply when the invitation was not sent', () => {
    expect(formatInviteResponseStatus('AWAITING_QUOTE','NOT_SENT')).toBe('لم تُرسل الدعوة')
    expect(formatInviteResponseStatus('AWAITING_QUOTE','SENT')).toBe('بانتظار الرد')
    expect(formatInviteResponseStatus('QUOTED','NOT_SENT')).toBe('وصل عرض')
  })
  it('renders source timestamps in Saudi local time', () => {
    const text=readableSourceDates('وقت القراءة: 2026-10-06T09:50:54.659Z')
    expect(text).not.toContain('T09:50');expect(text).toContain('بتوقيت السعودية')
  })
})
