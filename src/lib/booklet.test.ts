import { describe, expect, it } from 'vitest'
import type { ConstructionBookletDetail, ConstructionBookletOffer } from '../api/constructionClient'
import {
  bookletChipText,
  bookletClosed,
  bookletDeliveryText,
  bookletStateLabel,
  statedValidityLabel,
  bookletDeadline,
  bookletMoney,
  buildBookletMatrix,
  coverage,
  formatQuantity,
  sortWaves,
  waveCount,
  waveLabel,
  columnTotal,
} from './booklet'

const offer = (over: Partial<ConstructionBookletOffer>): ConstructionBookletOffer => ({
  supplier_id: 's1',
  unit_price: 10,
  total: 100,
  currency: 'SAR',
  uom: 'م',
  rfq_id: 'r1',
  quote_version_id: 'q1',
  notes: null,
  ...over,
})

const detail = (over: Partial<ConstructionBookletDetail> = {}): ConstructionBookletDetail => ({
  booklet: { id: 'b1', reference: 'PR-H288', title: 'مشروع', quote_deadline: '2026-10-05', created_at: null },
  waves: [
    { wave_number: 2, rfq_id: 'r2', status: 'SENT', invites: 4, created_at: null },
    { wave_number: 1, rfq_id: 'r1', status: 'SENT', invites: 3, created_at: null },
  ],
  lines: [
    { line_key: 'L2', position: 2, name_ar: 'حديد', quantity: 5, uom: 'طن' },
    { line_key: 'L1', position: 1, name_ar: 'أسمنت', quantity: 10, uom: 'كيس' },
    { line_key: 'L3', position: 3, name_ar: 'رمل', quantity: 1, uom: 'م3' },
  ],
  suppliers: [
    { supplier_id: 's1', name: 'مورد أ', waves: [1, 2, 1], quoted: true, quote_submitted_at: null, quote_total: 500, currency: 'SAR', rfq_id: 'r1' },
    { supplier_id: 's2', name: 'مورد ب', waves: [2], quoted: true, quote_submitted_at: null, quote_total: 300, currency: 'SAR', rfq_id: 'r2' },
    { supplier_id: 's3', name: 'مورد ج', waves: [1], quoted: false, quote_submitted_at: null, quote_total: null, currency: null, rfq_id: 'r1' },
  ],
  matrix: [
    { line_key: 'L1', best_supplier_id: 's2', offers: [offer({ supplier_id: 's1', unit_price: 12 }), offer({ supplier_id: 's2', unit_price: 11 })] },
    { line_key: 'L2', best_supplier_id: null, offers: [offer({ supplier_id: 's1', unit_price: 900 })] },
    { line_key: 'L3', best_supplier_id: null, offers: [] },
  ],
  summary: {
    unique_suppliers_invited: 3,
    replies: 2,
    quotes: 2,
    lines_with_quotes: 2,
    lines_total: 3,
    best_full_booklet: null,
  },
  ...over,
})

describe('buildBookletMatrix', () => {
  it('orders rows by position and columns are quoted suppliers, each once', () => {
    const m = buildBookletMatrix(detail())
    expect(m.rows.map((r) => r.line_key)).toEqual(['L1', 'L2', 'L3'])
    expect(m.columns.map((c) => c.supplier_id)).toEqual(['s1', 's2'])
    expect(m.columns[0]!.waves).toEqual([1, 2])
    expect(m.columns[0]!.priced_lines).toBe(2)
    expect(m.lines_total).toBe(3)
    expect(m.lines_with_offers).toBe(2)
  })

  it('flags a line nobody priced as no_offers', () => {
    const m = buildBookletMatrix(detail())
    const l3 = m.rows.find((r) => r.line_key === 'L3')!
    expect(l3.no_offers).toBe(true)
    expect(l3.cells.size).toBe(0)
    expect(l3.best_supplier_id).toBeNull()
  })

  it('uses the server best when it has an offer on the line', () => {
    const m = buildBookletMatrix(detail())
    const l1 = m.rows[0]!
    expect(l1.best_supplier_id).toBe('s2')
    expect(l1.cells.get('s2')!.best).toBe(true)
    expect(l1.cells.get('s1')!.best).toBe(false)
  })

  it('computes the cheapest when the server names none or an absent supplier', () => {
    const m = buildBookletMatrix(
      detail({
        matrix: [
          { line_key: 'L1', best_supplier_id: 'ghost', offers: [offer({ supplier_id: 's1', unit_price: 8 }), offer({ supplier_id: 's2', unit_price: 9 })] },
        ],
      }),
    )
    expect(m.rows[0]!.best_supplier_id).toBe('s1')
  })

  it('marks no best on a tie or across currencies', () => {
    const tie = buildBookletMatrix(
      detail({ matrix: [{ line_key: 'L1', best_supplier_id: null, offers: [offer({ supplier_id: 's1' }), offer({ supplier_id: 's2' })] }] }),
    )
    expect(tie.rows[0]!.best_supplier_id).toBeNull()
    const fx = buildBookletMatrix(
      detail({
        matrix: [
          { line_key: 'L1', best_supplier_id: null, offers: [offer({ supplier_id: 's1', unit_price: 5, currency: 'USD' }), offer({ supplier_id: 's2', unit_price: 9 })] },
        ],
      }),
    )
    expect(fx.rows[0]!.best_supplier_id).toBeNull()
  })

  it('keeps one offer per supplier per line and skips unpriced offers', () => {
    const m = buildBookletMatrix(
      detail({
        matrix: [
          {
            line_key: 'L1',
            best_supplier_id: null,
            offers: [
              offer({ supplier_id: 's1', unit_price: 7, rfq_id: 'r1' }),
              offer({ supplier_id: 's1', unit_price: 6, rfq_id: 'r2' }),
              offer({ supplier_id: 's2', unit_price: null, total: null }),
            ],
          },
        ],
      }),
    )
    const l1 = m.rows[0]!
    expect(l1.cells.size).toBe(1)
    expect(l1.cells.get('s1')!.unit_price).toBe(7)
  })

  it('includes a supplier with offers even when his quoted flag lags', () => {
    const m = buildBookletMatrix(
      detail({
        suppliers: [{ supplier_id: 's1', name: 'مورد أ', waves: [1], quoted: false, quote_submitted_at: null, quote_total: null, currency: null, rfq_id: null }],
        matrix: [{ line_key: 'L1', best_supplier_id: null, offers: [offer({ supplier_id: 's1' })] }],
      }),
    )
    expect(m.columns.map((c) => c.supplier_id)).toEqual(['s1'])
  })

  it('is empty, not broken, for a booklet with zero quotes or a malformed payload', () => {
    const zero = buildBookletMatrix(detail({ matrix: [], suppliers: [] }))
    expect(zero.columns).toEqual([])
    expect(zero.rows.every((r) => r.no_offers)).toBe(true)
    expect(zero.lines_with_offers).toBe(0)
    for (const bad of [null, undefined, {}, { lines: null, matrix: 'x', suppliers: 3 } as unknown as ConstructionBookletDetail]) {
      const m = buildBookletMatrix(bad)
      expect(m.columns).toEqual([])
      expect(m.rows).toEqual([])
    }
  })
})

describe('booklet formatting', () => {
  it('coverage never divides by zero and clamps', () => {
    expect(coverage(0, 0)).toMatchObject({ percent: 0, label: '0 من 0' })
    expect(coverage(3, 4)).toMatchObject({ percent: 75, label: '3 من 4' })
    expect(coverage(9, 4)).toMatchObject({ withQuotes: 4, percent: 100 })
    expect(coverage(null, undefined)).toMatchObject({ label: '0 من 0' })
  })

  it('reads waves as a count or an array', () => {
    expect(waveCount(3)).toBe(3)
    expect(waveCount([{}, {}])).toBe(2)
    expect(waveCount(null)).toBe(0)
    expect(waveLabel(3, 5)).toBe('دفعة 3 من 5')
    expect(waveLabel(3, null)).toBe('دفعة 3')
  })

  it('builds the RFQ chip text, or nothing', () => {
    expect(bookletChipText({ booklet_id: 'b1', reference: 'PR-H288', wave_number: 3, waves: 5 })).toBe(
      'يتبع الكراسة PR-H288 — دفعة 3 من 5',
    )
    expect(bookletChipText({ booklet_id: 'b1', reference: 'PR-H288', wave_number: 2, waves: [{}, {}, {}] })).toBe(
      'يتبع الكراسة PR-H288 — دفعة 2 من 3',
    )
    expect(bookletChipText({ booklet_id: 'b1', reference: null, wave_number: null, waves: null })).toBe('يتبع كراسة')
    expect(bookletChipText(null)).toBeNull()
    expect(bookletChipText({ booklet_id: '', reference: 'X', wave_number: 1, waves: 1 })).toBeNull()
  })

  it('sorts waves by number', () => {
    expect(sortWaves(detail().waves).map((w) => w.wave_number)).toEqual([1, 2])
    expect(sortWaves(null)).toEqual([])
  })

  it('formats money like the request comparison', () => {
    expect(bookletMoney(1234.5, 'SAR')).toBe('1,234.5 ريال')
    expect(bookletMoney(10, null)).toBe('10 ريال')
    expect(bookletMoney(10, 'USD')).toBe('10 USD')
    expect(bookletMoney(null, 'SAR')).toBe('—')
    expect(formatQuantity(1500, 'م')).toBe('1,500 م')
    expect(formatQuantity(null, null)).toBe('—')
  })

  it('reads a plain-date or timestamp deadline, one for all waves', () => {
    const now = Date.parse('2026-10-01T00:00:00Z')
    const plain = bookletDeadline('2026-10-05', now)!
    expect(plain.passed).toBe(false)
    expect(plain.label).toContain('October 2026')
    const ts = bookletDeadline('2026-09-30T12:00:00Z', now)!
    expect(ts.passed).toBe(true)
    expect(ts.label).toContain('3:00 مساءً')
    expect(bookletDeadline(null)).toBeNull()
    expect(bookletDeadline('not a date')).toBeNull()
  })
})

describe('columnTotal', () => {
  it('sums priced lines when the full total is unknown, and says so', () => {
    const cells = (v: number | null) => new Map(v == null ? [] : [['s1', { supplier_id: 's1', total: v, unit_price: v, currency: 'SAR', best: false } as never]])
    const matrix = { columns: [], rows: [{ cells: cells(100) }, { cells: cells(50.5) }, { cells: cells(null) }], lines_total: 3, lines_with_offers: 2 } as never
    const col = { supplier_id: 's1', name: 'x', waves: [1], quote_total: null, currency: 'SAR', rfq_id: null, priced_lines: 2 }
    expect(columnTotal(matrix, col)).toEqual({ value: 150.5, priced: 2, of: 3, complete: false })
    expect(columnTotal(matrix, { ...col, quote_total: 200 })).toEqual({ value: 200, priced: 2, of: 3, complete: true })
  })
})

describe('booklet state and stated validity («عروض الموردين لا تنتهي الصلاحية»)', () => {
  it('open until explicitly CLOSED; an older API with no state reads as open', () => {
    expect(bookletClosed({ state: 'CLOSED', closed_at: '2026-09-28T10:00:00Z' })).toBe(true)
    expect(bookletStateLabel({ state: 'CLOSED' })).toBe('مغلقة')
    for (const b of [{ state: 'OPEN' }, {}, null, undefined]) {
      expect(bookletClosed(b)).toBe(false)
      expect(bookletStateLabel(b)).toBe('مفتوحة')
    }
  })

  it('the supplier’s stated validity is neutral information, past or not; none when not stated', () => {
    const past = statedValidityLabel('2020-01-05T00:00:00Z')
    expect(past).toMatch(/^الصلاحية كما ذكرها المورد: /)
    expect(past).not.toMatch(/انتهت|منتهي|تنتهي/)
    expect(statedValidityLabel(null)).toBeNull()
    expect(statedValidityLabel('not a date')).toBeNull()
  })
})

describe('bookletDeliveryText', () => {
  it("shows the supplier's delivery terms, else the stated charge", () => {
    expect(bookletDeliveryText({ delivery_note: 'بدون شحن — المورد في جدة', delivery: null, currency: 'SAR' })).toBe('بدون شحن — المورد في جدة')
    expect(bookletDeliveryText({ delivery_note: null, delivery: 0, currency: 'SAR' })).toBe('التوصيل مشمول')
    expect(bookletDeliveryText({ delivery_note: '  ', delivery: 150, currency: 'SAR' })).toBe(`التوصيل ${bookletMoney(150, 'SAR')}`)
    expect(bookletDeliveryText({ currency: 'SAR' })).toBeNull()
    expect(bookletDeliveryText(null)).toBeNull()
  })
})
