import { describe, expect, it } from 'vitest'
import { cleanLineName, readQty } from './sendGuards'
import { buildRfqLinesFromItems, buildRfqPackagesFromSelection, departmentForBoqItem, dominantEngineeringDepartment } from './rfqPackages'
import type { BOQItem } from '../types'

const item = (over: Partial<BOQItem>): BOQItem => ({
  id: 1, name: 'بند', qty: '1', unit: '', status: 'ready', supplierCount: 0, suppliers: [], ...over,
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
