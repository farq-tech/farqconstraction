import { describe, expect, it } from 'vitest'
import { missingSpecificationWarning } from './parseBoq'

describe('missing specification warning', () => {
  it('does not imply quantity or unit were used to match suppliers', () => {
    const warning = missingSpecificationWarning('pdf-table', 2, 5, false)
    expect(warning).toContain('قُرئت الكميات والوحدات من الجدول')
    expect(warning).toContain('المقاس والبراند غير متاحين')
    expect(warning).not.toContain('طُوبقت')
  })

  it('only warns for table-based reads with missing specification details', () => {
    expect(missingSpecificationWarning('pdf-table', 0, 5, false)).toBe('')
    expect(missingSpecificationWarning('pdf-text', 2, 5, false)).toBe('')
    expect(missingSpecificationWarning('pdf-table', 2, 5, true)).toContain('يتطلب تسجيل الدخول')
  })
})
