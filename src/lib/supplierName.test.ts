import { describe, expect, it } from 'vitest'
import { cleanSupplierName } from './supplierName'

describe('cleanSupplierName', () => {
  it('drops the channel name and the «الرقم البديل» suffix', () => {
    expect(cleanSupplierName('مورد حراج faisal99asiri — الرقم البديل')).toBe('faisal99asiri')
    expect(cleanSupplierName('جناح الشارقة لمواد البناء والدهنات — الرقم البديل')).toBe('جناح الشارقة لمواد البناء والدهنات')
    expect(cleanSupplierName('مؤسسة النور - الرقم البديل')).toBe('مؤسسة النور')
    expect(cleanSupplierName('حراج مؤسسة النور')).toBe('مؤسسة النور')
  })

  it('strips HTML-entity residue and returns null when nothing is left', () => {
    expect(cleanSupplierName('quot  quot  quot  quot')).toBeNull()
    expect(cleanSupplierName('مورد حراج quot — الرقم البديل')).toBeNull()
    expect(cleanSupplierName('&quot;مؤسسة الركن&quot;')).toBe('مؤسسة الركن')
    expect(cleanSupplierName('Smith &amp; Sons')).toBe('Smith & Sons')
  })

  it('drops a trailing English Google-Maps category', () => {
    expect(cleanSupplierName('للسباكة والكهرباء, shop')).toBe('للسباكة والكهرباء')
    expect(cleanSupplierName('لمسة فخامة, trading company')).toBe('لمسة فخامة')
    expect(cleanSupplierName('Jotun Paint, company')).toBe('Jotun Paint')
    expect(cleanSupplierName('محل خالد ... للدهانات, paint shop — الرقم البديل')).toBe('محل خالد ... للدهانات')
    expect(cleanSupplierName('shop')).toBe('shop')
    expect(cleanSupplierName('مؤسسة, Easier Supply')).toBe('مؤسسة، Easier Supply')
  })

  it('turns member placeholders into a readable label', () => {
    expect(cleanSupplierName('عضو 6 2772183')).toBe('مورد محادثة 2183')
    expect(cleanSupplierName('عضو 1016648')).toBe('مورد محادثة 6648')
    expect(cleanSupplierName('عضو ابو فاطمه')).toBe('ابو فاطمه')
  })

  it('keeps real names unchanged', () => {
    expect(cleanSupplierName('تريك للانارة Treek Lighting - فرع الغرابي')).toBe('تريك للانارة Treek Lighting - فرع الغرابي')
    expect(cleanSupplierName('التوريد الأسهل للتجارة (Easier Supply)')).toBe('التوريد الأسهل للتجارة (Easier Supply)')
    expect(cleanSupplierName('  مؤسسة   الركن  ')).toBe('مؤسسة الركن')
  })

  it('returns null on empty input', () => {
    expect(cleanSupplierName(null)).toBeNull()
    expect(cleanSupplierName(undefined)).toBeNull()
    expect(cleanSupplierName('  — ')).toBeNull()
    expect(cleanSupplierName('مورد')).toBeNull()
  })
})
