import type { RFQSummary } from '../types'

/**
 * «الكراسات» in the requests list (VITE_BOOKLET_GROUPING=1): requests that are
 * waves of one booklet sit together under it, where its newest request was.
 * A booklet with one visible request, or a request in no booklet, stays a
 * plain row. The list order is otherwise unchanged.
 */
export type RequestRow =
  | { kind: 'rfq'; rfq: RFQSummary }
  | { kind: 'booklet'; booklet: NonNullable<RFQSummary['booklet']>; rfqs: RFQSummary[] }

export function bookletGroupingEnabled(env: Record<string, unknown> = import.meta.env): boolean {
  return String(env?.VITE_BOOKLET_GROUPING || '').trim() === '1'
}

export function groupRequestsByBooklet(rfqs: RFQSummary[]): RequestRow[] {
  const counts = new Map<string, number>()
  for (const r of rfqs) if (r.booklet?.id) counts.set(r.booklet.id, (counts.get(r.booklet.id) || 0) + 1)
  const rows: RequestRow[] = []
  const groups = new Map<string, Extract<RequestRow, { kind: 'booklet' }>>()
  for (const rfq of rfqs) {
    const id = rfq.booklet?.id
    if (!id || (counts.get(id) || 0) < 2) {
      rows.push({ kind: 'rfq', rfq })
      continue
    }
    let group = groups.get(id)
    if (!group) {
      group = { kind: 'booklet', booklet: rfq.booklet!, rfqs: [] }
      groups.set(id, group)
      rows.push(group)
    }
    group.rfqs.push(rfq)
  }
  for (const g of groups.values()) g.rfqs.sort((a, b) => (a.booklet?.waveNumber ?? 0) - (b.booklet?.waveNumber ?? 0))
  return rows
}
