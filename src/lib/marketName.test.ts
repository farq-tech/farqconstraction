import { describe, expect, it } from 'vitest'
import { rowsToLines } from './parseBoq'
import { buildRfqLinesFromItems, marketNameToSend } from './rfqPackages'
import { bookletText, lineMarketName } from './marketName'
import { buildBookletMatrix } from './booklet'
import { buildRfqEmailPreview } from './rfqEmailPreview'
import type { BOQItem } from '../types'

const HEADER6 = ['اسم المادة', 'الكمية', 'الوحدة', 'المواصفة الفنية', 'موقع التوريد', 'ملاحظات']
const HEADER7 = [...HEADER6, 'الاسم الدارج بالسوق']

// Request 580, as the vision reader returns it: the booklet text untouched,
// the market name in the trailing seventh column ('' when there is none).
const PR580_ROWS = [
  HEADER7,
  ['بلك مقاس 15', 3000, 'حبة', '', '', 'بند الكراسة: 1', 'بلك 15 (بلوك أسمنتي مقاس 15)'],
  ['فوم فاير ريت', 200, 'حبة', '', '', 'بند الكراسة: 2', 'فوم مقاوم للحريق (فاير فوم)'],
  ['فوم اسبراي (حجم كبير)', 20, 'حبة', '', '', 'بند الكراسة: 3', 'فوم بخاخ (سبراي فوم) حجم كبير'],
  ['جسر تعليق اوميجا جبس / W', 500, 'حبة', '', '', 'بند الكراسة: 4', 'أوميجا جبس بورد (قناة W) للأسقف'],
  ['جسر تعليق مين حديد مجلفن / حرف C', 500, 'حبة', '', '', 'بند الكراسة: 5', 'مين تشانل مجلفن (C) للأسقف المعلقة'],
  ['غراء أبو جمل', 100, 'حبة', '', '', 'بند الكراسة: 6', ''],
]

function item(over: Partial<BOQItem> = {}): BOQItem {
  return { id: 1, name: 'فوم فاير ريت', qty: '200', unit: 'حبة', status: 'ready', supplierCount: 0, suppliers: [], lineKey: 'line-1', ...over }
}

describe('market name from the reader', () => {
  it('keeps the booklet text as the name and the seventh column as marketName', () => {
    const lines = rowsToLines(PR580_ROWS)
    expect(lines.map((l) => l.name)).toEqual(PR580_ROWS.slice(1).map((r) => r[0]))
    expect(lines.map((l) => l.marketName)).toEqual([
      'بلك 15 (بلوك أسمنتي مقاس 15)',
      'فوم مقاوم للحريق (فاير فوم)',
      'فوم بخاخ (سبراي فوم) حجم كبير',
      'أوميجا جبس بورد (قناة W) للأسقف',
      'مين تشانل مجلفن (C) للأسقف المعلقة',
      undefined,
    ])
    expect('marketName' in lines[5]!).toBe(false)
  })

  it('a six-column read is exactly what it was', () => {
    const six = rowsToLines([HEADER6, ...PR580_ROWS.slice(1).map((r) => r.slice(0, 6))])
    const seven = rowsToLines(PR580_ROWS).map(({ marketName: _m, ...rest }) => rest)
    expect(six).toEqual(seven)
    expect(six.every((l) => !('marketName' in l))).toBe(true)
  })

  it('a market name that only repeats the booklet text is dropped', () => {
    const [line] = rowsToLines([HEADER7, ['غراء أبو جمل', 1, 'حبة', '', '', '', ' غراء  أبو جمل ']])
    expect(line!.marketName).toBeUndefined()
  })
})

describe('market name on the request lines', () => {
  it('is sent beside the booklet text, which stays name_ar/original_name', () => {
    const [line] = buildRfqLinesFromItems([item({ marketName: 'فوم مقاوم للحريق (فاير فوم)' })])
    expect(line).toMatchObject({ name_ar: 'فوم فاير ريت', original_name: 'فوم فاير ريت', market_name_ar: 'فوم مقاوم للحريق (فاير فوم)' })
  })

  it('an edited market name is the one sent', () => {
    const [line] = buildRfqLinesFromItems([item({ marketName: '  فاير   فوم ' })])
    expect(line!.market_name_ar).toBe('فاير فوم')
  })

  it('cleared, absent or a copy of the booklet text: the line is sent exactly as before', () => {
    const before = buildRfqLinesFromItems([item()])
    expect(Object.keys(before[0]!)).not.toContain('market_name_ar')
    expect(buildRfqLinesFromItems([item({ marketName: '' })])).toEqual(before)
    expect(buildRfqLinesFromItems([item({ marketName: 'فوم فاير ريت' })])).toEqual(before)
    expect(marketNameToSend({ name: 'x', marketName: '   ' })).toBeNull()
  })
})

describe('both names on the buyer and supplier screens', () => {
  it('booklet text prefers Arabic when original_name is English (request 580)', () => {
    expect(bookletText({ original_name: 'Fire rated foam', name_ar: 'فوم فاير ريت' })).toBe('فوم فاير ريت')
    expect(bookletText({ original_name: 'فوم فاير ريت', name_ar: 'فوم' })).toBe('فوم فاير ريت')
    expect(lineMarketName({ original_name: 'فوم', market_name_ar: 'فاير فوم' })).toBe('فاير فوم')
    expect(lineMarketName({ original_name: 'فوم', market_name_ar: 'فوم' })).toBe('')
    expect(lineMarketName({ original_name: 'فوم' })).toBe('')
  })

  it('booklet matrix rows carry the market name only where a wave sent one', () => {
    const matrix = buildBookletMatrix({
      lines: [
        { line_key: 'a', position: 1, name_ar: 'فوم فاير ريت', quantity: 200, uom: 'حبة', market_name_ar: 'فوم مقاوم للحريق (فاير فوم)' },
        { line_key: 'b', position: 2, name_ar: 'غراء أبو جمل', quantity: 100, uom: 'حبة' },
      ],
      matrix: [],
      suppliers: [],
    })
    expect(matrix.rows[0]!.market_name).toBe('فوم مقاوم للحريق (فاير فوم)')
    expect('market_name' in matrix.rows[1]!).toBe(false)
  })

  it('the email preview shows the market name first and the booklet text under it', () => {
    const base = { rfqId: '8d9f7136-c489-4f36-b897-e32f09864ccb', buyerCompany: 'شركة الدفع' }
    const withMarket = buildRfqEmailPreview({ ...base, lines: [{ original_name: 'فوم فاير ريت', market_name_ar: 'فوم مقاوم للحريق (فاير فوم)', quantity: 200, uom: 'حبة' }] })
    expect(withMarket.html).toMatch(/فوم مقاوم للحريق \(فاير فوم\)<\/div>\s*<div[^>]*>كما في الكراسة: فوم فاير ريت/)
    const plain = buildRfqEmailPreview({ ...base, lines: [{ original_name: 'فوم فاير ريت', quantity: 200, uom: 'حبة' }] })
    expect(plain.html).not.toMatch(/كما في الكراسة/)
  })
})
