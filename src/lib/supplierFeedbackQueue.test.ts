import { describe, expect, it, vi } from 'vitest'
import { drainSupplierFeedbackQueue, SUPPLIER_FEEDBACK_BATCH_SIZE } from './supplierFeedbackQueue'

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
})
