import { describe, expect, it } from 'vitest'
import { cleanLineName, deliveryBeforeDeadline, readQty, wpcDoorSpecificationBlockers } from './sendGuards'
import { buildRfqLinesFromItems, buildRfqPackagesFromSelection, departmentForBoqItem, dominantEngineeringDepartment } from './rfqPackages'
import type { BOQItem } from '../types'

const item = (over: Partial<BOQItem>): BOQItem => ({
  id: 1, name: 'بند', qty: '1', unit: '', status: 'ready', supplierCount: 0, suppliers: [], ...over,
})

describe('WPC door details are complete before sending', () => {
  it('names the missing thickness and color for a WPC door', () => {
    expect(wpcDoorSpecificationBlockers([item({ name: 'باب WPC', qty: '44' })])).toEqual([
      '«باب WPC»: حدّد السماكة واللون قبل الإرسال، من تعديل وصف ومواصفات البند.',
    ])
  })

  it('accepts explicit thickness and color with Arabic-Indic digits', () => {
    expect(wpcDoorSpecificationBlockers([
      item({ name: 'باب WPC', spec: 'السماكة ٤٫٥ سنتي، اللون كريمي' }),
    ])).toEqual([])
  })

  it('does not mistake width and height for thickness', () => {
    expect(wpcDoorSpecificationBlockers([
      item({ name: 'باب WPC', spec: 'مقاس 90 × 210 سم، لون أبيض' }),
    ])).toEqual([
      '«باب WPC»: حدّد السماكة قبل الإرسال، من تعديل وصف ومواصفات البند.',
    ])
  })

  it('uses spec-card thickness and finish when the free-text description is short', () => {
    expect(wpcDoorSpecificationBlockers([
      item({ name: 'باب WPC', specCard: { thickness: '4.5 سم', finish: 'كريمي' } }),
    ])).toEqual([])
  })

  it('does not mistake a matte finish for a requested color', () => {
    expect(wpcDoorSpecificationBlockers([
      item({ name: 'باب WPC', specCard: { thickness: '4.5 سم', finish: 'مطفي' } }),
    ])).toEqual([
      '«باب WPC»: حدّد اللون قبل الإرسال، من تعديل وصف ومواصفات البند.',
    ])
  })

  it('does not accept an unknown color or a color chosen later', () => {
    for (const spec of ['السماكة ٤٫٥ سم، اللون غير محدد', 'السماكة ٤٫٥ سم، اللون حسب اختيار المالك']) {
      expect(wpcDoorSpecificationBlockers([item({ name: 'باب WPC', spec })])).toEqual([
        '«باب WPC»: حدّد اللون قبل الإرسال، من تعديل وصف ومواصفات البند.',
      ])
    }
  })

  it('does not block non-WPC doors or WPC materials that are not doors', () => {
    expect(wpcDoorSpecificationBlockers([
      item({ name: 'باب خشب', spec: '' }),
      item({ name: 'ألواح WPC', spec: '' }),
    ])).toEqual([])
  })
})

describe('a quantity is read or refused, never defaulted', () => {
  it('reads western, grouped and Arabic-Indic numbers', () => {
    expect(readQty('1,200')).toBe(1200)
    expect(readQty('٣٥٠')).toBe(350)
    expect(readQty('12.5')).toBe(12.5)
    expect(readQty('١٢٫٥')).toBe(12.5)
  })
  it('refuses what used to be sent as 1', () => {
    for (const raw of ['', ' ', '0', '-4', 'حسب المخطط', 'L.S', '—']) expect(readQty(raw)).toBeNull()
  })
})

describe('a line name a supplier can read', () => {
  it('drops unmapped PDF glyphs and control characters', () => {
    const dirty = `مواسير${String.fromCharCode(0)} ${String.fromCharCode(0xfffd)}PPR${String.fromCharCode(7)}  32`
    expect(cleanLineName(dirty)).toBe('مواسير PPR 32')
  })
})

describe('nothing on an RFQ line is invented', () => {
  it('sends no unit and no pack when the booklet gave none', () => {
    const [line] = buildRfqLinesFromItems([item({ unit: '' })])
    expect(line!.uom).toBeNull()
    expect(line!.pack).toBeNull()
  })
  it('keeps the booklet unit when there is one', () => {
    expect(buildRfqLinesFromItems([item({ unit: 'م³' })])[0]!.uom).toBe('م³')
  })
  it('does not call an unclassifiable line electrical', () => {
    expect(departmentForBoqItem({ name: 'مظلات سيارات' })).toBeNull()
    expect(dominantEngineeringDepartment([{ name: 'مظلات سيارات' }])).toBeNull()
    expect(dominantEngineeringDepartment([{ name: 'مظلات' }, { name: 'خرسانة جاهزة' }])).toBe('CIVIL')
  })
  it("gives an unclassified line the buyer's chosen department, not a guess", () => {
    const { packages } = buildRfqPackagesFromSelection({
      items: [item({ id: 7, name: 'مظلات سيارات' })],
      selectedByItem: { 7: ['s1'] },
      fallbackDepartment: 'ARCHITECTURAL',
    })
    expect(packages[0]!.category_keys).toEqual(['ARCHITECTURAL'])
  })
  it('each supplier is attached only to the lines picked for them', () => {
    const { packages } = buildRfqPackagesFromSelection({
      items: [item({ id: 1, name: 'خرسانة', lineKey: 'line-1' }), item({ id: 2, name: 'دهان', lineKey: 'line-2' })],
      selectedByItem: { 1: ['a', 'b'], 2: ['b'] },
    })
    const linesFor = (s: string) => packages.filter((p) => p.selected_supplier_ids.includes(s)).flatMap((p) => p.line_keys)
    expect(linesFor('a')).toEqual(['line-1'])
    expect(linesFor('b').sort()).toEqual(['line-1', 'line-2'])
  })
})

describe('the delivery date never falls before the quote deadline', () => {
  it('refuses a delivery day before the deadline, allows the same day and later', () => {
    expect(deliveryBeforeDeadline('2026-10-05', '2026-10-09')).toBe(true)
    expect(deliveryBeforeDeadline('2026-10-09', '2026-10-09')).toBe(false)
    expect(deliveryBeforeDeadline('2026-10-20', '2026-10-09')).toBe(false)
    expect(deliveryBeforeDeadline('2026-10-05T00:00:00.000Z', '2026-10-09')).toBe(true)
  })

  it('leaves missing dates to the other checks', () => {
    expect(deliveryBeforeDeadline('', '2026-10-09')).toBe(false)
    expect(deliveryBeforeDeadline('2026-10-05', null)).toBe(false)
    expect(deliveryBeforeDeadline(undefined, undefined)).toBe(false)
  })
})
