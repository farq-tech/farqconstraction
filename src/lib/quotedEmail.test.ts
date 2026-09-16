import { describe, expect, it } from 'vitest'
import { splitQuotedReply } from './quotedEmail'

/** Shape of the real AP Tools reply on ELE-RFQ-51D17AF6 (682 lines, 658 quoted). */
const apToolsReply = [
  'تحياتي، نتمنى أن يكون كل شيء على ما يرام.',
  '',
  'يمكنكم التواصل مع إدارة المشاريع مباشرة عبر البريد الإلكتروني التالي:',
  'project@arabprotools.com',
  'يمكنكم التواصل مباشرة مع قسم المشاريع في شركتنا الشقيقة شركة خشيم لعملاء',
  'المعدات الصناعية عبر البريد الإلكتروني التالي:',
  'Shabeer@khusheim.com',
  'Thondi@khusheim.com',
  'شكرا لتفهمك.',
  'أطيب التحيات،',
  '',
  '\u202aOn Tue, Sep 15, 2026 at 7:59 PM \u202bفرق للبناء — عبر فرق للبناء\u202c\u200e <',
  'info@farq.sa> wrote:\u202c',
  '',
  '> فرق للبناء',
  '> شركة فرق للتكنولوجيا',
  '> طلب عرض سعر',
  '> السلام عليكم عزيزي البائع لدينا مشتري يطلب توفير: أنظمة بيانات إلكترونية',
  '> ألواح أو إس بي',
].join('\n')

describe('splitQuotedReply', () => {
  it('keeps the supplier new content visible and hides the quoted RFQ behind the toggle', () => {
    const result = splitQuotedReply(apToolsReply)
    expect(result.reason).toBe('ATTRIBUTION')
    // The genuine business signal — the redirect contacts — must stay visible.
    expect(result.visible).toContain('project@arabprotools.com')
    expect(result.visible).toContain('Shabeer@khusheim.com')
    expect(result.visible).toContain('Thondi@khusheim.com')
    expect(result.visible).not.toContain('طلب عرض سعر')
    expect(result.quoted).toContain('أنظمة بيانات إلكترونية')
    expect(result.visible.split('\n').length).toBeLessThan(12)
  })

  it('cuts at a plain > block with no attribution line', () => {
    const result = splitQuotedReply(
      ['السعر 1200 ريال', '', '> الطلب الأصلي', '> البند الأول', '> البند الثاني', '> البند الثالث'].join('\n'),
    )
    expect(result.reason).toBe('QUOTE_MARKER')
    expect(result.visible).toBe('السعر 1200 ريال')
    expect(result.quoted).toContain('البند الثالث')
  })

  it('handles the Arabic attribution header', () => {
    const result = splitQuotedReply(
      ['نعتمد الكمية', 'في ١٥ سبتمبر ٢٠٢٦، كتب info@farq.sa:', 'النص السابق كاملاً'].join('\n'),
    )
    expect(result.reason).toBe('ATTRIBUTION')
    expect(result.visible).toBe('نعتمد الكمية')
    expect(result.quoted).toContain('النص السابق')
  })

  it('shows everything when the quote evidence is weak', () => {
    const singleMarker = ['السعر النهائي', '> ملاحظة مهمة من المورد'].join('\n')
    expect(splitQuotedReply(singleMarker).quoted).toBeNull()
    expect(splitQuotedReply(singleMarker).visible).toBe(singleMarker)
    expect(splitQuotedReply('رد قصير بدون اقتباس').quoted).toBeNull()
    expect(splitQuotedReply('').quoted).toBeNull()
  })

  it('never hides the whole message when the reply is only a forward', () => {
    const forward = ['> الرسالة الأصلية', '> سطر', '> سطر', '> سطر'].join('\n')
    const result = splitQuotedReply(forward)
    expect(result.quoted).toBeNull()
    expect(result.visible).toBe(forward)
  })

  it('folds the Zendesk ticket history but keeps the message under the banner', () => {
    // Shape of the real دهانات الجزيرة arrivals on ELE-RFQ-51D17AF6: no `>`,
    // no attribution — a banner on line 1 and a long ruler before the history.
    const zendesk = [
      '##- الرجاء كتابة ردك فوق هذا الخط -##',
      '',
      'تم تحديث طلبك برقم (#131255). لإضافة تعليقات إضافية، يمكنك الرد على هذا البريد الإلكتروني:',
      '----------------------------------------------',
      '',
      'Nawaf ALSHAHRANI، ١٥ سبتمبر ٢٠٢٦',
      ...Array.from({ length: 12 }, (_, i) => `سطر من الطلب الأصلي ${i + 1}`),
    ].join('\n')
    const result = splitQuotedReply(zendesk)
    expect(result.reason).toBe('DELIMITER')
    expect(result.visible).toContain('#131255')
    expect(result.quoted).toContain('سطر من الطلب الأصلي 12')
  })

  it('keeps a short dashed separator inside a signature visible', () => {
    const autoReply = [
      'شكراً لتواصلك معنا..',
      'وصلتنا رسالتك رقم (131255)',
      '-----',
      'Thank you for contacting us!',
      "We've received your message.",
    ].join('\n')
    expect(splitQuotedReply(autoReply).quoted).toBeNull()
    expect(splitQuotedReply(autoReply).visible).toContain('Thank you for contacting us!')
  })

  it('does not treat a line merely containing an address as an attribution', () => {
    const text = ['تواصل معنا على sales@example.com', 'ونرسل العرض غدًا'].join('\n')
    expect(splitQuotedReply(text).quoted).toBeNull()
    expect(splitQuotedReply(text).visible).toBe(text)
  })
})
