import { describe, expect, it } from 'vitest'
import { outboundSenderLabel } from './inboxSender'

describe('outboundSenderLabel', () => {
  it("shows the colleague's display name", () => {
    expect(outboundSenderLabel('بدر الشيباني')).toBe('بدر الشيباني')
    expect(outboundSenderLabel('  بدر   الشيباني ')).toBe('بدر الشيباني')
  })

  it('never shows a raw e-mail address', () => {
    expect(outboundSenderLabel('badr@farq.sa')).toBe('فريق الشركة')
    expect(outboundSenderLabel('Badr.Alshaibani@example.com')).toBe('فريق الشركة')
  })

  it('speaks as «أحمد من فرق» for automated messages', () => {
    expect(outboundSenderLabel('رد آلي من فرق')).toBe('أحمد من فرق')
    expect(outboundSenderLabel('فرق للبناء')).toBe('أحمد من فرق')
    expect(outboundSenderLabel('فرق')).toBe('أحمد من فرق')
    expect(outboundSenderLabel('أحمد من فرق')).toBe('أحمد من فرق')
  })

  it('falls back when no name is given', () => {
    expect(outboundSenderLabel(null)).toBe('فريق الشركة')
    expect(outboundSenderLabel('')).toBe('فريق الشركة')
  })
})
