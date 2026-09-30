import { describe, expect, it } from 'vitest'
import { buildExecutiveBrief, type BriefLine } from './executiveBrief'
import { briefShareUrl, briefTokenFromHash, decodeBrief, encodeBrief } from './briefShare'

function line(id: string, offers: Array<[string, number, boolean | null]>, quantity = 10): BriefLine {
  const list = offers.map(([supplierId, unitPrice, includesTax]) => ({ supplierId, supplierName: `مورد ${supplierId}`, unitPrice, lineTotal: unitPrice * quantity, includesTax }))
  list.sort((a, b) => a.unitPrice - b.unitPrice)
  return {
    rfqId: 'r', projectTitle: 'مشروع', lineId: id, name: `بند ${id}`, quantity, uom: 'م3', currency: 'SAR',
    offers: list, lowest: list[0], highest: list[list.length - 1],
    spreadValue: (list[list.length - 1].unitPrice - list[0].unitPrice) * quantity,
    spreadPercent: null, mixedTaxBasis: false, excluded: [], unreliable: false,
  }
}

describe('brief share link', () => {
  it('carries every line, price and supplier through the link', async () => {
    const brief = buildExecutiveBrief([{ rfqId: 'r', title: 'مجمّع الدفع', lines: [line('1', [['a', 235, false], ['b', 248, null]]), line('2', [['b', 3.1, true]], 24000)] }])
    brief.excludedPrices = 2
    const brand = { nameAr: 'شركة الدفع', nameEn: 'Al-Dafe', logo: '/brand/company-al-dafe.png' }
    const token = await encodeBrief(brief, brand, '2026-09-29T00:00:00Z')
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)

    const shared = await decodeBrief(token)
    expect(shared.brand).toEqual(brand)
    expect(shared.brief.projects[0].title).toBe('مجمّع الدفع')
    expect(shared.brief.lines.map((l) => [l.name, l.quantity, l.offers.map((o) => [o.supplierName, o.unitPrice, o.includesTax])])).toEqual([
      ['بند 1', 10, [['مورد a', 235, false], ['مورد b', 248, null]]],
      ['بند 2', 24000, [['مورد b', 3.1, true]]],
    ])
    expect(shared.brief.spreadTotal).toBe(130)
    expect(shared.brief.excludedPrices).toBe(2)
  })

  it('reads the token from the fragment and builds the link', () => {
    expect(briefTokenFromHash('#d=abc_-9')).toBe('abc_-9')
    expect(briefTokenFromHash('#x=1')).toBeNull()
    expect(briefShareUrl('https://construction.farq.sa/', 'tok')).toBe('https://construction.farq.sa/?view=brief-share#d=tok')
  })

  it('refuses a damaged link', async () => {
    await expect(decodeBrief('not-a-real-token')).rejects.toThrow()
  })
})
