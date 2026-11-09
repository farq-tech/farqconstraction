import { describe, expect, it } from 'vitest'
import { presentWhatsAppDelivery, whatsappDeliveryEvidenceLabel } from './whatsappDelivery'

describe('presentWhatsAppDelivery', () => {
  it.each([
    ['READ', 'sent', 'SENT', 'وصل للمورد وقرأه'],
    ['DELIVERED', 'sent', 'SENT', 'وصل للمورد'],
    ['ACCEPTED', 'sent', 'SENT', 'بانتظار تأكيد التسليم'],
    ['UNCONFIRMED', 'sent', 'SENT', 'لم يصل تأكيد التسليم بعد'],
    [undefined, 'sent', 'SENT', 'لم يصل تأكيد التسليم بعد'],
  ] as const)('%s is accepted without claiming delivery unless confirmed', (state, status, code, phrase) => {
    const result = presentWhatsAppDelivery(state)
    expect(result.status).toBe(status)
    expect(result.code).toBe(code)
    expect(result.detail).toContain(phrase)
  })

  it('reports provider-confirmed failure and retains its bounded reason', () => {
    expect(presentWhatsAppDelivery('FAILED', 'Recipient unavailable')).toEqual({
      status: 'failed',
      code: 'DELIVERY_FAILED',
      detail: 'واتساب · قبلته Meta ثم تعذر تسليمه · Recipient unavailable',
    })
  })

  it('settings evidence never infers delivery from configuration or an absent receipt', () => {
    expect(whatsappDeliveryEvidenceLabel('DELIVERED')).toBe('وصل إلى المورد')
    expect(whatsappDeliveryEvidenceLabel('FAILED')).toBe('فشل التسليم بحسب إيصال Meta')
    expect(whatsappDeliveryEvidenceLabel(undefined, 'SENT', false)).toBe('قبلته Meta؛ تتبع الإيصالات غير مهيّأ')
    expect(whatsappDeliveryEvidenceLabel(undefined, 'SENT', true)).toBe('قبلته Meta؛ لا يوجد تأكيد تسليم بعد')
    expect(whatsappDeliveryEvidenceLabel(undefined, undefined, true)).toBe('لا توجد محاولة إرسال مسجلة')
  })
})
