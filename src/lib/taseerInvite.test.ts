import { describe, expect, it } from 'vitest'
import { offerLink, taseerSellerMessage } from './taseerInvite'

describe('taseerSellerMessage', () => {
  it('uses the buyer need and the unique link, not Construction RFQ voice', () => {
    const link = offerLink('tok-1')
    const text = taseerSellerMessage('سباك', link)
    expect(text).toContain('لدينا عميل يرغب في : سباك')
    expect(text).toContain('الضغط')
    expect(text).toContain(link)
    expect(text).not.toMatch(/شركة الدفع|كراسة|طلب عرض سعر/)
    expect(link).toBe('http://127.0.0.1:5173/s/tok-1')
  })
})
