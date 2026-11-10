import { describe, expect, it } from 'vitest'
import { suggestionSuppliers } from './constructionClient'

describe('suggestionSuppliers evidence', () => {
  it('preserves the server activity grade instead of upgrading it to the lane label', () => {
    const suppliers = suggestionSuppliers(
      [
        { id: 'named', name_ar: 'مورد مسمى', evidence: 'دليل مباشر' },
        { id: 'broad', name_ar: 'مورد نشاط عام', evidence: 'على مستوى النشاط' },
        { id: 'other', name_ar: 'مورد آخر', evidence: 'دليل منتج' },
      ],
      'خريطة فرق',
    )

    expect(suppliers.map((supplier) => [supplier.id, supplier.evidence])).toEqual([
      ['named', 'خريطة فرق'],
      ['broad', 'على مستوى النشاط'],
      ['other', 'خريطة فرق'],
    ])
  })

  it('keeps the family lane weak even when the server omits a per-supplier grade', () => {
    const suppliers = suggestionSuppliers([{ id: 'family', name_ar: 'مقاول عام' }], 'على مستوى النشاط')
    expect(suppliers[0]?.evidence).toBe('على مستوى النشاط')
  })
})
