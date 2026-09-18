/**
 * The coverage pipeline, end to end, on the contract Farq actually returns.
 *
 * Each test here corresponds to a way the old path lost a line or a supplier:
 * the 80-line cap, the 2,500-row directory slice, candidates parsed and dropped,
 * evidence assigned by array index, everything auto-selected, and a failed
 * request rendering as an empty directory.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParsedLine } from './parseBoq'

const matchSpy = vi.fn()
const listSpy = vi.fn()

vi.mock('../api/constructionClient', () => ({
  matchConstructionBoqCatalog: (...args: unknown[]) => matchSpy(...args),
  CONSTRUCTION_BOQ_MATCH_MAX_ROWS: 200,
}))
vi.mock('../api/constructionSuppliers', () => ({
  listConstructionSuppliers: (...args: unknown[]) => listSpy(...args),
}))

const { matchSuppliersForItems } = await import('./parseBoq')

const lines = (count: number): ParsedLine[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `كابل نحاس ${i + 1} مم`,
    qty: '10',
    unit: 'متر',
    spec: 'حسب المواصفة',
  })) as ParsedLine[]

/** A Farq row with `n` confirmed suppliers and `m` family suppliers. */
const row = (
  key: string,
  opts: {
    confirmed?: number
    potential?: number
    autoSelect?: number
    kind?: string
    gapReason?: string | null
    familyOnly?: boolean
  } = {},
) => {
  const confirmed = opts.confirmed ?? 0
  const potential = opts.potential ?? 0
  const autoSelect = opts.autoSelect ?? confirmed
  const confirmedSuppliers = Array.from({ length: confirmed }, (_, i) => ({
    id: `${key}-c${i}`,
    name_ar: `مورد مؤكد ${i}`,
    grade: 'DIRECT' as const,
    channel: 'بريد',
    origin: 'material' as const,
    rfq_eligible: i < autoSelect,
  }))
  const potentialSuppliers = Array.from({ length: potential }, (_, i) => ({
    id: `${key}-p${i}`,
    name_ar: `مورد محتمل ${i}`,
    grade: 'REVIEW' as const,
    channel: 'واتساب',
    origin: (opts.familyOnly ? 'family' : 'intent_map') as 'family' | 'intent_map',
    rfq_eligible: false,
  }))
  return {
    line_key: key,
    key,
    kind: opts.kind ?? 'NAME',
    farq_spec_id: confirmed ? 'power_cables' : null,
    suppliers: confirmedSuppliers,
    potential_suppliers: potentialSuppliers,
    auto_selected_supplier_ids: confirmedSuppliers.filter((s) => s.rfq_eligible).map((s) => s.id),
    resolution: {
      source: confirmed ? 'MATERIAL' : opts.familyOnly ? 'FAMILY' : potential ? 'INTENT_MAP' : 'NONE',
      material: confirmed ? 'power_cables' : null,
      material_name_ar: confirmed ? 'كابلات نحاس' : null,
      family: potential ? 'power_cables' : null,
      intent: 'power_cables',
    },
    coverage: {
      target: 5,
      confirmed,
      potential,
      total: confirmed + potential,
      auto_selected: autoSelect,
      under_target: confirmed + potential < 5,
    },
    gap_reason: opts.gapReason ?? (confirmed + potential === 0 ? 'NO_MAP_COVERAGE' : null),
  }
}

/** Answers every requested key, so batching itself is what is under test. */
const answerAll = () =>
  matchSpy.mockImplementation(async (payload: { lines: Array<{ line_key: string }> }) => ({
    rows: payload.lines.map((l) => row(l.line_key, { confirmed: 2, potential: 3 })),
  }))

beforeEach(() => {
  matchSpy.mockReset()
  listSpy.mockReset()
  listSpy.mockResolvedValue({ suppliers: [], total: 0, limit: 0, offset: 0, source: 'test' })
})

describe('every supplyable line reaches Farq', () => {
  it('sends line 201 of a 201-line booklet (the old cap stopped at 80)', async () => {
    answerAll()
    const result = await matchSuppliersForItems(lines(201))
    const sentKeys = matchSpy.mock.calls.flatMap(
      ([payload]: [{ lines: Array<{ line_key: string }> }]) => payload.lines.map((l) => l.line_key),
    )
    expect(sentKeys).toHaveLength(201)
    expect(sentKeys).toContain('line-201')
    expect(sentKeys).toContain('line-81')
    expect(result.items).toHaveLength(201)
    // THE INVARIANT.
    expect(result.items.filter((i) => i.suppliers.length > 0)).toHaveLength(201)
  })

  it('batches a 1,500-line booklet at the server limit and runs every batch', async () => {
    answerAll()
    const result = await matchSuppliersForItems(lines(1500))
    expect(matchSpy).toHaveBeenCalledTimes(8) // ceil(1500 / 200)
    const sizes = matchSpy.mock.calls.map(([p]: [{ lines: unknown[] }]) => p.lines.length)
    expect(Math.max(...sizes)).toBeLessThanOrEqual(200)
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(1500)
    expect(result.items).toHaveLength(1500)
    expect(result.unmatchedLineCount).toBe(0)
    // No line skipped by a client cap.
    expect(result.items.filter((i) => i.state === 'MATCH_PENDING')).toHaveLength(0)
  })

  it('a supplier far down the directory is returned because Farq, not the browser, searched', async () => {
    // The browser fallback only ever scored the first 2,500 contactable rows.
    // Whoever Farq names is carried through, whatever his directory position.
    matchSpy.mockResolvedValue({
      rows: [
        {
          ...row('line-1', { confirmed: 1 }),
          suppliers: [
            {
              id: 'supplier-at-position-41337',
              name_ar: 'مصنع كابلات',
              grade: 'DIRECT',
              channel: 'بريد',
              origin: 'material',
              rfq_eligible: true,
            },
          ],
          auto_selected_supplier_ids: ['supplier-at-position-41337'],
        },
      ],
    })
    const result = await matchSuppliersForItems(lines(1))
    expect(result.items[0]!.suppliers.map((s) => s.id)).toContain('supplier-at-position-41337')
    // And the 6 MB directory was never fetched on a healthy upload.
    expect(listSpy).not.toHaveBeenCalled()
  })
})

describe('what Farq suggests is shown, and shown for what it is', () => {
  it('map suggestions reach the screen instead of being counted and dropped', async () => {
    matchSpy.mockResolvedValue({ rows: [row('line-1', { confirmed: 0, potential: 4 })] })
    const result = await matchSuppliersForItems(lines(1))
    const item = result.items[0]!
    expect(item.suppliers).toHaveLength(4)
    expect(item.coverage?.resolution).toBe('intent_map')
    expect(item.coverage?.potentialCount).toBe(4)
  })

  it('family suggestions are potential, never a direct match', async () => {
    matchSpy.mockResolvedValue({
      rows: [row('line-1', { confirmed: 0, potential: 3, familyOnly: true })],
    })
    const item = (await matchSuppliersForItems(lines(1))).items[0]!
    expect(item.coverage?.resolution).toBe('family')
    for (const supplier of item.suppliers) {
      expect(supplier.origin).toBe('family')
      expect(supplier.evidence).toBe('مورد محتمل')
      expect(supplier.evidence).not.toBe('دليل مباشر')
      expect(supplier.autoSelectable).toBe(false)
    }
    expect(item.coverage?.autoSelectedSupplierIds).toEqual([])
  })

  it('two confirmed plus family top-up reaches the target with the grades intact', async () => {
    matchSpy.mockResolvedValue({ rows: [row('line-1', { confirmed: 2, potential: 3 })] })
    const item = (await matchSuppliersForItems(lines(1))).items[0]!
    expect(item.coverage?.confirmedCount).toBe(2)
    expect(item.coverage?.potentialCount).toBe(3)
    expect(item.coverage?.totalCount).toBe(5)
    expect(item.state).toBe('SUPPLYABLE_MATCHED')
    const direct = item.suppliers.filter((s) => s.evidence === 'دليل مباشر')
    const maybe = item.suppliers.filter((s) => s.evidence === 'مورد محتمل')
    expect(direct).toHaveLength(2)
    expect(maybe).toHaveLength(3)
    // The three borrowed from the family are NOT sent to on the buyer's behalf.
    expect(item.coverage?.autoSelectedSupplierIds).toHaveLength(2)
  })

  it('a partial map answer still shows the suppliers it did return', async () => {
    // A stale intent-map row is skipped server-side without failing the material.
    // What arrives is a short list, and a short list is still an answer.
    matchSpy.mockResolvedValue({ rows: [row('line-1', { confirmed: 0, potential: 2 })] })
    const item = (await matchSuppliersForItems(lines(1))).items[0]!
    expect(item.suppliers).toHaveLength(2)
    expect(item.state).toBe('SUPPLYABLE_PARTIAL_COVERAGE')
    expect(item.coverage?.totalCount).toBeLessThan(item.coverage!.targetCount)
  })
})

describe('an empty answer and a missing answer are different', () => {
  it('nothing found anywhere is an honest zero, with Farq’s reason', async () => {
    matchSpy.mockResolvedValue({
      rows: [row('line-1', { confirmed: 0, potential: 0, gapReason: 'NO_MAP_COVERAGE' })],
    })
    const item = (await matchSuppliersForItems(lines(1))).items[0]!
    expect(item.suppliers).toHaveLength(0)
    expect(item.state).toBe('SUPPLYABLE_NO_SUPPLIER')
    expect(item.coverage?.gapReason).toBe('NO_MAP_COVERAGE')
    expect(item.coverage?.degraded).toBeFalsy()
  })

  it('a failed batch mid-booklet does not stop the others, and never reads as zero', async () => {
    let call = 0
    matchSpy.mockImplementation(async (payload: { lines: Array<{ line_key: string }> }) => {
      call += 1
      if (call === 2) throw new Error('503 from Farq')
      return { rows: payload.lines.map((l) => row(l.line_key, { confirmed: 2, potential: 3 })) }
    })
    const result = await matchSuppliersForItems(lines(600))
    expect(matchSpy).toHaveBeenCalledTimes(3)
    expect(result.items).toHaveLength(600)
    // 200 lines lost their answer; 400 kept theirs.
    expect(result.unmatchedLineCount).toBe(200)
    expect(result.items.filter((i) => i.state === 'MATCH_FAILED')).toHaveLength(200)
    expect(result.items.filter((i) => i.suppliers.length > 0)).toHaveLength(400)
    // The crucial distinction: not one of them claims «no supplier».
    expect(result.items.filter((i) => i.state === 'SUPPLYABLE_NO_SUPPLIER')).toHaveLength(0)
    expect(result.degraded || result.unmatchedLineCount > 0).toBe(true)
    expect(result.matchWarning).toBeTruthy()
  })

  it('a total outage is reported as degraded, not as a confident empty result', async () => {
    matchSpy.mockRejectedValue(new Error('network down'))
    listSpy.mockResolvedValue({
      suppliers: [
        { id: 'kw-1', name: 'مؤسسة كابل', category: 'كهرباء', activity: 'كابل', city: 'الرياض', hasEmail: true },
      ],
      total: 1,
      limit: 1,
      offset: 0,
      source: 'test',
    })
    const result = await matchSuppliersForItems(lines(3))
    expect(result.degraded || result.unmatchedLineCount > 0).toBe(true)
    expect(result.matchWarning).toContain('البحث النصي')
    for (const item of result.items) {
      for (const supplier of item.suppliers) {
        // A keyword hit is never dressed as evidence, and never pre-ticked.
        expect(supplier.evidence).toBe('مورد محتمل')
        expect(supplier.origin).toBe('degraded_search')
        expect(supplier.autoSelectable).toBe(false)
        expect(supplier.grade).toBeUndefined()
      }
      expect(item.coverage?.degraded).toBe(true)
      expect(item.coverage?.autoSelectedSupplierIds).toEqual([])
    }
  })
})

describe('auto-selection is Farq’s verdict, not the array order', () => {
  it('only suppliers Farq vetted arrive selectable, review-only never does', async () => {
    matchSpy.mockResolvedValue({
      rows: [row('line-1', { confirmed: 4, potential: 4, autoSelect: 2 })],
    })
    const item = (await matchSuppliersForItems(lines(1))).items[0]!
    expect(item.coverage?.autoSelectedSupplierIds).toEqual(['line-1-c0', 'line-1-c1'])
    // Two confirmed suppliers Farq did NOT vet are shown, unticked.
    expect(item.suppliers.filter((s) => s.autoSelectable)).toHaveLength(2)
    expect(item.suppliers.filter((s) => s.origin === 'intent_map' && s.autoSelectable)).toHaveLength(0)
  })

  it('no supplier is graded by his position in the list', async () => {
    matchSpy.mockResolvedValue({ rows: [row('line-1', { confirmed: 6, potential: 0 })] })
    const item = (await matchSuppliersForItems(lines(1))).items[0]!
    // The old code labelled indices 0-2 «نشاط متطابق» and the rest «دليل منتج».
    const labels = new Set(item.suppliers.map((s) => s.evidence))
    expect(labels).toEqual(new Set(['دليل مباشر']))
    expect(item.suppliers.map((s) => s.evidence)).not.toContain('مورد محتمل')
  })

  it('a TAXONOMY grade reads as activity-level, never as direct proof', async () => {
    matchSpy.mockResolvedValue({
      rows: [
        {
          ...row('line-1', { confirmed: 1 }),
          suppliers: [
            { id: 't1', name_ar: 'مورد', grade: 'TAXONOMY', channel: 'بريد', origin: 'material', rfq_eligible: false },
          ],
          auto_selected_supplier_ids: [],
        },
      ],
    })
    const item = (await matchSuppliersForItems(lines(1))).items[0]!
    expect(item.suppliers[0]!.evidence).toBe('نشاط متطابق')
    expect(item.suppliers[0]!.autoSelectable).toBe(false)
  })
})

describe('progressive rendering', () => {
  it('shows every line before the first batch returns, and never invents a count', async () => {
    answerAll()
    const snapshots: number[] = []
    const progress: Array<{ matched: number; total: number }> = []
    await matchSuppliersForItems(lines(500), {
      onPartial: (items) => snapshots.push(items.length),
      onProgress: (p) => progress.push({ matched: p.matched, total: p.total }),
    })
    // The first snapshot already holds all 500 lines, in a pending state.
    expect(snapshots[0]).toBe(500)
    expect(progress.at(-1)).toEqual({ matched: 500, total: 500 })
    // Progress only ever counts lines whose batch actually came back.
    expect(progress.every((p) => p.matched <= p.total)).toBe(true)
  })
})
