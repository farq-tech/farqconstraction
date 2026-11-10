import { describe, expect, it } from "vitest"
import {
  collectSelectedRecipients,
  selectedSupplyItems,
  unselectedSupplyItemCount,
  unavailableHarajRecipientIds,
} from "./sendRecipientSelection"

describe("selected RFQ recipients", () => {
  it("warns for unselected supply lines and excludes them and work-only lines from the RFQ", () => {
    const selected = { id: 1, workOnly: false, name: "Pipe", suppliers: [] }
    const unselected = { id: 2, workOnly: false, name: "Valve", suppliers: [] }
    const workOnly = { id: 3, workOnly: true, name: "Install", suppliers: [] }
    const items = [selected, unselected, workOnly]
    const selectedByItem = { 1: ["supplier-1"] }

    expect(unselectedSupplyItemCount(items, selectedByItem)).toBe(1)
    expect(selectedSupplyItems(items, selectedByItem)).toEqual([selected])
  })

  it("keeps supplier IDs so a stopped chat channel excludes only those suppliers", () => {
    const suppliers = Array.from({ length: 52 }, (_, index) => ({
      id: `supplier-${index}`,
      name: `Supplier ${index}`,
      city: "Riyadh",
      evidence: "من الكتالوج" as const,
      channel:
        index < 8
          ? "محادثة" as const
          : index < 12
            ? "بريد" as const
            : "واتساب" as const,
    }))
    const recipients = collectSelectedRecipients([{ id: 1, suppliers }], {
      1: suppliers.map((supplier) => supplier.id),
    })
    const unavailable = unavailableHarajRecipientIds(recipients, false)
    const sendable = recipients.filter(
      (recipient) => !unavailable.has(recipient.id),
    )

    expect(recipients).toHaveLength(52)
    expect(unavailable).toEqual(
      new Set(suppliers.slice(0, 8).map((supplier) => supplier.id)),
    )
    expect(sendable).toHaveLength(44)
    expect(sendable.every((recipient) => recipient.channel !== "محادثة")).toBe(
      true,
    )
  })

  it("does not exclude chat suppliers when that channel is ready", () => {
    const suppliers = [
      {
        id: "haraj-1",
        name: "Chat supplier",
        city: "Riyadh",
        evidence: "من الكتالوج" as const,
        channel: "محادثة" as const,
      },
    ]
    const recipients = collectSelectedRecipients([{ id: 1, suppliers }], {
      1: ["haraj-1"],
    })

    expect(unavailableHarajRecipientIds(recipients, true)).toEqual(new Set())
  })
})
