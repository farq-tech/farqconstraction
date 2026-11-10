import { beforeEach, describe, expect, it, vi } from "vitest"
import { getRfqCreateIdempotencyKey } from "./rfqCreateIdempotency"

describe("RFQ create idempotency key", () => {
  let entries: Map<string, string>

  beforeEach(() => {
    entries = new Map()
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      clear: () => entries.clear(),
    })
  })

  it("reuses a key for the same payload and separates changed request details", async () => {
    const payload = { lines: [{ name: "كيبل", quantity: 12 }], selected_supplier_ids: ["supplier-a"] }
    const first = await getRfqCreateIdempotencyKey(payload, 1_000)

    expect(await getRfqCreateIdempotencyKey(payload, 2_000)).toBe(first)
    expect(await getRfqCreateIdempotencyKey({ ...payload, selected_supplier_ids: ["supplier-b"] }, 2_000)).not.toBe(first)
  })

  it("starts a new key after the retry window expires", async () => {
    const payload = { request_type: "SUPPLY_ONLY" }
    const first = await getRfqCreateIdempotencyKey(payload, 1_000)

    expect(await getRfqCreateIdempotencyKey(payload, 1_000 + 24 * 60 * 60 * 1000)).not.toBe(first)
  })
})
