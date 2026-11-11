import { afterEach, describe, expect, it, vi } from 'vitest'
import { __resetConstructionRateLimitGate, parseConstructionBoqPdf } from './constructionClient'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

afterEach(() => {
  vi.unstubAllGlobals()
  __resetConstructionRateLimitGate()
})

describe('DOCX BOQ upload contract', () => {
  it('sends the selected Word file with DOCX MIME and returns the API table rows', async () => {
    const file = new File(['docx bytes'], 'arabic-boq.docx', { type: DOCX_MIME })
    const rows = [
      ['اسم المادة', 'الكمية', 'الوحدة', 'المواصفة الفنية'],
      ['ماسورة حديد مجلفن', 12, 'متر', 'قطر 2 بوصة'],
    ]
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      data: { job_id: 'docx-job', status: 'COMPLETE', rows, item_count: 1 },
    }), { status: 202, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(parseConstructionBoqPdf(file)).resolves.toMatchObject({ rows, item_count: 1 })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/api/construction/boq/parse-pdf')
    expect(new Headers(init.headers).get('content-type')).toBe(DOCX_MIME)
    expect(init.body).toBe(file)
  })
})
