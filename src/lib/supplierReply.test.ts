import { describe, expect, it } from 'vitest'
import {
  isAutoReply,
  mailtoHref,
  phoneDigits,
  replyKindBadge,
  telHref,
  usableReplyContacts,
  whatsappHref,
} from './supplierReply'

describe('replyKindBadge', () => {
  it('names every meaningful kind in Arabic', () => {
    expect(replyKindBadge('AUTO_REPLY')?.label).toBe('رد آلي')
    expect(replyKindBadge('ALT_CONTACT')?.label).toBe('يطلب التواصل على رقم آخر')
    expect(replyKindBadge('DECLINED')?.label).toBe('اعتذر')
    expect(replyKindBadge('INTERESTED')?.label).toBe('مهتم / متوفر')
    expect(replyKindBadge('QUOTE_FILE')?.label).toBe('أرسل عرض سعر (ملف)')
    expect(replyKindBadge('PRICE_IN_TEXT')?.label).toBe('ذكر سعراً')
    expect(replyKindBadge('QUESTION')?.label).toBe('يسأل')
  })

  it('shows nothing for OTHER, missing or unknown kinds', () => {
    expect(replyKindBadge('OTHER')).toBeNull()
    expect(replyKindBadge(undefined)).toBeNull()
    expect(replyKindBadge(null)).toBeNull()
    expect(replyKindBadge('SOMETHING_NEW')).toBeNull()
  })

  it('gives the quote file the strongest tone', () => {
    expect(replyKindBadge('QUOTE_FILE')?.className).toContain('bg-emerald-600')
    expect(replyKindBadge('DECLINED')?.className).toContain('red')
    expect(replyKindBadge('ALT_CONTACT')?.className).toContain('amber')
  })
})

describe('isAutoReply', () => {
  it('matches only AUTO_REPLY', () => {
    expect(isAutoReply('AUTO_REPLY')).toBe(true)
    expect(isAutoReply('auto_reply')).toBe(true)
    expect(isAutoReply('DECLINED')).toBe(false)
    expect(isAutoReply(undefined)).toBe(false)
  })
})

describe('phone links', () => {
  it('folds Arabic-Indic digits and strips punctuation', () => {
    expect(phoneDigits('٠٥٥ ١٢٣-٤٥٦٧')).toBe('0551234567')
  })

  it('builds tel: keeping a written plus', () => {
    expect(telHref('+966 55 123 4567')).toBe('tel:+966551234567')
    expect(telHref('055 123 4567')).toBe('tel:0551234567')
    expect(telHref('12')).toBeNull()
  })

  it('builds wa.me in international form', () => {
    expect(whatsappHref('+966 55 123 4567')).toBe('https://wa.me/966551234567')
    expect(whatsappHref('00966551234567')).toBe('https://wa.me/966551234567')
    expect(whatsappHref('0551234567')).toBe('https://wa.me/966551234567')
    expect(whatsappHref('551234567')).toBe('https://wa.me/966551234567')
  })

  it('does not guess a country for other local numbers', () => {
    expect(whatsappHref('0112345678')).toBeNull()
    expect(whatsappHref('123')).toBeNull()
  })
})

describe('mailtoHref', () => {
  it('accepts plain addresses only', () => {
    expect(mailtoHref(' sales@example.sa ')).toBe('mailto:sales@example.sa')
    expect(mailtoHref('not an email')).toBeNull()
  })
})

describe('usableReplyContacts', () => {
  it('keeps only valid contacts the API sent, de-duplicated', () => {
    expect(
      usableReplyContacts([
        { type: 'phone', value: '0551234567' },
        { type: 'phone', value: '055-123-4567' },
        { type: 'phone', value: '' },
        { type: 'email', value: 'Sales@x.sa' },
        { type: 'email', value: 'sales@x.sa' },
        { type: 'email', value: 'broken' },
        { type: 'fax', value: '0112345678' } as unknown as { type: 'phone'; value: string },
      ]),
    ).toEqual([
      { type: 'phone', value: '0551234567' },
      { type: 'email', value: 'Sales@x.sa' },
    ])
  })

  it('returns nothing for missing input', () => {
    expect(usableReplyContacts(undefined)).toEqual([])
    expect(usableReplyContacts(null)).toEqual([])
  })
})
