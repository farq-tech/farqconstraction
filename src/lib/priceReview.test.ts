import { describe, expect, it } from 'vitest'
import type {
  ConstructionBookletDetail,
  ConstructionBookletOffer,
  ConstructionComparison,
  PriceReview,
  SupplierScore,
} from '../api/constructionClient'
import {
  canApplySuggestion,
  followupsLabel,
  heldSummaryLabel,
  isHeldOffer,
  priceReviewErrorText,
  priceReviewText,
  scoreBadgeText,
  scoreBreakdown,
  scoreTitle,
  taxAssumptionsText,
  vatNotStated,
  vatStatusLabel,
} from './priceReview'
import { buildBookletMatrix, cheapestSupplier, columnTotal } from './booklet'
import { cheapestPerLineTotal, lowestPerLine, matrixTotals, sortLinesBySupplier } from './requestFile'
import { priceCutsFor, summarizeBooklet } from './homeOverview'

const review = (over: Partial<PriceReview> = {}): PriceReview => ({
  code: 'TOTAL_AS_UNIT',
  reason_ar: 'يبدو أن السعر إجمالي البند وليس سعر الوحدة',
  reference_unit_price: 40,
  reference_basis: 'PEERS',
  ratio: 100,
  suggested_unit_price: 40,
  suggestion_ar: null,
  quote_version_id: 'qv1',
  line_id: 'l1',
  ...over,
})

const score: SupplierScore = {
  total: 78,
  responsiveness: { points: 15, max: 25, followups: 1 },
  completeness: { points: 16, max: 20, priced: 8, requested: 10 },
  competitiveness: { points: 30, max: 35, lines_compared: 8, all_flagged: false },
  clarity: {
    points: 14,
    max: 20,
    vat_stated: true,
    delivery_or_lead_time_stated: true,
    document: 'LINK',
    document_points: 4,
    unit_clean: true,
  },
}

describe('isHeldOffer', () => {
  it('holds a PRICE_REVIEW cell or any cell carrying a review', () => {
    expect(isHeldOffer({ status: 'PRICE_REVIEW' })).toBe(true)
    expect(isHeldOffer({ status: 'price_review' })).toBe(true)
    expect(isHeldOffer({ status: 'PRICED', price_review: review() })).toBe(true)
    expect(isHeldOffer({ status: 'PRICED', price_review: null })).toBe(false)
    expect(isHeldOffer({ status: 'PRICED' })).toBe(false)
    expect(isHeldOffer(null)).toBe(false)
  })
})

describe('VAT basis', () => {
  it('never reads an unstated basis as «غير شامل»', () => {
    expect(vatStatusLabel(true)).toBe('شامل الضريبة')
    expect(vatStatusLabel(false)).toBe('غير شامل الضريبة')
    expect(vatStatusLabel(null)).toBe('الضريبة غير مذكورة')
    expect(vatStatusLabel(undefined)).toBe('الضريبة غير مذكورة')
    expect(vatNotStated(null)).toBe(true)
    expect(vatNotStated(false)).toBe(false)
    expect(vatNotStated(undefined)).toBe(false)
  })

  it('states both readings of a total whose VAT is unknown', () => {
    expect(
      taxAssumptionsText({
        tax_unknown: true,
        if_tax_excluded: { subtotal: 1000, tax: 150, total: 1150 },
        if_tax_included: { subtotal: 869.57, tax: 130.43, total: 1000 },
      }),
    ).toBe('إن كانت غير شاملة: 1,150 ر.س · إن كانت شاملة: 1,000 ر.س')
    expect(taxAssumptionsText({ tax_unknown: false })).toBeNull()
    expect(taxAssumptionsText(null)).toBeNull()
    expect(taxAssumptionsText({ tax_unknown: true })).toContain('غير مذكورة')
  })
})

describe('priceReviewText', () => {
  it('gives the badge, the reason and a suggestion', () => {
    expect(priceReviewText(review())).toEqual({
      badge: 'يحتاج مراجعة',
      reason: 'يبدو أن السعر إجمالي البند وليس سعر الوحدة',
      suggestion: 'التصحيح المقترح: 40 ر.س',
    })
    expect(priceReviewText(review({ suggestion_ar: 'سعر الوحدة غالبًا 40 ريال' }))!.suggestion).toBe('سعر الوحدة غالبًا 40 ريال')
    expect(priceReviewText(review({ suggested_unit_price: null }))!.suggestion).toBeNull()
    expect(priceReviewText(null)).toBeNull()
  })

  it('offers the suggestion only when there is one', () => {
    expect(canApplySuggestion(review())).toBe(true)
    expect(canApplySuggestion(review({ suggested_unit_price: null }))).toBe(false)
    expect(canApplySuggestion(null)).toBe(false)
  })

  it('names a refusal and a failure in Arabic', () => {
    expect(priceReviewErrorText(Object.assign(new Error('x'), { status: 403 }))).toContain('للمدير')
    expect(priceReviewErrorText(new Error('انقطع الاتصال'))).toBe('تعذّر حفظ المراجعة — انقطع الاتصال')
    expect(priceReviewErrorText(null)).toBe('تعذّر حفظ المراجعة، حاول مرة أخرى.')
  })

  it('labels a supplier with held lines', () => {
    expect(heldSummaryLabel({ held: true, lines: 1 })).toBe('سعر قيد المراجعة')
    expect(heldSummaryLabel({ held: true, lines: 3 })).toBe('3 أسعار قيد المراجعة')
    expect(heldSummaryLabel({ held: false, lines: 0 })).toBeNull()
    expect(heldSummaryLabel(undefined)).toBeNull()
  })
})

describe('supplier score', () => {
  it('reads followups', () => {
    expect(followupsLabel(0)).toBe('من أول رسالة')
    expect(followupsLabel(1)).toBe('بعد متابعة واحدة')
    expect(followupsLabel(3)).toBe('بعد 3 متابعات')
    expect(followupsLabel(null)).toBe('لم يُقدّم عرضاً')
  })

  it('breaks the score down in Arabic', () => {
    expect(scoreBadgeText(score)).toBe('78/100')
    expect(scoreBadgeText(null)).toBeNull()
    expect(scoreBreakdown(score)).toEqual([
      'سرعة الاستجابة 15/25 (بعد متابعة واحدة)',
      'اكتمال البنود 16/20 (8 من 10)',
      'تنافسية السعر 30/35',
      'وضوح العرض 14/20 — الضريبة مذكورة ✓، التوصيل/المدة ✓، المستند: نموذج الرابط (4/5)، الوحدات سليمة ✓',
    ])
    const flagged = { ...score, competitiveness: { ...score.competitiveness, all_flagged: true }, clarity: { ...score.clarity, vat_stated: false, document: 'FILE' } }
    const lines = scoreBreakdown(flagged)
    expect(lines[2]).toBe('تنافسية السعر 30/35 — كل الأسعار قيد المراجعة')
    expect(lines[3]).toContain('الضريبة مذكورة ✗')
    expect(lines[3]).toContain('عرض رسمي/ملف')
    expect(scoreTitle(score).split('\n')[0]).toBe('تقييم المورد 78/100')
    expect(scoreTitle(undefined)).toBe('')
  })
})

type Matrix = NonNullable<ConstructionComparison['quote_matrix']>
const cell = (supplier_id: string, unit_price: number, over: Record<string, unknown> = {}) => ({
  supplier_id,
  status: 'PRICED',
  unit_price,
  line_total: unit_price * 10,
  quantity: 10,
  currency: 'SAR',
  prices_include_tax: false as boolean | null,
  ...over,
})

describe('held prices never win (per-request comparison)', () => {
  // B's 4-riyal price on l1 is held: it would otherwise be the lowest.
  const matrix: Matrix = {
    basis: '',
    requested_line_count: 2,
    supplier_count: 2,
    complete_quote_count: 1,
    lines: [
      { id: 'l1', name_ar: '', quantity: 10, uom: '', offers: [cell('A', 40), cell('B', 4, { status: 'PRICE_REVIEW', price_review: review() })] },
      { id: 'l2', name_ar: '', quantity: 10, uom: '', offers: [cell('A', 20), cell('B', 18)] },
    ],
  }

  it('is not the lowest on its line, even when its status still reads PRICED', () => {
    expect(lowestPerLine(matrix).get('l1')).toBeNull()
    const stillPriced: Matrix = { ...matrix, lines: [{ ...matrix.lines[0]!, offers: [cell('A', 40), cell('B', 4, { price_review: review() })] }] }
    expect(lowestPerLine(stillPriced).get('l1')).toBeNull()
  })

  it('is not in the supplier total, so a partial offer is never the cheapest', () => {
    const totals = matrixTotals(matrix)
    const b = totals.totals.find((t) => t.supplier_id === 'B')!
    expect(b.priced).toBe(1)
    expect(b.complete).toBe(false)
    expect(totals.lowest).toBeNull()
    const basket = cheapestPerLineTotal(matrix, lowestPerLine(matrix), totals.totals)
    expect(basket?.covered).toBe(1)
    expect(basket?.total).toBe(180)
  })

  it('sinks when sorting by that supplier', () => {
    const sorted = sortLinesBySupplier(matrix.lines, { supplierId: 'B', dir: 'asc' })
    expect(sorted.map((l) => l.id)).toEqual(['l2', 'l1'])
  })
})

describe('held prices never win (booklet)', () => {
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
  const held = offer({ supplier_id: 's2', unit_price: 1, total: 10, status: 'PRICE_REVIEW', price_review: review(), previous_unit_price: 50 })
  const detail: ConstructionBookletDetail = {
    booklet: { id: 'b1', reference: 'PR-1', title: null, quote_deadline: null, created_at: null },
    waves: [{ wave_number: 1, rfq_id: 'r1', status: 'SENT', invites: 2, created_at: null }],
    lines: [{ line_key: 'L1', position: 1, name_ar: 'حديد', quantity: 10, uom: 'طن' }],
    suppliers: [
      { supplier_id: 's1', name: 'أ', waves: [1], quoted: true, quote_submitted_at: null, quote_total: null, currency: 'SAR', rfq_id: 'r1' },
      { supplier_id: 's2', name: 'ب', waves: [1], quoted: true, quote_submitted_at: null, quote_total: null, currency: 'SAR', rfq_id: 'r1', price_review_held: true },
    ],
    // A stale server pick naming the held supplier is not trusted either.
    matrix: [{ line_key: 'L1', offers: [offer({}), held], best_supplier_id: 's2' }],
    summary: { unique_suppliers_invited: 2, replies: 2, quotes: 2, lines_with_quotes: 1, lines_total: 1, best_full_booklet: null },
  }

  it('shows the held cell but marks the other supplier best', () => {
    expect(cheapestSupplier([offer({}), held])).toBe('s1')
    const m = buildBookletMatrix(detail)
    const row = m.rows[0]!
    expect(row.best_supplier_id).toBe('s1')
    expect(row.cells.get('s2')!.held).toBe(true)
    expect(row.cells.get('s2')!.best).toBe(false)
    const col = m.columns.find((c) => c.supplier_id === 's2')!
    expect(col.priced_lines).toBe(0)
    expect(col.held_lines).toBe(1)
    expect(col.price_review_held).toBe(true)
    expect(columnTotal(m, col).value).toBeNull()
  })

  it('keeps the home page best and price cuts clear of it', () => {
    const card = summarizeBooklet(detail)
    expect(card.lines[0]!.best!.supplierName).toBe('أ')
    expect(priceCutsFor(detail, card)).toEqual([])
  })
})
