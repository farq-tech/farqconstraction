import { describe, expect, it } from 'vitest'
import type { RFQSummary } from '../types'
import { bookletGroupingEnabled, groupRequestsByBooklet } from './requestGroups'

const rfq = (id: string, booklet?: RFQSummary['booklet']): RFQSummary => ({ id, name: id, items: 1, offers: 0, suppliers: 0, status: 'active', date: '', booklet })
const H301 = (wave: number) => ({ id: 'b-h301', reference: 'PR-H301', waveNumber: wave, waves: 2 })

describe('groupRequestsByBooklet', () => {
  it('puts the waves of one booklet together where its newest request was, in wave order', () => {
    const rows = groupRequestsByBooklet([rfq('c', H301(2)), rfq('lone'), rfq('a', H301(1))])
    expect(rows.map((r) => (r.kind === 'rfq' ? r.rfq.id : `${r.booklet.reference}:${r.rfqs.map((x) => x.id).join(',')}`))).toEqual(['PR-H301:a,c', 'lone'])
  })

  it('leaves a booklet with one visible request, and requests without a booklet, as plain rows', () => {
    const rows = groupRequestsByBooklet([rfq('a', { id: 'own', reference: 'RFQ-a', waveNumber: 1, waves: 1 }), rfq('b')])
    expect(rows.every((r) => r.kind === 'rfq')).toBe(true)
  })

  it('is behind VITE_BOOKLET_GROUPING=1', () => {
    expect(bookletGroupingEnabled({})).toBe(false)
    expect(bookletGroupingEnabled({ VITE_BOOKLET_GROUPING: '0' })).toBe(false)
    expect(bookletGroupingEnabled({ VITE_BOOKLET_GROUPING: '1' })).toBe(true)
  })
})
