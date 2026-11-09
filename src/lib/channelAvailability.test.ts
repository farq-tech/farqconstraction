import { describe, expect, it } from 'vitest'
import { channelAvailability, whatsAppChannelDetail } from './channelAvailability'

describe('channel availability presentation', () => {
  it('keeps missing and malformed API flags unknown', () => {
    expect(channelAvailability(undefined)).toBeNull()
    expect(channelAvailability(null)).toBeNull()
    expect(channelAvailability('false')).toBeNull()
    expect(channelAvailability(false)).toBe(false)
    expect(channelAvailability(true)).toBe(true)
  })

  it('does not call WhatsApp unconfigured when API status is unknown', () => {
    expect(whatsAppChannelDetail(null, null)).toContain('لا نعرف')
    expect(whatsAppChannelDetail(false, null)).toContain('حالة إعداد Meta غير متاحة')
    expect(whatsAppChannelDetail(false, false)).toContain('غير مهيأ')
    expect(whatsAppChannelDetail(false, true)).toContain('مهيّأ لدى Meta')
    expect(whatsAppChannelDetail(true, false)).toContain('جاهز للإرسال')
  })
})
