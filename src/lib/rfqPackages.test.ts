import { describe, expect, it } from 'vitest'
import {
  buildRfqPackagesFromSelection,
  departmentForBoqItem,
  dominantEngineeringDepartment,
} from './rfqPackages'
import type { BOQItem } from '../types'

const item = (partial: Partial<BOQItem> & Pick<BOQItem, 'id' | 'name'>): BOQItem => ({
  qty: '1',
  unit: 'عدد',
  status: 'ready',
  state: 'SUPPLYABLE_MATCHED',
  supplierCount: 1,
  suppliers: [],
  ...partial,
})

describe('buildRfqPackagesFromSelection', () => {
  it('builds one package per selected line and never assigns the other supplier’s lines', () => {
    const items = [
      item({
        id: 1,
        name: 'دهان جوتن',
        farqSpecId: 'F-PAINT',
        lineKey: 'paint-1',
      }),
      item({
        id: 2,
        name: 'كيبل نحاس',
        farqSpecId: 'F-CABLE',
        lineKey: 'cable-1',
      }),
      item({
        id: 3,
        name: 'متر ليزر',
        farqSpecId: 'F-LASER',
        lineKey: 'laser-1',
      }),
    ]
    const { packages } = buildRfqPackagesFromSelection({
      items,
      selectedByItem: {
        1: ['S-PAINT'],
        2: ['S-ELEC'],
        3: ['S-ELEC'],
      },
    })
    expect(packages).toHaveLength(3)
    const paintPkg = packages.find((entry) => entry.line_keys.includes('paint-1'))
    const elecKeys = packages
      .filter((entry) => entry.selected_supplier_ids.includes('S-ELEC'))
      .flatMap((entry) => entry.line_keys)
    expect(paintPkg?.selected_supplier_ids).toEqual(['S-PAINT'])
    expect(paintPkg?.category_keys).toEqual(['ARCHITECTURAL'])
    expect(elecKeys).toEqual(['cable-1', 'laser-1'])
    expect(elecKeys).not.toContain('paint-1')
  })

  it('infers departments from Arabic/English item names', () => {
    expect(departmentForBoqItem({ name: 'دهانات الجزيرة عازل' })).toBe('ARCHITECTURAL')
    expect(departmentForBoqItem({ name: 'مولد كهرباء' })).toBe('ELECTRICAL')
    expect(dominantEngineeringDepartment([
      { name: 'دهان' },
      { name: 'عازل' },
      { name: 'كيبل' },
    ])).toBe('ARCHITECTURAL')
  })
})
