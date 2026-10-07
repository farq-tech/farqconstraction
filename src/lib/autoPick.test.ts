import { describe, expect, it } from 'vitest'
import type { BOQItem, Supplier } from '../types'
import { autoPickConfident, autoPickFor, buildPickContext, isPriorQuoter } from './autoPick'

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

describe('autoPickConfident — all sure and near-certain matches on every channel', () => {
  const wa = (id: string, extra: Partial<Supplier> = {}): Supplier => ({ ...sup(id, 'نشاط متطابق'), channel: 'واتساب', ...extra })
  const mail = (id: string, extra: Partial<Supplier> = {}): Supplier => ({ ...sup(id, 'نشاط متطابق'), channel: 'بريد', ...extra })
  it('takes every near-certain channel match, never unrelated family suggestions', () => {
    const item = line(1, 'masonry_blocks', [
      wa('wa-name', { why: 'الاسم: «للبلوك»' }),
      wa('wa-activity', { why: 'النشاط المسجّل: «بلوك اسمنتي»' }),
      wa('wa-lineword', { why: 'كلمة البند: «بلوك»' }),
      wa('wa-haraj', { why: 'وسوم حراج: «بلوك»' }),
      wa('wa-other-city', { why: 'الاسم: «بلوك» — خارج مدينة الطلب', outOfCity: true }),
      mail('mail-lineword', { why: 'كلمة البند: «بلوك»' }),
      mail('mail-maybe', { evidence: 'على مستوى النشاط', why: 'نشاط العائلة: «مواد بناء»' }),
      wa('wa-maybe', { evidence: 'على مستوى النشاط' }),
    ], {
      outcomeSuggestion: { suppliers: [{ ...wa('wa-priced'), roundOutcome: { grade: 'PRICED', pricedLines: 2 } }, { ...wa('wa-similar', { evidence: 'نتائج الجولات' }), roundOutcome: { grade: 'SIMILAR' } }] },
    })
    const ids = autoPickConfident(item).map((s) => s.id)
    expect(ids).toEqual(['wa-priced', 'wa-name', 'wa-activity', 'wa-lineword', 'wa-haraj', 'mail-lineword'])
  })
  it('retains stronger product evidence hidden by an earlier weak duplicate', () => {
    const item = line(9, 'cement', [], {
      suppliers: [wa('same', { evidence: 'دليل منتج' })],
      outcomeSuggestion: { suppliers: [wa('same', { evidence: 'نتائج الجولات', roundOutcome: { grade: 'SIMILAR' } })] },
    })
    expect(autoPickConfident(item).map(s => [s.id, s.evidence])).toEqual([['same', 'دليل منتج']])
  })
  it('does not let a weak outcome override independent product evidence on one record', () => {
    const item = line(11, 'cement', [wa('same', { evidence: 'دليل منتج', roundOutcome: { grade: 'SIMILAR' } })])
    expect(autoPickConfident(item).map(s => s.id)).toEqual(['same'])
  })
  it('preserves restrictive delivery location across duplicate proof lanes', () => {
    const item = line(12, 'cement', [], {
      suppliers: [wa('same', { evidence: 'دليل منتج' })],
      outcomeSuggestion: { suppliers: [wa('same', { outOfCity: true, evidence: 'نتائج الجولات', roundOutcome: { grade: 'SIMILAR' } })] },
    })
    expect(autoPickConfident(item)).toEqual([])
    expect(autoPickFor(item).map(s => s.id)).toEqual(['same'])
  })
  it('recognizes the buyer-choice lane without a redundant learned flag', () => {
    const item = line(10, 'cement', [], { learnedSuggestion: { suppliers: [wa('chosen', { evidence: 'اختيارك' })] } })
    expect(autoPickConfident(item).map(s => s.id)).toEqual(['chosen'])
    expect(autoPickConfident({ ...item, rejectedSupplierIds: ['chosen'] })).toEqual([])
  })
  it('keeps historical evidence outside the delivery city for manual review', () => {
    const item = line(6, 'cement', [
      wa('historical-away', { outOfCity: true, priorQuotes: 5 }),
      wa('learned-away', { outOfCity: true, learned: true }),
      wa('local', { why: 'الاسم: «اسمنت»' }),
    ])
    expect(autoPickFor(item).map(s => s.id)).toContain('historical-away')
    expect(autoPickConfident(item).map(s => s.id)).toEqual(['local'])
  })
  it('counts the same unlimited confirmed picks for upload and proposals', () => {
    const suppliers = Array.from({ length: 25 }, (_, i) => wa(`seller-${i}`, { why: 'الاسم: «اسمنت»' }))
    const items = [line(7, 'cement', suppliers), line(8, 'cement', suppliers.slice(5))]
    const context = buildPickContext(items)
    const selected = items.map(item => autoPickConfident(item, context))
    expect(selected.map(list => list.length)).toEqual([25, 20])
    expect(new Set(selected.flat().map(s => s.id)).size).toBe(25)
  })
  it('a rejected supplier stays out even when sure', () => {
    const item = line(2, 'masonry_blocks', [wa('a', { why: 'الاسم: «بلوك»' })], { rejectedSupplierIds: ['a'] })
    expect(autoPickConfident(item)).toEqual([])
  })
  // The owner, 4 Oct 2026: «إذا المصادر الأخرى لا يوجد مورد اختر عادي 100–200، وإذا فيه مليان اختر أفضل 30 لكل بند».
  it('takes every near-certain WhatsApp seller without the old per-channel caps', () => {
    const many = (n: number, mk: (id: string) => Supplier) => Array.from({ length: n }, (_, i) => mk(`${i}`))
    const full = line(3, 'cement', [...many(40, (i) => mail(`m${i}`, { why: 'الاسم: «اسمنت»' })), ...many(500, (i) => wa(`w${i}`, { why: 'الاسم: «اسمنت»' }))])
    const fullIds = autoPickConfident(full).map((s) => s.id)
    expect(fullIds.filter((id) => id.startsWith('m')).length).toBe(40)
    expect(fullIds.filter((id) => id.startsWith('w')).length).toBe(500)
    // Evidence order is preserved even when every matching seller is selected.
    expect(fullIds.filter((id) => id.startsWith('w')).slice(0, 3)).toEqual(['w0', 'w1', 'w2'])

    const thin = line(4, 'cement', [...many(5, (i) => mail(`m${i}`, { why: 'الاسم: «اسمنت»' })), ...many(500, (i) => wa(`w${i}`, { why: 'الاسم: «اسمنت»' }))])
    const thinIds = autoPickConfident(thin).map((s) => s.id)
    expect(thinIds.filter((id) => id.startsWith('w')).length).toBe(500)
    expect(thinIds.filter((id) => id.startsWith('m')).length).toBe(5)

    // Exactly at the threshold counts as full.
    const edge = line(5, 'cement', [...many(30, (i) => mail(`m${i}`, { why: 'الاسم: «اسمنت»' })), ...many(100, (i) => wa(`w${i}`, { why: 'الاسم: «اسمنت»' }))])
    expect(autoPickConfident(edge).filter((s) => s.channel === 'واتساب').length).toBe(100)
  })
})

it('keeps sibling products and broad family evidence for manual review', () => {
  const sibling = { ...sup('steel', 'من الكتالوج'), why: 'منتج شقيق: «انابيب حديديه»' }
  const family = { ...sup('general', 'نشاط متطابق'), why: 'نشاط العائلة: «سباكه»' }
  const direct = { ...sup('ppr', 'نشاط متطابق'), why: 'النشاط المسجّل: «مواسير PPR»' }
  const item = line(1, 'ppr', [sibling, family, direct])
  expect(autoPickConfident(item).map(s => s.id)).toEqual(['ppr'])
  expect(autoPickFor(item).map(s => s.id)).toContain('steel')
  expect(autoPickConfident(line(1, 'ppr', [{ ...sibling, priorQuotes: 1 }])).map(s => s.id)).toEqual(['steel'])
})
