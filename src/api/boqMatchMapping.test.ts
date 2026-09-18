/**
 * The API → client mapping, fed the RAW envelope Farq actually sends.
 *
 * This is the seam where backend intelligence used to be lost: the mapping parsed
 * `candidates[]` and kept only `candidates.length`, read nothing of
 * `map_suggestion` / `family_suggestion`, and stamped `evidence: 'نشاط متطابق'`
 * on every supplier it did keep. These tests drive the real function over a real
 * response body, so a field silently dropped again fails here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { matchConstructionBoqCatalog } from './constructionClient'

const originalFetch = globalThis.fetch

/** Farq's envelope: { ok, data: { rows } }. */
function respondWith(rows: unknown[]) {
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ ok: true, data: { rows } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  ) as typeof fetch
}

const supplier = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name_ar: `مورد ${id}`,
  city: 'الرياض',
  contact_channels: { email: true },
  ...extra,
})

beforeEach(() => {
  vi.restoreAllMocks()
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('a confirmed match carries Farq’s grade, not a label we chose', () => {
  it('reads evidence_grade out of product_match.evidence', async () => {
    respondWith([
      {
        key: 'line-1',
        kind: 'NAME',
        match: {
          farq_spec_id: 'power_cables',
          name_ar: 'كابلات نحاس',
          rfq_eligible_supplier_ids: ['s-direct'],
          suppliers: [
            supplier('s-direct', {
              product_match: { evidence: [{ item_id: 'power_cables', status: 'VERIFIED_CATALOG', evidence_grade: 'DIRECT' }] },
            }),
            supplier('s-taxonomy', {
              product_match: { evidence: [{ item_id: 'power_cables', status: 'CATEGORY_MATCHED', evidence_grade: 'TAXONOMY' }] },
            }),
          ],
        },
        candidates: [],
        auto_selected_supplier_ids: ['s-direct'],
      },
    ])
    const { rows } = await matchConstructionBoqCatalog({ rows: [{ key: 'line-1', name: 'كابل' }] })
    const row = rows[0]!
    expect(row.suppliers?.map((s) => s.grade)).toEqual(['DIRECT', 'TAXONOMY'])
    // The old mapping hardcoded 'نشاط متطابق' here for every supplier.
    expect(row.suppliers?.every((s) => s.grade !== undefined)).toBe(true)
    // Only the one Farq vetted is auto-selectable.
    expect(row.auto_selected_supplier_ids).toEqual(['s-direct'])
    expect(row.suppliers?.find((s) => s.id === 's-taxonomy')?.rfq_eligible).toBe(false)
  })

  it('a supplier Farq graded not at all carries no grade', async () => {
    respondWith([
      {
        key: 'line-1',
        kind: 'NAME',
        match: { farq_spec_id: 'x', rfq_eligible_supplier_ids: [], suppliers: [supplier('ungraded')] },
        candidates: [],
      },
    ])
    const row = (await matchConstructionBoqCatalog({ rows: [{ key: 'line-1', name: 'بند' }] })).rows[0]!
    expect(row.suppliers?.[0]!.grade).toBeUndefined()
  })
})

describe('suggestions survive the mapping', () => {
  it('map_suggestion becomes potential suppliers, never confirmed', async () => {
    respondWith([
      {
        key: 'line-1',
        kind: 'RELATED',
        match: null,
        candidates: [],
        map_suggestion: {
          source: 'INTENT_MAP',
          review_required: true,
          intent: 'power_cables',
          family: 'power_cables',
          supplier_count: 2,
          named_supplier_count: 1,
          family_supplier_count: 1,
          below_floor: true,
          suppliers: [supplier('m1', { evidence: 'نشاط متطابق' }), supplier('m2', { evidence: 'على مستوى النشاط' })],
          zero_reason: null,
        },
      },
    ])
    const row = (await matchConstructionBoqCatalog({ rows: [{ key: 'line-1', name: 'كابل' }] })).rows[0]!
    expect(row.suppliers).toEqual([])
    expect(row.potential_suppliers?.map((s) => s.id)).toEqual(['m1', 'm2'])
    expect(row.potential_suppliers?.every((s) => s.origin === 'intent_map')).toBe(true)
    // review_required on Farq's side means never eligible here.
    expect(row.potential_suppliers?.every((s) => s.rfq_eligible === false)).toBe(true)
    expect(row.auto_selected_supplier_ids).toEqual([])
    expect(row.resolution?.source).toBe('INTENT_MAP')
  })

  it('family_suggestion becomes potential and is labelled family', async () => {
    respondWith([
      {
        key: 'line-1',
        kind: 'RELATED',
        match: null,
        candidates: [],
        family_suggestion: {
          source: 'MAP_FAMILY_ONLY',
          grade: 'FAMILY',
          review_required: true,
          family: 'sanitary_ware',
          suppliers: [supplier('f1'), supplier('f2')],
        },
      },
    ])
    const row = (await matchConstructionBoqCatalog({ rows: [{ key: 'line-1', name: 'حوض مطبخ' }] })).rows[0]!
    expect(row.potential_suppliers?.map((s) => s.origin)).toEqual(['family', 'family'])
    expect(row.trade_contractors).toEqual([])
    expect(row.resolution?.source).toBe('FAMILY')
    expect(row.resolution?.family).toBe('sanitary_ware')
  })

  it('SECTOR_CONTRACTORS is bucketed apart from the material suppliers', async () => {
    respondWith([
      {
        key: 'line-1',
        kind: 'BROWSE',
        match: null,
        candidates: [],
        family_suggestion: {
          source: 'SECTOR_CONTRACTORS',
          grade: 'SECTOR',
          review_required: true,
          family: 'general_contracting',
          suppliers: [supplier('gc1'), supplier('gc2'), supplier('gc3'), supplier('gc4'), supplier('gc5')],
        },
      },
    ])
    const row = (await matchConstructionBoqCatalog({ rows: [{ key: 'line-1', name: 'جميع البنود حسب جدول الكميات' }] })).rows[0]!
    expect(row.potential_suppliers).toEqual([])
    expect(row.trade_contractors?.map((s) => s.id)).toEqual(['gc1', 'gc2', 'gc3', 'gc4', 'gc5'])
    expect(row.trade_contractors?.every((s) => s.origin === 'trade_contractor')).toBe(true)
    // FIVE CONTRACTORS ARE NOT FIVE SUPPLIERS.
    expect(row.coverage?.total).toBe(0)
    expect(row.coverage?.trade_contractors).toBe(5)
    expect(row.coverage?.under_target).toBe(true)
    expect(row.resolution?.source).toBe('TRADE_CONTRACTORS')
  })

  it('candidate suppliers become potential instead of being counted and dropped', async () => {
    respondWith([
      {
        key: 'line-1',
        kind: 'RELATED',
        match: null,
        candidates: [
          { id: 'cand-a', farq_spec_id: 'osb-boards', rfq_eligible_supplier_ids: [], suppliers: [supplier('cs1')] },
          { id: 'cand-b', farq_spec_id: 'ply-boards', rfq_eligible_supplier_ids: [], suppliers: [supplier('cs2')] },
        ],
      },
    ])
    const row = (await matchConstructionBoqCatalog({ rows: [{ key: 'line-1', name: 'ألواح' }] })).rows[0]!
    expect(row.candidate_count).toBe(2)
    // Kept, not discarded — but still NOT a confirmed match for the line.
    expect(row.potential_suppliers?.map((s) => s.id)).toEqual(['cs1', 'cs2'])
    expect(row.suppliers).toEqual([])
    expect(row.farq_spec_id).toBeNull()
    // The historic bug: candidates[0] must never become the line's material.
    expect(row.resolution?.material).toBeNull()
  })
})

describe('the server’s own coverage numbers are trusted over ours', () => {
  it('passes Farq’s coverage and gap_reason through unchanged', async () => {
    respondWith([
      {
        key: 'line-1',
        kind: 'NAME',
        match: { farq_spec_id: 'x', rfq_eligible_supplier_ids: ['a'], suppliers: [supplier('a')] },
        candidates: [],
        auto_selected_supplier_ids: ['a'],
        coverage: { target: 5, confirmed: 1, potential: 0, trade_contractors: 0, total: 1, auto_selected: 1, under_target: true },
        gap_reason: 'BELOW_TARGET',
        supplier_coverage: 'CONTACTABLE_SUPPLIERS',
      },
    ])
    const row = (await matchConstructionBoqCatalog({ rows: [{ key: 'line-1', name: 'بند' }] })).rows[0]!
    expect(row.coverage).toEqual({
      target: 5, confirmed: 1, potential: 0, trade_contractors: 0, total: 1, auto_selected: 1, under_target: true,
    })
    expect(row.gap_reason).toBe('BELOW_TARGET')
    expect(row.supplier_coverage).toBe('CONTACTABLE_SUPPLIERS')
  })

  it('a supplier with no contactable channel is not offered at all', async () => {
    respondWith([
      {
        key: 'line-1',
        kind: 'NAME',
        match: {
          farq_spec_id: 'x',
          rfq_eligible_supplier_ids: [],
          suppliers: [
            { id: 'unreachable', name_ar: 'بلا قناة', contact_channels: {} },
            supplier('reachable'),
          ],
        },
        candidates: [],
      },
    ])
    const row = (await matchConstructionBoqCatalog({ rows: [{ key: 'line-1', name: 'بند' }] })).rows[0]!
    expect(row.suppliers?.map((s) => s.id)).toEqual(['reachable'])
  })
})
