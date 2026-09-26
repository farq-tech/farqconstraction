import { describe, expect, it } from 'vitest'
import type { BOQItem, Supplier } from '../types'
import { autoPickFor, buildPickContext } from './autoPick'

const sup = (id: string, evidence: Supplier['evidence'] = 'خريطة فرق'): Supplier => ({
  id,
  name: id,
  city: 'الرياض',
  evidence,
  channel: 'بريد',
})

const line = (id: number, family: string, suppliers: Supplier[], extra: Partial<BOQItem> = {}): BOQItem => ({
  id,
  name: `بند ${id}`,
  qty: '1',
  unit: 'عدد',
  status: 'ready',
  supplierCount: 0,
  suppliers: [],
  mapSuggestion: { intent: `${family}_x`, family, supplierCount: suppliers.length, suppliers },
  ...extra,
})

// «عام» is listed under every trade; the others under one family each.
const general = sup('عام')
const steelA = sup('حديد-أ')
const steelB = sup('حديد-ب')
const pipes = sup('مواسير')
const paint = sup('دهانات')

const booklet: BOQItem[] = [
  line(1, 'structural_steel', [general, steelA, steelB]),
  line(2, 'structural_steel', [general, steelB]),
  line(3, 'pipes_fittings', [general, pipes]),
  line(4, 'paints', [general, paint]),
]

describe('buildPickContext', () => {
  it('counts distinct families per supplier, not lines', () => {
    const { breadth } = buildPickContext(booklet)
    expect(breadth.get('عام')).toBe(3)
    expect(breadth.get('حديد-ب')).toBe(1) // on two lines, one family
    expect(breadth.get('مواسير')).toBe(1)
  })

  it('ignores work-only lines and lines with no material', () => {
    const { breadth } = buildPickContext([
      line(1, 'paints', [general], { workOnly: true }),
      { ...line(2, 'paints', [general]), mapSuggestion: undefined, suppliers: [general] },
    ])
    expect(breadth.get('عام')).toBeUndefined()
  })
})

describe('autoPickFor with a context', () => {
  it('puts the specialist before the generalist inside a lane', () => {
    const context = buildPickContext(booklet)
    expect(autoPickFor(booklet[0], 5, context).map((s) => s.id)).toEqual(['حديد-أ', 'حديد-ب', 'عام'])
    expect(autoPickFor(booklet[2], 5, context).map((s) => s.id)).toEqual(['مواسير', 'عام'])
  })

  it('keeps the server order between equals', () => {
    const context = buildPickContext(booklet)
    // حديد-أ and حديد-ب both have breadth 1; أ was listed first.
    expect(autoPickFor(booklet[0], 2, context).map((s) => s.id)).toEqual(['حديد-أ', 'حديد-ب'])
  })

  it('never reorders across lanes: a map supplier still beats a family-lane specialist', () => {
    const item = line(9, 'paints', [general], {
      familySuggestion: { family: 'paints', suppliers: [paint] },
    })
    const context = buildPickContext([...booklet, item])
    expect(autoPickFor(item, 5, context).map((s) => s.id)).toEqual(['عام', 'دهانات'])
  })

  it("leaves the buyer's own earlier choices in their order", () => {
    const item = line(9, 'structural_steel', [steelA], {
      learnedSuggestion: { suppliers: [general, steelB] },
    })
    const context = buildPickContext([...booklet, item])
    expect(autoPickFor(item, 5, context).map((s) => s.id)).toEqual(['عام', 'حديد-ب', 'حديد-أ'])
  })

  it('still drops rejected suppliers and honours the limit', () => {
    const context = buildPickContext(booklet)
    const item = { ...booklet[0], rejectedSupplierIds: ['حديد-أ'] }
    expect(autoPickFor(item, 1, context).map((s) => s.id)).toEqual(['حديد-ب'])
  })

  it('behaves exactly as before without a context', () => {
    expect(autoPickFor(booklet[0]).map((s) => s.id)).toEqual(['عام', 'حديد-أ', 'حديد-ب'])
  })
})
