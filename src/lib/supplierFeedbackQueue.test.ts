import { describe, expect, it, vi } from 'vitest'
import {
  drainSupplierFeedbackQueue,
  loadSupplierFeedbackQueue,
  persistSupplierFeedbackQueue,
  SUPPLIER_FEEDBACK_BATCH_SIZE,
} from './supplierFeedbackQueue'

function storageFixture() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
    data,
  }
}

describe('supplier feedback queue', () => {
  it('sends all feedback in sequential API-sized batches', async () => {
    const queue = Array.from({ length: SUPPLIER_FEEDBACK_BATCH_SIZE + 1 }, (_, index) => index)
    const sizes: number[] = []
    const saved: number[] = []
    const onError = vi.fn()

    const completed = await drainSupplierFeedbackQueue(
      queue,
      async (batch) => {
        sizes.push(batch.length)
        return { recorded: batch.length }
      },
      (count) => saved.push(count),
      onError,
    )

    expect(completed).toBe(true)
    expect(sizes).toEqual([400, 1])
    expect(saved).toEqual([400, 1])
    expect(queue).toEqual([])
    expect(onError).not.toHaveBeenCalled()
  })

  it('puts the failed batch back at the front for a later retry', async () => {
    const queue = [1, 2, 3]
    const error = new Error('offline')
    const send = vi.fn().mockRejectedValue(error)
    const onError = vi.fn()

    const completed = await drainSupplierFeedbackQueue(queue, send, vi.fn(), onError)

    expect(completed).toBe(false)
    expect(send).toHaveBeenCalledTimes(1)
    expect(queue).toEqual([1, 2, 3])
    expect(onError).toHaveBeenCalledWith(error)
  })

  it('restores pending verdicts only for the account that recorded them', () => {
    const storage = storageFixture()
    const queue = [
      { subject_kind: 'INTENT' as const, subject_key: 'stone_slab', supplier_id: 'supplier-a', verdict: 'CHOSEN' as const },
    ]

    expect(persistSupplierFeedbackQueue('buyer-a', queue, storage)).toBe(true)
    expect(loadSupplierFeedbackQueue('buyer-a', storage)).toEqual(queue)
    expect(loadSupplierFeedbackQueue('buyer-b', storage)).toEqual([])
    expect(loadSupplierFeedbackQueue(null, storage)).toEqual([])
  })

  it('clears persisted feedback after successful delivery and ignores malformed rows', () => {
    const storage = storageFixture()
    const queue = [
      { subject_kind: 'LINE_TEXT' as const, subject_key: 'marble flooring', supplier_id: 'supplier-a', verdict: 'REJECTED' as const },
    ]
    expect(persistSupplierFeedbackQueue('buyer-a', queue, storage)).toBe(true)
    storage.setItem('farq_supplier_feedback_v1:buyer-a', JSON.stringify([...queue, { verdict: 'UNKNOWN' }]))
    expect(loadSupplierFeedbackQueue('buyer-a', storage)).toEqual(queue)
    expect(persistSupplierFeedbackQueue('buyer-a', [], storage)).toBe(true)
    expect(loadSupplierFeedbackQueue('buyer-a', storage)).toEqual([])
  })

  it('keeps feedback in memory and reports persistence unavailable when storage fails', () => {
    const storage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('quota') },
      removeItem: () => { throw new Error('blocked') },
    }
    expect(loadSupplierFeedbackQueue('buyer-a', storage)).toEqual([])
    expect(persistSupplierFeedbackQueue('buyer-a', [], storage)).toBe(false)
  })
})
