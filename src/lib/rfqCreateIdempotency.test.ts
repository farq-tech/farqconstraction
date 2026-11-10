import { beforeEach, describe, expect, it, vi } from "vitest"
import { clearRfqCreateIdempotencyKey, getRfqCreateIdempotencyKey } from "./rfqCreateIdempotency"

describe("RFQ create idempotency key", () => {
  let entries: Map<string, string>

  beforeEach(() => {
    entries = new Map()
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
      clear: () => entries.clear(),
    })
  })

  it("reuses a key for the same payload and separates changed request details", async () => {
    const payload = { lines: [{ name: "كيبل", quantity: 12 }], selected_supplier_ids: ["supplier-a"] }
    const first = await getRfqCreateIdempotencyKey(payload, 1_000)

    expect(await getRfqCreateIdempotencyKey(payload, 2_000)).toBe(first)
    expect(await getRfqCreateIdempotencyKey({ ...payload, selected_supplier_ids: ["supplier-b"] }, 2_000)).not.toBe(first)
  })

  it("reuses the create key when only the supplier-match exposure ID changes", async () => {
    const payload = {
      lines: [{ line_key: "line-1", farq_spec_id: "wire", quantity: 12 }],
      selected_supplier_ids: ["supplier-a"],
      packages: [{ id: "electrical", line_keys: ["line-1"], selected_supplier_ids: ["supplier-a"], exposure_id: "match-1" }],
    }
    const first = await getRfqCreateIdempotencyKey(payload, 1_000)
    const retried = await getRfqCreateIdempotencyKey({
      ...payload,
      packages: payload.packages.map((entry) => ({ ...entry, exposure_id: "match-2" })),
    }, 2_000)

    expect(retried).toBe(first)
  })

  it("starts a new key after the retry window expires", async () => {
    const payload = { request_type: "SUPPLY_ONLY" }
    const first = await getRfqCreateIdempotencyKey(payload, 1_000)

    expect(await getRfqCreateIdempotencyKey(payload, 1_000 + 24 * 60 * 60 * 1000)).not.toBe(first)
  })

  it("starts a fresh key after a confirmed create while reusing the key until cleared", async () => {
    const payload = { lines: [{ name: "كيبل", quantity: 12 }] }
    const first = await getRfqCreateIdempotencyKey(payload, 1_000)
    expect(await getRfqCreateIdempotencyKey(payload, 2_000)).toBe(first)

    await clearRfqCreateIdempotencyKey(payload, first)

    expect(await getRfqCreateIdempotencyKey(payload, 3_000)).not.toBe(first)
  })
})
