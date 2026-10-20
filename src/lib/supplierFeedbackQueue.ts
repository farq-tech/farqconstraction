export const SUPPLIER_FEEDBACK_BATCH_SIZE = 400

/** Sends queued feedback in API-sized batches, retaining the failed batch for retry. */
export async function drainSupplierFeedbackQueue<T>(
  queue: T[],
  send: (items: T[]) => Promise<{ recorded?: number }>,
  onSaved: (count: number) => void,
  onError: (error: unknown) => void,
): Promise<boolean> {
  while (queue.length) {
    const batch = queue.splice(0, SUPPLIER_FEEDBACK_BATCH_SIZE)
    let result: { recorded?: number }
    try {
      result = await send(batch)
    } catch (error) {
      queue.unshift(...batch)
      onError(error)
      return false
    }
    onSaved(Number.isFinite(result?.recorded) ? Number(result.recorded) : batch.length)
  }
  return true
}
