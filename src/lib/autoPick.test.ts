import { describe, expect, it } from 'vitest'
import type { BOQItem, Supplier } from '../types'
import { AUTO_PICK, AUTO_PICK_EVIDENCE_ONLY, autoPickFor, buildPickContext, isPriorQuoter } from './autoPick'

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

  it('never reorders across lanes: a family-lane specialist does not jump a map supplier (and is not ticked)', () => {
    const item = line(9, 'paints', [general], {
      familySuggestion: { family: 'paints', suppliers: [paint] },
    })
    const context = buildPickContext([...booklet, item])
    expect(autoPickFor(item, 5, context).map((s) => s.id)).toEqual(['عام'])
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

describe('autoPickFor — «مقدّم عروض سابقاً»', () => {
  const quoted = (id: string, evidence: Supplier['evidence'] = 'خريطة فرق'): Supplier => ({ ...sup(id, evidence), priorQuotes: 3 })

  it('takes a supplier who priced this material before, from any lane of the line, right after his own choices', () => {
    const familyQuoter = quoted('دهانات-قديم', 'على مستوى النشاط')
    const item = line(9, 'paints', [general, paint], {
      familySuggestion: { family: 'paints', suppliers: [familyQuoter] },
      learnedSuggestion: { suppliers: [steelA] },
    })
    const context = buildPickContext([...booklet, item])
    expect(autoPickFor(item, 3, context).map((s) => s.id)).toEqual(['حديد-أ', 'دهانات-قديم', 'دهانات'])
    expect(isPriorQuoter(familyQuoter)).toBe(true)
    expect(isPriorQuoter(paint)).toBe(false)
  })

  it('never brings in a prior quoter the line does not list', () => {
    const item = line(9, 'paints', [paint])
    expect(autoPickFor(item, 5).map((s) => s.id)).toEqual(['دهانات'])
  })

  it('a rejected prior quoter stays out', () => {
    const item = line(9, 'paints', [paint, quoted('قديم')], { rejectedSupplierIds: ['قديم'] })
    expect(autoPickFor(item, 5).map((s) => s.id)).toEqual(['دهانات'])
  })
})

describe('autoPickFor — «نتائج الجولات»', () => {
  it('takes who priced this material in an earlier round right after the buyer’s own choices, rejected ones excepted', () => {
    const priced = (id: string): Supplier => ({ ...sup(id, 'نتائج الجولات'), roundOutcome: { grade: 'PRICED', pricedLines: 3 } })
    const item = line(9, 'cable_accessories', [sup('مصنع'), sup('متجر')], {
      learnedSuggestion: { suppliers: [sup('اختياره', 'اختيارك')] },
      outcomeSuggestion: { suppliers: [priced('الرطبة'), priced('بيت الكهرباء'), priced('مرفوض')] },
      rejectedSupplierIds: ['مرفوض'],
    })
    expect(autoPickFor(item, 4).map((s) => s.id)).toEqual(['اختياره', 'الرطبة', 'بيت الكهرباء', 'مصنع'])
  })
})

describe('autoPickFor — precision over padding (AUTO_PICK_EVIDENCE_ONLY)', () => {
  const graded = (id: string, grade: NonNullable<Supplier['roundOutcome']>['grade']): Supplier => ({
    ...sup(id, 'نتائج الجولات'),
    roundOutcome: { grade },
  })

  it('is on, with a ceiling of ten', () => {
    expect(AUTO_PICK_EVIDENCE_ONLY).toBe(true)
    expect(AUTO_PICK).toBe(10)
  })

  it('shows but never ticks activity-grade map suppliers or the family lane', () => {
    const item = line(9, 'paints', [paint, sup('نشاط-1', 'على مستوى النشاط'), sup('نشاط-2', 'على مستوى النشاط')], {
      familySuggestion: { family: 'paints', suppliers: [sup('قطاع-1', 'على مستوى النشاط'), sup('قطاع-2', 'على مستوى النشاط')] },
    })
    expect(autoPickFor(item).map((s) => s.id)).toEqual(['دهانات'])
  })

  it('a line with only activity and family suppliers gets no automatic pick', () => {
    const item = line(9, 'paints', [sup('نشاط', 'على مستوى النشاط')], {
      familySuggestion: { family: 'paints', suppliers: [sup('قطاع', 'على مستوى النشاط')] },
    })
    expect(autoPickFor(item)).toEqual([])
  })

  it("ticks round outcomes with evidence for the material, never 'SIMILAR'", () => {
    const item = line(9, 'paints', [], {
      outcomeSuggestion: {
        suppliers: [
          graded('شبيه', 'SIMILAR'),
          graded('سعّر', 'PRICED'),
          graded('ردّ', 'ANSWERED'),
          graded('مع-مادة', 'ALSO_SELLS'),
          graded('قريبة', 'FAMILY_PRICED'),
          sup('بلا-درجة', 'نتائج الجولات'),
        ],
      },
    })
    expect(autoPickFor(item).map((s) => s.id)).toEqual(['سعّر', 'ردّ', 'مع-مادة', 'قريبة'])
  })

  it('does not pad: three evidence-backed suppliers give three picks under a limit of ten', () => {
    const item = line(9, 'paints', [paint], {
      suppliers: [sup('كتالوج', 'من الكتالوج')],
      aiSuggestion: { intent: 'paints_x', family: 'paints', supplierCount: 1, suppliers: [sup('آلي', 'تسمية آلية')] },
      familySuggestion: {
        family: 'paints',
        suppliers: Array.from({ length: 12 }, (_, i) => sup(`قطاع-${i}`, 'على مستوى النشاط')),
      },
      outcomeSuggestion: { suppliers: [graded('شبيه', 'SIMILAR')] },
    })
    expect(autoPickFor(item, 10).map((s) => s.id)).toEqual(['دهانات', 'كتالوج', 'آلي'])
  })

  it('a prior quoter in the activity lane is still evidence and is ticked', () => {
    const quoted: Supplier = { ...sup('سعّر-لنا', 'على مستوى النشاط'), priorQuotes: 2 }
    const item = line(9, 'paints', [paint, quoted])
    expect(autoPickFor(item).map((s) => s.id)).toEqual(['سعّر-لنا', 'دهانات'])
  })

  it('keeps his own choices first and still skips rejected suppliers', () => {
    const item = line(9, 'paints', [paint, sup('مرفوض')], {
      learnedSuggestion: { suppliers: [sup('اختياره', 'اختيارك'), sup('مرفوض-سابق', 'اختيارك')] },
      outcomeSuggestion: { suppliers: [graded('سعّر', 'PRICED')] },
      rejectedSupplierIds: ['مرفوض', 'مرفوض-سابق'],
    })
    expect(autoPickFor(item).map((s) => s.id)).toEqual(['اختياره', 'سعّر', 'دهانات'])
  })
})
