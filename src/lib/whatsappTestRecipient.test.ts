import { describe, expect, it } from 'vitest'
import { normalizeSaudiWhatsAppTestRecipient } from './whatsappTestRecipient'

describe('normalizeSaudiWhatsAppTestRecipient', () => {
  it('normalizes Saudi mobiles in local, international and Arabic-digit forms', () => {
    expect(normalizeSaudiWhatsAppTestRecipient('0501234567')).toBe('966501234567')
    expect(normalizeSaudiWhatsAppTestRecipient('+966 50 123 4567')).toBe('966501234567')
    expect(normalizeSaudiWhatsAppTestRecipient('٠٥٠١٢٣٤٥٦٧')).toBe('966501234567')
  })

  it('rejects malformed and non-Saudi numbers instead of guessing the country', () => {
    expect(normalizeSaudiWhatsAppTestRecipient('56333346')).toBeNull()
    expect(normalizeSaudiWhatsAppTestRecipient('050123456')).toBeNull()
    expect(normalizeSaudiWhatsAppTestRecipient('1234567890')).toBeNull()
  })
})
