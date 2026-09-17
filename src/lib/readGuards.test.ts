import { describe, expect, it } from 'vitest'
import { countDistinctItemCodes, isTotalLine, resolveParsedLines } from './parseBoq'

describe('a section total is not an item', () => {
  it('recognises the wordings measured on the MasterFormat site booklet', () => {
    for (const name of ['أعمال الموقع إجمالي', 'اعمال خرسانة   إجما', 'إجمالي أعمال الكهرباء', 'المجموع', 'مجموع أعمال المبنى الرئيسي', 'Total of Villa', 'Sub-total', 'Carried to Summary']) {
      expect(`${name}: ${isTotalLine(name)}`).toBe(`${name}: true`)
    }
  })
  it('sees the total word through the NUL a PDF leaves where it could not map a glyph', () => {
    // Verbatim from the deployed link, 2026-09-17: the ي of «إجمالي» arrived as U+0000.
    for (const name of ['أعمال الموقع \u0000 اجما\u0000', '\u0000 اعمال الم\u0000ا\u0000 \u0000 إجما\u0000', 'العام لأعمال المعدن\u0000ة \u0000 إجما\u0000', 'اعمال خرسانة\u200f إجمالي\ufeff']) {
      expect(isTotalLine(name)).toBe(true)
    }
  })

  it('never drops a product whose name merely contains those letters', () => {
    for (const name of ['مجموعة أدوات يدوية', 'طقم مجموعة مفاتيح', 'درابزين حديدي', 'خزان مياه إجمالي السعة 5000 لتر', 'Totalizer flow meter', 'لوحة توزيع رئيسية', '']) {
      expect(`${name}: ${isTotalLine(name)}`).toBe(`${name}: false`)
    }
  })
})

describe('the document, not the reader, supplies the denominator', () => {
  const codes = Array.from({ length: 60 }, (_, i) => `0${2025001 + i}`)
  const text = codes.map((c, i) => `${c} حفر وخنادق للأساسات بند رقم ${i} م3 655.80`).join('\n')

  it('counts distinct MasterFormat and hierarchical codes', () => {
    expect(countDistinctItemCodes(text)).toBe(60)
    expect(countDistinctItemCodes('B.02.02.03.01 SMDB-1\nB.02.02.03.02 SMDB-2\nB.02.02.03.01 again')).toBe(2)
    expect(countDistinctItemCodes('هاتف 0112345678 وسجل 1010123456')).toBe(0)
  })

  it('flags a read that returned a handful of rows from a document printing sixty item codes', () => {
    const apiLines = [
      { id: 1, name: 'أعمال الموقع إجمالي', qty: '15,061', unit: 'عدد' },
      { id: 2, name: 'اعمال خرسانة إجمالي', qty: '108,276', unit: 'عدد' },
      { id: 3, name: 'مبنى غرفة الكهرباء', qty: '3', unit: 'عدد' },
    ]
    const r = resolveParsedLines({ apiLines, text, fileName: 'site.pdf' })
    expect(r.lines.some((l) => isTotalLine(l.name))).toBe(false)
    expect(r.codedItemsSuspect).toBe(true)
    expect(r.codedItemsDetail).toContain('60')
  })

  it('stays silent on a document with no item codes', () => {
    const r = resolveParsedLines({ apiLines: [{ id: 1, name: 'درابزين حديدي', qty: '385', unit: 'م ط' }], text: 'درابزين حديدي 385 م ط', fileName: 'x.pdf' })
    expect(r.codedItemsSuspect).toBe(false)
  })
})

describe('a server-verified read is judged as what it is', () => {
  const HEADER = ['اسم المادة', 'الكمية', 'الوحدة', 'المواصفة الفنية', 'موقع التوريد', 'ملاحظات']
  const verified = (code: string, page: number, extra = '') =>
    `بند الكراسة: ${code} — صفحة الكميات: ${page} — قراءة آلية مُتحقَّق من كودها وكميتها على الصفحة${extra}`

  it('carries the printed code, the verification and work-only from the notes cell', async () => {
    const { rowsToLines } = await import('./parseBoq')
    const lines = rowsToLines([
      HEADER,
      ['خرسانة مسلحة 35 ميجاباسكال', 70.41, 'م3', 'خرسانة مسلحة للقواعد', '', verified('03300004', 1)],
      ['حفر وخنادق للأساسات', 655.8, 'م3', 'حفر', '', verified('02025002', 1, ' — عمل بلا توريد')],
      ['درابزين حديدي', 385, 'م ط', 'درابزين', '', 'بند الكراسة: 1 — صفحة الكميات: 28'],
    ])
    expect(lines.map((l) => [l.itemCode, l.codeVerified, l.workOnly])).toEqual([
      ['03300004', true, undefined],
      ['02025002', true, true],
      [undefined, undefined, undefined],
    ])
  })

  it('does not call a verified read invalid because materials repeat', async () => {
    const { rowsToLines } = await import('./parseBoq')
    const rows: unknown[] = [HEADER]
    for (let i = 0; i < 60; i++) rows.push(['خرسانة مسلحة 30 ميجاباسكال', 10 + i, 'م3', `بند ${i}`, '', verified(`0330${String(1000 + i)}`, 2)])
    const apiLines = rowsToLines(rows)
    const r = resolveParsedLines({ apiLines, text: '', fileName: 'site.pdf' })
    expect(r.lines.length).toBe(60)
    expect(r.descriptionColumnSuspect).toBe(false)
  })

  it('still calls a geometry read invalid when its names repeat like a category column', () => {
    const apiLines = Array.from({ length: 60 }, (_, i) => ({ id: i + 1, name: 'الخوادم والحوسبة المؤسسية', qty: String(i + 1), unit: 'جهاز' }))
    const r = resolveParsedLines({ apiLines, text: '', fileName: 'dc.pdf' })
    expect(r.descriptionColumnSuspect).toBe(true)
  })

  it('never gives two lines the same id, whatever the codes look like', async () => {
    const { rowsToLines } = await import('./parseBoq')
    const rows: unknown[] = [HEADER]
    // 400 verified rows whose codes would parse to small numbers that collide with positions
    for (let i = 0; i < 400; i++) rows.push([`مادة ${i}`, i + 1, 'عدد', `وصف ${i}`, '', verified(`0${3300000 + i}`, 1 + (i % 9))])
    // and a few legacy rows whose «بند الكراسة» IS a row number, including clashes
    for (const n of [5, 330, 330, 401]) rows.push([`بند قديم ${n}`, 1, 'عدد', 'x', '', `بند الكراسة: ${n} — صفحة الكميات: 2`])
    const lines = rowsToLines(rows)
    expect(lines.length).toBe(404)
    expect(new Set(lines.map((l) => l.id)).size).toBe(404)
  })
})
