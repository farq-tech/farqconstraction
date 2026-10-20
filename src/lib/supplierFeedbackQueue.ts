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
  }
  return true
}
