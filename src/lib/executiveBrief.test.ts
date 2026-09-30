import { describe, expect, it } from 'vitest'
import type { ConstructionComparison } from '../api/constructionClient'
import { briefLinesFromComparison, buildExecutiveBrief, topSpreadLines } from './executiveBrief'

type Cell = NonNullable<ConstructionComparison['quote_matrix']>['lines'][number]['offers'][number]

function cell(supplier_id: string, unit_price: number | null, extra: Partial<Cell> = {}): Cell {
  return { supplier_id, status: 'PRICED', unit_price, line_total: null, quantity: null, currency: 'SAR', prices_include_tax: false, ...extra }
}

function comparison(lines: Array<{ id: string; qty: number; offers: Cell[] }>): ConstructionComparison {
  return {
    rfq: { id: 'rfq-1' } as ConstructionComparison['rfq'],
    supplier_responses: [
      { supplier: { id: 'a', name_ar: 'مورد أ' }, offer: {} },
      { supplier: { id: 'b', name_ar: 'مورد ب' }, offer: {} },
    ],
    awaiting_supplier_ids: [],
    quote_matrix: {
      basis: 'x', requested_line_count: lines.length, supplier_count: 3, complete_quote_count: 0,
      lines: lines.map((l) => ({ id: l.id, name_ar: `بند ${l.id}`, quantity: l.qty, uom: 'م', offers: l.offers })),
    },
  }
}

describe('executive brief', () => {
  it('counts only clean priced cells and sorts cheapest first', () => {
    const lines = briefLinesFromComparison(comparison([
      { id: '1', qty: 10, offers: [cell('a', 12), cell('b', 10), cell('c', 1, { status: 'PRICE_REVIEW', price_review: {} as never }), cell('d', null, { status: 'UNAVAILABLE' })] },
      { id: '2', qty: 5, offers: [cell('a', null, { status: 'NOT_QUOTED' })] },
    ]), 'مشروع', new Map([['c', 'مورد ج']]))
    expect(lines).toHaveLength(1)
    expect(lines[0].offers.map((o) => o.supplierId)).toEqual(['b', 'a'])
    expect(lines[0].spreadValue).toBe(20)
    expect(lines[0].spreadPercent).toBe(20)
    expect(lines[0].mixedTaxBasis).toBe(false)
  })

  it('flags a line whose offers do not share a VAT basis', () => {
    const [line] = briefLinesFromComparison(comparison([
      { id: '1', qty: 1, offers: [cell('a', 100, { prices_include_tax: true }), cell('b', 90, { prices_include_tax: null })] },
    ]), 'مشروع')
    expect(line.mixedTaxBasis).toBe(true)
  })

  it('gives a win only to a sole cheapest of two or more offers', () => {
    const lines = briefLinesFromComparison(comparison([
      { id: '1', qty: 2, offers: [cell('a', 5), cell('b', 7)] },
      { id: '2', qty: 1, offers: [cell('a', 5), cell('b', 5)] },
      { id: '3', qty: 1, offers: [cell('b', 9)] },
    ]), 'مشروع')
    const brief = buildExecutiveBrief([{ rfqId: 'rfq-1', title: 'مشروع', lines }])
    expect(brief.pricedLines).toBe(3)
    expect(brief.comparedLines).toBe(2)
    expect(brief.pricesReceived).toBe(5)
    expect(brief.lowestBasket).toBe(10 + 5 + 9)
    expect(brief.spreadTotal).toBe(4)
    expect(brief.suppliers.find((s) => s.id === 'a')?.wins).toBe(1)
    expect(brief.suppliers.find((s) => s.id === 'b')?.wins).toBe(0)
    expect(topSpreadLines(brief).map((l) => l.lineId)).toEqual(['1'])
  })

  it('drops a price far from its peers and keeps the rest', () => {
    const lines = briefLinesFromComparison(comparison([
      { id: '1', qty: 1, offers: [cell('a', 100), cell('b', 110), cell('c', 1200)] },
    ]), 'مشروع')
    expect(lines[0].offers.map((o) => o.supplierId)).toEqual(['a', 'b'])
    expect(lines[0].excluded.map((o) => o.supplierId)).toEqual(['c'])
    const brief = buildExecutiveBrief([{ rfqId: 'rfq-1', title: 'مشروع', lines }])
    expect(brief.excludedPrices).toBe(1)
    expect(brief.spreadTotal).toBe(10)
  })

  it('leaves out a line whose prices split into two levels', () => {
    const lines = briefLinesFromComparison(comparison([
      { id: '1', qty: 1, offers: [cell('a', 0.03), cell('b', 0.04), cell('c', 0.75), cell('d', 0.9), cell('e', 1), cell('f', 2)] },
    ]), 'مشروع')
    expect(lines[0].unreliable).toBe(true)
    expect(buildExecutiveBrief([{ rfqId: 'rfq-1', title: 'مشروع', lines }]).excludedLines).toBe(1)
  })

  it('drops two stray prices among many without dropping the line', () => {
    const prices = [0.23, 0.25, 0.28, 0.3, 0.3, 0.3, 0.31, 0.4, 0.45, 0.5, 0.6, 1, 1.5]
    const lines = briefLinesFromComparison(comparison([
      { id: '1', qty: 1, offers: prices.map((p, i) => cell(`s${i}`, p)) },
    ]), 'مشروع')
    expect(lines[0].unreliable).toBe(false)
    expect(lines[0].excluded.map((o) => o.unitPrice)).toEqual([1, 1.5])
  })

  it('leaves out a two-offer line whose prices are worlds apart', () => {
    const lines = briefLinesFromComparison(comparison([
      { id: '1', qty: 1, offers: [cell('a', 10), cell('b', 50)] },
      { id: '2', qty: 1, offers: [cell('a', 10), cell('b', 15)] },
    ]), 'مشروع')
    const brief = buildExecutiveBrief([{ rfqId: 'rfq-1', title: 'مشروع', lines }])
    expect(brief.excludedLines).toBe(1)
    expect(brief.lines.map((l) => l.lineId)).toEqual(['2'])
  })
})
