import { describe, expect, it } from 'vitest'
import { analyzeComparisonLine, priceDifference, type ComparisonCell, type ComparisonLine } from './lineOfferComparison'
const cell = (supplier_id: string, unit_price: number, extra: Partial<ComparisonCell> = {}): ComparisonCell => ({ supplier_id, unit_price, line_total: unit_price * 10, quantity: 10, currency: 'SAR', prices_include_tax: false, status: 'PRICED', ...extra })
const line = (offers: ComparisonCell[]): ComparisonLine => ({ id: 'l1', name_ar: 'حديد', quantity: 10, uom: 'طن', offers })

describe('clear, comparable item prices', () => {
  it('finds the lowest line total and shows the exact difference in both views', () => {
    const low = cell('A', 40), high = cell('B', 50)
    const result = analyzeComparisonLine(line([high, low]))
    expect(result.lowestSupplierIds).toEqual(['A'])
    expect(result.minimum).toBe(400)
    expect(result.gap).toBe(100)
    expect(priceDifference(high, result, 'total')).toEqual({ amount: 100, percent: 25 })
    expect(priceDifference(high, result, 'unit')).toEqual({ amount: 10, percent: 25 })
  })
  it('marks all equal lowest offers rather than selecting an arbitrary supplier', () => {
    const result = analyzeComparisonLine(line([cell('A', 40), cell('B', 40), cell('C', 50)]))
    expect(result.lowestSupplierIds).toEqual(['A', 'B'])
    expect(result.comparable).toBe(true)
  })
  it('does not call a single offer cheapest', () => {
    expect(analyzeComparisonLine(line([cell('A', 40)])).lowestSupplierIds).toEqual([])
    expect(analyzeComparisonLine(line([cell('A', 40)])).reason).toContain('عرض واحد')
  })
  it('excludes unavailable, missing, negative and nonfinite prices', () => {
    const result = analyzeComparisonLine(line([cell('A', 40), cell('B', 50), cell('C', 1, { status: 'UNAVAILABLE' }), cell('D', -2), cell('E', NaN), cell('F', 5, { line_total: null }), cell('G', Infinity)]))
    expect(result.priced.map((offer) => offer.supplier_id)).toEqual(['A', 'B'])
    expect(result.lowestSupplierIds).toEqual(['A'])
  })
  it('explains incompatible tax or currency without comparing differences', () => {
    for (const other of [cell('B', 30, { prices_include_tax: true }), cell('B', 30, { prices_include_tax: null }), cell('B', 30, { currency: 'USD' }), cell('B', 30, { currency: '' })]) {
      const result = analyzeComparisonLine(line([cell('A', 40), other]))
      expect(result.lowestSupplierIds).toEqual([])
      expect(result.reason).not.toBeNull()
      expect(priceDifference(other, result, 'total')).toBeNull()
    }
  })
  it('does not compare quantities that differ from the request', () => {
    const result = analyzeComparisonLine(line([cell('A', 40), cell('B', 30, { quantity: 5 })]))
    expect(result.lowestSupplierIds).toEqual([])
    expect(result.reason).toContain('كميات')
  })
  it('rejects a conflicting unit price and line total rather than highlighting different suppliers', () => {
    const result = analyzeComparisonLine(line([cell('A', 40), cell('B', 30, { line_total: 500 })]))
    expect(result.lowestSupplierIds).toEqual([])
    expect(result.reason).toContain('غير متوافقين')
  })
  it('handles a zero price without inventing a percentage', () => {
    const result = analyzeComparisonLine(line([cell('A', 0), cell('B', 10)]))
    expect(result.lowestSupplierIds).toEqual(['A'])
    expect(result.gapPercent).toBeNull()
    expect(priceDifference(cell('B', 10), result, 'unit')).toEqual({ amount: 10, percent: null })
  })
})
