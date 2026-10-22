import { describe, expect, it } from "vitest"
import {
  collectSelectedRecipients,
  unavailableHarajRecipientIds,
} from "./sendRecipientSelection"

describe("selected RFQ recipients", () => {
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
