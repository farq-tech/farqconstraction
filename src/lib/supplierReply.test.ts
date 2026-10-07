import { describe, expect, it } from 'vitest'
import {
  BOT_CHIP_LABEL,
  NEEDS_HUMAN_LABEL,
  isAutoReply,
  replyFlags,
  visibleReplyDraft,
  mailtoHref,
  phoneDigits,
  replyKindBadge,
  telHref,
  usableReplyContacts,
  whatsappHref,
} from './supplierReply'

describe('replyKindBadge', () => {
  it('names every meaningful kind in Arabic', () => {
    expect(replyKindBadge('AUTO_REPLY')?.label).toBe('رد آلي من المورد')
    expect(replyKindBadge('BUTTON')?.label).toBe('ضغط «متوفر وبسعّره»')
    expect(replyKindBadge('NON_TEXT_ACK')?.label).toBe('تأكيد أو تفاعل')
    expect(replyKindBadge('ALT_CONTACT')?.label).toBe('يطلب التواصل على رقم آخر')
    expect(replyKindBadge('DECLINED')?.label).toBe('اعتذر')
    expect(replyKindBadge('INTERESTED')?.label).toBe('مهتم / متوفر')
    expect(replyKindBadge('QUOTE_FILE')?.label).toBe('أرسل عرض سعر (ملف)')
    expect(replyKindBadge('PRICE_IN_TEXT')?.label).toBe('ذكر سعراً')
    expect(replyKindBadge('QUESTION')?.label).toBe('يسأل')
    expect(replyKindBadge('CLARIFICATION_NEEDED')?.label).toBe('يطلب توضيح')
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

describe('replyFlags', () => {
  it('marks a supplier bot and a message only a person should answer', () => {
    expect(BOT_CHIP_LABEL).toBe('رد آلي من المورد')
    expect(NEEDS_HUMAN_LABEL).toBe('يحتاج رد منك')
    expect(replyFlags({ direction: 'INBOUND', reply_kind: 'AUTO_REPLY' })).toEqual({ bot: true, needsHuman: false })
    expect(replyFlags({ direction: 'INBOUND', reply_kind: 'QUESTION', reply_bot: true })).toEqual({ bot: true, needsHuman: false })
    expect(replyFlags({ direction: 'INBOUND', reply_kind: 'QUESTION', reply_needs_human: true })).toEqual({ bot: false, needsHuman: true })
    expect(replyFlags({ direction: 'OUTBOUND', reply_kind: 'AUTO_REPLY', reply_needs_human: true })).toEqual({ bot: false, needsHuman: false })
  })
})

describe('visibleReplyDraft', () => {
  const draft = { id: 'd1', message_id: 'm1', intent: 'GREETING', text: 'هلا فيك. كم سعر الحبة عندك؟', needs_human: false, bot: false, state: 'SUGGESTED' }
  it('shows an open suggestion for the latest message', () => {
    expect(visibleReplyDraft({ reply_draft: draft, last_message_id: 'm1' })?.text).toBe(draft.text)
  })
  it('hides closed, stale, dismissed and empty suggestions', () => {
    expect(visibleReplyDraft({ reply_draft: { ...draft, state: 'SENT' }, last_message_id: 'm1' })).toBeNull()
    expect(visibleReplyDraft({ reply_draft: draft, last_message_id: 'm2' })).toBeNull()
    expect(visibleReplyDraft({ reply_draft: draft, last_message_id: 'm1' }, new Set(['d1']))).toBeNull()
    expect(visibleReplyDraft({ reply_draft: { ...draft, text: null }, last_message_id: 'm1' })).toBeNull()
    expect(visibleReplyDraft({ reply_draft: null, last_message_id: 'm1' })).toBeNull()
  })
  it('keeps a human-only message as «يحتاج رد منك» without text', () => {
    const human = visibleReplyDraft({ reply_draft: { ...draft, intent: 'NEGOTIATION', text: null, needs_human: true }, last_message_id: 'm1' })
    expect(human?.needs_human).toBe(true)
    expect(human?.text).toBeNull()
  })
})
