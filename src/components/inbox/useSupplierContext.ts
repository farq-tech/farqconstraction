import { useEffect, useState } from 'react'
import {
  getConstructionComparison,
  getConstructionRfq,
  getConstructionSupplierOutcomes,
  type ConstructionComparison,
  type ConstructionRfq,
  type ConstructionSupplierOutcomeEvent,
} from '../../api/constructionClient'
import { buildSupplierPanel, type SupplierPanelModel } from '../../lib/supplierPanel'

/**
 * One read per request, shared by every supplier of that request and kept for
 * two minutes: moving between a request's suppliers costs nothing, and the API
 * limiter (60 a minute) is not spent on data the screen already has.
 */
const TTL_MS = 120_000

type RequestData = {
  comparison: ConstructionComparison | null
  rfq: ConstructionRfq | null
  outcomes: ConstructionSupplierOutcomeEvent[] | null
  /** Parts that could not be read — the panel shows what did arrive. */
  partial: boolean
}

const cache = new Map<string, { at: number; promise: Promise<RequestData> }>()

function loadRequest(rfqId: string, sealed: boolean): Promise<RequestData> {
  const key = `${rfqId}:${sealed ? 'sealed' : 'open'}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise
  const promise = Promise.allSettled([
    // Sealed: the comparison (which carries prices) is never requested.
    sealed ? getConstructionRfq(rfqId) : getConstructionComparison(rfqId),
    getConstructionSupplierOutcomes(rfqId),
  ]).then(([main, outcomes]) => {
    const data: RequestData = {
      comparison: !sealed && main.status === 'fulfilled' ? (main.value as ConstructionComparison) : null,
      rfq: sealed && main.status === 'fulfilled' ? (main.value as ConstructionRfq) : null,
      outcomes: outcomes.status === 'fulfilled' ? outcomes.value.events || [] : null,
      partial: main.status === 'rejected' || outcomes.status === 'rejected',
    }
    // A failed read is not cached: the next open tries again.
    if (main.status === 'rejected' && outcomes.status === 'rejected') cache.delete(key)
    return data
  })
  cache.set(key, { at: Date.now(), promise })
  return promise
}

export function __resetSupplierContextCache() {
  cache.clear()
}

export type SupplierContextState = {
  model: SupplierPanelModel | null
  loading: boolean
  /** Some or all of the reads failed. */
  partial: boolean
}

export function useSupplierContext(
  inviteId: string,
  rfqId: string | null | undefined,
  locked: boolean | null | undefined,
  enabled = true,
): SupplierContextState {
  const [state, setState] = useState<SupplierContextState>({ model: null, loading: false, partial: false })

  useEffect(() => {
    if (!enabled || !rfqId || locked == null) return
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true }))
    loadRequest(rfqId, Boolean(locked))
      .then((data) => {
        if (cancelled) return
        setState({
          model: buildSupplierPanel({ inviteId, locked: Boolean(locked), ...data }),
          loading: false,
          partial: data.partial,
        })
      })
      .catch(() => {
        if (!cancelled) setState({ model: null, loading: false, partial: true })
      })
    return () => {
      cancelled = true
    }
  }, [inviteId, rfqId, locked, enabled])

  return state
}
