import { afterEach, beforeEach, expect, it, vi } from "vitest"
import {
  __resetConstructionRateLimitGate,
  getPlatformWhatsAppArrival,
  listPlatformWhatsAppArrivals,
  resolvePlatformWhatsAppArrival,
} from "./constructionClient"

const fetchMock = vi.fn()

beforeEach(() => {
  __resetConstructionRateLimitGate()
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      ok: true,
      data: { arrivals: [], has_more: false, next_cursor: null },
    }),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
  __resetConstructionRateLimitGate()
})

it("lists shared-number arrivals with an encoded cursor", async () => {
  await listPlatformWhatsAppArrivals("cursor / value")
  expect(String(fetchMock.mock.calls[0][0])).toContain(
    "/inbox/platform/whatsapp/unresolved?cursor=cursor+%2F+value",
  )
})

it("loads the selected arrival detail and candidate requests", async () => {
  await getPlatformWhatsAppArrival("arrival/one")
  expect(String(fetchMock.mock.calls[0][0])).toContain(
    "/inbox/platform/whatsapp/unresolved/arrival%2Fone",
  )
})

it("posts the selected invite, revision and audit reason to link the arrival", async () => {
  const body = {
    invite_id: "invite-1",
    expected_revision: 4,
    reason: "تحققت من مرجع الطلب",
  }
  await resolvePlatformWhatsAppArrival(
    "arrival-1",
    body.invite_id,
    body.expected_revision,
    body.reason,
  )
  const [url, init] = fetchMock.mock.calls[0]
  expect(String(url)).toContain(
    "/inbox/platform/whatsapp/unresolved/arrival-1/resolve",
  )
  expect(init.method).toBe("POST")
  expect(JSON.parse(init.body)).toEqual(body)
})
