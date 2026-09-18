/**
 * The server's last answer for a line whose material and family both failed to
 * resolve is the contractors of its trade — «مقاولون عموميون» when even the
 * trade is unknown — marked source SECTOR_CONTRACTORS, grade SECTOR. The client
 * used to drop that mark, so a general contractor arrived looking like a seller
 * of the material's family and filled the five-supplier pick: on the owner's
 * 1,514-line booklet, 89 lines read as covered with nobody who sells their
 * material. These tests drive the real mapping over the raw envelope.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { matchConstructionBoqCatalog } from './constructionClient'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

function respondWith(rows: unknown[]) {
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ ok: true, data: { rows } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  ) as typeof fetch
}

const supplier = (id: string) => ({ id, name_ar: `مؤسسة ${id}`, contact_channels: { email: true } })

describe('the contractors of a trade keep their mark', () => {
  it('SECTOR_CONTRACTORS arrives flagged as trade and labelled as contractors', async () => {
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
    const row = (await matchConstructionBoqCatalog({ rows: [{ key: 'line-1', name: 'بند' }] })).rows[0]!
    expect(row.family_suggestion?.trade).toBe(true)
    expect(row.family_suggestion?.suppliers).toHaveLength(5)
    for (const s of row.family_suggestion?.suppliers || []) expect(s.evidence).toBe('مقاول بهذا النشاط')
  })

  it('grade SECTOR alone is enough', async () => {
    respondWith([
      { key: 'line-1', kind: 'BROWSE', match: null, candidates: [],
        family_suggestion: { grade: 'SECTOR', family: 'sector:ELECTRICAL', suppliers: [supplier('e1')] } },
    ])
    const row = (await matchConstructionBoqCatalog({ rows: [{ key: 'line-1', name: 'بند' }] })).rows[0]!
    expect(row.family_suggestion?.trade).toBe(true)
  })

  it('a real family suggestion is NOT a trade answer and keeps its label', async () => {
    respondWith([
      { key: 'line-1', kind: 'RELATED', match: null, candidates: [],
        family_suggestion: { source: 'MAP_FAMILY_ONLY', grade: 'FAMILY', family: 'sanitary_ware', suppliers: [supplier('f1')] } },
    ])
    const row = (await matchConstructionBoqCatalog({ rows: [{ key: 'line-1', name: 'حوض' }] })).rows[0]!
    expect(row.family_suggestion?.trade).toBe(false)
    expect(row.family_suggestion?.suppliers[0]!.evidence).toBe('على مستوى النشاط')
  })
})
