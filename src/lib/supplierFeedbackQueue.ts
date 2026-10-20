import type { SupplierFeedbackItem } from "../api/constructionClient"

export const SUPPLIER_FEEDBACK_BATCH_SIZE = 400
const STORAGE_PREFIX = "farq_supplier_feedback_v1:"

type FeedbackStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

function defaultStorage(): FeedbackStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage
  } catch {
    return null
  }
}

function storageKey(ownerUserId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(ownerUserId)}`
}

function mergeFeedbackItems(...queues: SupplierFeedbackItem[][]): SupplierFeedbackItem[] {
  const latest = new Map<string, SupplierFeedbackItem>()
  for (const queue of queues) {
    for (const item of queue) {
      const key = [item.subject_kind, item.subject_key, item.supplier_id].join("\u0000")
      latest.set(key, item)
    }
  }
  return [...latest.values()]
}

function isFeedbackItem(value: unknown): value is SupplierFeedbackItem {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<SupplierFeedbackItem>
  return (
    ["SPEC", "INTENT", "LINE_TEXT"].includes(String(item.subject_kind)) &&
    typeof item.subject_key === "string" &&
    item.subject_key.length > 0 &&
    item.subject_key.length <= 300 &&
    typeof item.supplier_id === "string" &&
    item.supplier_id.length > 0 &&
    item.supplier_id.length <= 200 &&
    ["CHOSEN", "REJECTED", "CLEARED"].includes(String(item.verdict)) &&
    (item.line_text === undefined || typeof item.line_text === "string")
  )
}

/** Loads only this signed-in user's pending verdicts; another account never inherits them. */
export function loadSupplierFeedbackQueue(
  ownerUserId: string | null,
  storage = defaultStorage(),
): SupplierFeedbackItem[] {
  if (!ownerUserId || !storage) return []
  try {
    const raw = storage.getItem(storageKey(ownerUserId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(isFeedbackItem) : []
  } catch {
    return []
  }
}

/** Persists the pending queue before any network request can remove it from memory. */
export function persistSupplierFeedbackQueue(
  ownerUserId: string | null,
  queue: SupplierFeedbackItem[],
  storage = defaultStorage(),
): boolean {
  if (!ownerUserId || !storage) return false
  try {
    const key = storageKey(ownerUserId)
    if (queue.length) storage.setItem(key, JSON.stringify(queue))
    else storage.removeItem(key)
    return true
  } catch {
    return false
  }
}

/** Sends queued feedback in sequential API-sized batches, retaining the failed batch for retry. */
export async function drainSupplierFeedbackQueue<T>(
  queue: T[],
  send: (items: T[]) => Promise<{ recorded?: number }>,
  onSaved: (count: number) => void,
  onError: (error: unknown) => void,
  onBatchAcknowledged?: (acknowledged: T[]) => boolean,
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
    onSaved(
      Number.isFinite(result?.recorded)
        ? Number(result.recorded)
        : batch.length,
    )
    if (onBatchAcknowledged && !onBatchAcknowledged(batch)) {
      onError(new Error("Saved supplier feedback, but the remaining queue could not be persisted"))
      return false
    }
  }
  return true
}

export type SupplierFeedbackDrainResult = {
  claimed: boolean
  completed: boolean
  persisted: boolean
}

const activeOwnerDrains = new Map<string, Promise<{ completed: boolean; persisted: boolean }>>()
const localOwnerLocks = new Map<string, Promise<unknown>>()
const volatileOwnerQueues = new WeakMap<SupplierFeedbackItem[], SupplierFeedbackItem[]>()

function withLocalOwnerLock<T>(ownerUserId: string, operation: () => Promise<T>): Promise<T> {
  const previous = localOwnerLocks.get(ownerUserId) || Promise.resolve()
  const current = previous.then(operation, operation)
  localOwnerLocks.set(ownerUserId, current)
  return current.finally(() => {
    if (localOwnerLocks.get(ownerUserId) === current) localOwnerLocks.delete(ownerUserId)
  })
}

function withOwnerQueueLock<T>(ownerUserId: string, operation: () => Promise<T>): Promise<T> {
  const lockManager = typeof navigator === "undefined"
    ? undefined
    : (navigator as unknown as {
        locks?: {
          request<R>(name: string, options: { mode: "exclusive" }, callback: () => Promise<R>): Promise<R>
        }
      }).locks
  if (lockManager) {
    return lockManager.request(`farq:supplier-feedback:${encodeURIComponent(ownerUserId)}`, { mode: "exclusive" }, operation)
  }
  return withLocalOwnerLock(ownerUserId, operation)
}

/** Add a buyer choice while holding the same cross-tab lock used by queue drains. */
export async function enqueueSupplierFeedbackForOwner(
  ownerUserId: string,
  queue: SupplierFeedbackItem[],
  items: SupplierFeedbackItem[],
  storage = defaultStorage(),
): Promise<boolean> {
  return withOwnerQueueLock(ownerUserId, async () => {
    // Storage can temporarily fail after a previous choice was queued. Keep
    // only choices known to have failed persistence; the live queue may be
    // stale after another tab has already drained its durable entries.
    const next = mergeFeedbackItems(
      loadSupplierFeedbackQueue(ownerUserId, storage),
      volatileOwnerQueues.get(queue) || [],
      items,
    )
    queue.splice(0, queue.length, ...next)
    const persisted = persistSupplierFeedbackQueue(ownerUserId, queue, storage)
    if (persisted) volatileOwnerQueues.delete(queue)
    else volatileOwnerQueues.set(queue, [...queue])
    return persisted
  })
}

/** Serialize drains across proposals-screen mounts for one buyer in this app runtime. */
export async function drainSupplierFeedbackQueueForOwner(
  ownerUserId: string,
  queue: SupplierFeedbackItem[],
  send: (items: SupplierFeedbackItem[]) => Promise<{ recorded?: number }>,
  onSaved: (count: number) => void,
  onError: (error: unknown) => void,
  storage = defaultStorage(),
): Promise<SupplierFeedbackDrainResult> {
  const active = activeOwnerDrains.get(ownerUserId)
  if (active) {
    const result = await active
    return { claimed: false, ...result }
  }

  const operation = (async () => {
    return withOwnerQueueLock(ownerUserId, async () => {
      // Another tab may have drained this component's stale in-memory copy while
      // we waited for the lock. The durable queue is authoritative.
      queue.splice(0, queue.length, ...mergeFeedbackItems(
        loadSupplierFeedbackQueue(ownerUserId, storage),
        volatileOwnerQueues.get(queue) || [],
      ))
      let persisted = true
      const completed = await drainSupplierFeedbackQueue(queue, send, onSaved, onError, () => {
        const saved = persistSupplierFeedbackQueue(ownerUserId, queue, storage)
        persisted = persisted && saved
        if (saved) volatileOwnerQueues.delete(queue)
        else if (queue.length) volatileOwnerQueues.set(queue, [...queue])
        else volatileOwnerQueues.delete(queue)
        return saved
      })
      const saved = persistSupplierFeedbackQueue(ownerUserId, queue, storage)
      persisted = saved && persisted
      if (saved) volatileOwnerQueues.delete(queue)
      else if (queue.length) volatileOwnerQueues.set(queue, [...queue])
      else volatileOwnerQueues.delete(queue)
      return { completed, persisted }
    })
  })().catch((error) => {
    onError(error)
    return { completed: false, persisted: false }
  })
  activeOwnerDrains.set(ownerUserId, operation)
  try {
    return { claimed: true, ...await operation }
  } finally {
    if (activeOwnerDrains.get(ownerUserId) === operation) activeOwnerDrains.delete(ownerUserId)
  }
}
