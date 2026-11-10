import { afterEach, expect, it, vi } from "vitest"
import { createConstructionRfq, __resetConstructionRateLimitGate } from "./constructionClient"

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
