import { describe, expect, it } from 'vitest'
import { buildSupplierParse, coerceCell, restoreLeadingZero } from './supplierImportSheet'
import { selectSupplierSheet } from './supplierImportExcel'

const HEADER = ['اسم المورد', 'المدينة', 'النشاط', 'البريد الإلكتروني', 'الجوال', 'اسم مسؤول التواصل']

describe('coerceCell', () => {
  it('keeps a commercial registration whole instead of turning it into a float', () => {
    expect(coerceCell(1010123456)).toBe('1010123456')
  })

  it('does not let a large number reach scientific notation', () => {
    expect(coerceCell(966537009051)).toBe('966537009051')
  })

  it('reads a date cell as a plain date, not a timestamp', () => {
    expect(coerceCell(new Date('2026-09-16T10:30:00Z'))).toBe('2026-09-16')
  })

  it('strips the non-breaking spaces and bidi marks Excel exports carry', () => {
    expect(coerceCell('\u200fشركة النور\u00a0')).toBe('شركة النور')
  })

  it('treats an empty cell and a missing cell alike', () => {
    expect(coerceCell(null)).toBe('')
    expect(coerceCell(undefined)).toBe('')
  })
})

describe('restoreLeadingZero', () => {
  it('gives back the zero Excel drops from a Saudi mobile', () => {
    expect(restoreLeadingZero('537009051')).toBe('0537009051')
  })

  it('leaves a number that kept its zero alone', () => {
    expect(restoreLeadingZero('0537009051')).toBe('0537009051')
  })

  it('does not prepend a zero to an international number', () => {
    expect(restoreLeadingZero('966537009051')).toBe('966537009051')
    expect(restoreLeadingZero('971501234567')).toBe('971501234567')
  })

  it('leaves a nine-digit number that is not a mobile alone', () => {
    expect(restoreLeadingZero('112345678')).toBe('112345678')
  })
})

describe('buildSupplierParse', () => {
  it('numbers rows as the spreadsheet does, counting the header', () => {
    const parse = buildSupplierParse([
      HEADER,
      ['مورد أ', 'الرياض', 'حديد', 'a@example.com', null, null],
      ['مورد ب', 'جدة', 'عوازل', 'b@example.com', null, null],
    ])
    expect(parse.rows.map((row) => row.rowNumber)).toEqual([2, 3])
    expect(parse.headerRowNumber).toBe(1)
  })

  it('keeps the numbering aligned when a blank row sits in the middle', () => {
    const parse = buildSupplierParse([
      HEADER,
      ['مورد أ', 'الرياض', 'حديد', 'a@example.com', null, null],
      [],
      ['مورد ب', 'جدة', 'عوازل', 'b@example.com', null, null],
    ])
    // The second supplier is on line 4 of the file and must say so, otherwise
    // «صف 3» sends him to the blank line when he goes to fix it.
    expect(parse.rows.map((row) => row.rowNumber)).toEqual([2, 4])
  })

  it('finds the header under a merged title banner and reports where', () => {
    const parse = buildSupplierParse([
      ['قائمة موردين — سبتمبر 2026', null, null, null, null, null],
      HEADER,
      ['مورد أ', 'الرياض', 'حديد', 'a@example.com', null, null],
    ])
    expect(parse.headerRowNumber).toBe(2)
    expect(parse.rows[0]!.rowNumber).toBe(3)
  })

  it('restores the dropped zero on a numeric phone cell', () => {
    const parse = buildSupplierParse([
      HEADER,
      ['مورد أ', 'الرياض', 'حديد', null, 537009051, null],
    ])
    expect(parse.rows[0]!.whatsapp).toBe('0537009051')
  })

  it('reports a row with content in unmapped columns rather than dropping it', () => {
    const parse = buildSupplierParse([
      HEADER,
      ['مورد أ', 'الرياض', 'حديد', 'a@example.com', null, null],
      [null, null, null, null, null, null, 'ملاحظة في عمود غير معروف'],
    ])
    expect(parse.unreadableRowNumbers).toEqual([3])
  })

  it('separates an empty file from one whose columns were not recognised', () => {
    expect(() => buildSupplierParse([HEADER])).toThrow(/بعد العناوين/)
    expect(() => buildSupplierParse([['الوصف', 'الكمية'], ['بند', '2']])).toThrow(/اسم المورد/)
  })
})

describe('selectSupplierSheet', () => {
  const suppliers = [HEADER, ['مورد أ', 'الرياض', 'حديد', 'a@example.com', null, null]]

  it('skips a cover sheet instead of reading the first tab blindly', () => {
    const workbook = selectSupplierSheet([
      { sheet: 'تعليمات', data: [['املأ ورقة الموردون'], [], ['لا تحذف صف العناوين']] },
      { sheet: 'الموردون', data: suppliers },
    ])
    expect(workbook.sheets[workbook.selected]!.name).toBe('الموردون')
    // The skipped sheet is still listed, with its reason, so the choice is his.
    expect(workbook.sheets[0]!.parse).toBeNull()
    expect(workbook.sheets[0]!.error).toMatch(/اسم المورد/)
  })

  it('names every sheet so the UI can offer the others', () => {
    const workbook = selectSupplierSheet([
      { sheet: 'الموردون', data: suppliers },
      { sheet: 'أرشيف', data: suppliers },
    ])
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(['الموردون', 'أرشيف'])
    expect(workbook.sheets.map((sheet) => sheet.position)).toEqual([1, 2])
    expect(workbook.selected).toBe(0)
  })

  it('refuses a workbook with no suppliers anywhere, naming each sheet', () => {
    expect(() =>
      selectSupplierSheet([
        { sheet: 'ورقة1', data: [['الوصف'], ['بند']] },
        { sheet: 'ورقة2', data: [[]] },
      ]),
    ).toThrow(/ورقة1/)
  })
})
