import { afterEach, expect, it, vi } from "vitest"
import { createConstructionRfq, __resetConstructionRateLimitGate } from "./constructionClient"
import { getRfqCreateIdempotencyKey } from "../lib/rfqCreateIdempotency"

afterEach(() => {
  vi.unstubAllGlobals()
  __resetConstructionRateLimitGate()
})

it("sends the RFQ create retry key as an idempotency header", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ ok: true, data: { id: "rfq-1" } }),
  })
  vi.stubGlobal("fetch", fetchMock)

  await createConstructionRfq({ manual_send: true, lines: [{ name_ar: "كيبل" }] }, { idempotencyKey: "create-rfq-test-key-1" })

  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toContain("/api/construction/rfqs")
  expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("create-rfq-test-key-1")
})

it("sends the same API create key after matching returns a different exposure ID", async () => {
  const storage = new Map<string, string>()
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ ok: true, data: { id: "rfq-1" } }),
  })
  vi.stubGlobal("fetch", fetchMock)
  const firstPayload = {
    manual_send: true,
    selected_supplier_ids: ["supplier-a", "supplier-b"],
    lines: [{ line_key: "line-1", name_ar: "كيبل", quantity: 12 }],
    packages: [{ id: "electrical", line_keys: ["line-1"], selected_supplier_ids: ["supplier-a", "supplier-b"], exposure_id: "match-1" }],
  }
  const retryPayload = {
    ...firstPayload,
    packages: firstPayload.packages.map((entry) => ({ ...entry, exposure_id: "match-2" })),
  }
  const firstKey = await getRfqCreateIdempotencyKey(firstPayload, 1_000)
  const retryKey = await getRfqCreateIdempotencyKey(retryPayload, 2_000)

  await createConstructionRfq(firstPayload, { idempotencyKey: firstKey })
  await createConstructionRfq(retryPayload, { idempotencyKey: retryKey })

  const headers = fetchMock.mock.calls.map(([, init]) => (init as RequestInit).headers as Record<string, string>)
  expect(headers.map((header) => header["Idempotency-Key"])).toEqual([firstKey, firstKey])
})
