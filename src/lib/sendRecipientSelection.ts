import type { BOQItem } from "../types"

export type SelectedRecipient = {
  id: string
  name: string
  channel: string
  lines: number
}

/** Aggregate selected suppliers while retaining their IDs for channel filtering. */
export function collectSelectedRecipients(
  items: readonly Pick<BOQItem, "id" | "suppliers">[],
  selectedByItem: Record<number, string[]>,
): SelectedRecipient[] {
  const byId = new Map<string, SelectedRecipient>()
  for (const item of items) {
    for (const id of selectedByItem[item.id] || []) {
      const known = item.suppliers.find((supplier) => supplier.id === id)
      const entry = byId.get(id) || {
        id,
        name: known?.name || id,
        channel: known?.channel || "",
        lines: 0,
      }
      entry.lines += 1
      byId.set(id, entry)
    }
  }
  return [...byId.values()].sort((a, b) => b.lines - a.lines)
}

export function unavailableHarajRecipientIds(
  recipients: readonly SelectedRecipient[],
  chatReady: boolean | null,
): Set<string> {
  return new Set(
    chatReady === false
      ? recipients
          .filter((recipient) => recipient.channel === "محادثة")
          .map((recipient) => recipient.id)
      : [],
  )
}
