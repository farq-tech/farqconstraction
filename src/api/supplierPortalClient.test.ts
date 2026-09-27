import { describe, expect, it } from 'vitest'
import {
  SUPPLIER_SESSION_STORAGE_KEY,
  attachmentProblemAr,
  createSupplierPortalClient,
  isRouteUnavailable,
  normalizeMessages,
  normalizeRequest,
  normalizeTimeline,
  type Transport,
  type TransportRequest,
} from './supplierPortalClient'

const HOUR = 3600_000
const NOW = Date.parse('2026-09-27T07:00:00Z')

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

function scripted(responses: Array<{ status: number; payload: unknown }>) {
  const calls: TransportRequest[] = []
  const transport: Transport = async (req) => {
    calls.push(req)
    const next = responses.shift()
    if (!next) throw new Error(`unexpected call ${req.method} ${req.path}`)
    return next
  }
  return { transport, calls }
}

const SESSION_PAYLOAD = {
  session: 'sess-abc',
  expires_at: new Date(NOW + 12 * HOUR).toISOString(),
  supplier: { id: 'sup-1', name_ar: 'مصنع الطليعة للبلك الأسمنتي' },
  account: { status: 'PROVISIONED', has_password: false, email: 'sales@taleea-block.sa', phone: '+966552147730' },
}

describe('openSession', () => {
  it('trades the link token for a session, keeps it for this tab and sends it as a bearer', async () => {
    const storage = memoryStorage()
    const { transport, calls } = scripted([
      { status: 200, payload: SESSION_PAYLOAD },
      { status: 200, payload: [{ invite_id: 'inv-1', buyer_company: 'شركة الدفع', status_timeline: [] }] },
    ])
    const client = createSupplierPortalClient({ transport, storage, now: () => NOW })
    const out = await client.openSession('tok-123')
    expect(out.mode).toBe('session')
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/construction/supplier/session', body: { token: 'tok-123' } })
    // The session route is not authorised by a session.
    expect(calls[0].headers.Authorization).toBeUndefined()
    expect(JSON.parse(storage.map.get(SUPPLIER_SESSION_STORAGE_KEY) || '{}').session).toBe('sess-abc')

    const list = await client.listRequests()
    expect(list).toHaveLength(1)
    expect(calls[1].headers.Authorization).toBe('Bearer sess-abc')
  })

  it('falls back to the token portal when the route is not mounted (404)', async () => {
    const { transport } = scripted([{ status: 404, payload: { error: 'Not Found' } }])
    const client = createSupplierPortalClient({ transport, storage: memoryStorage() })
    await expect(client.openSession('tok')).resolves.toEqual({ mode: 'legacy' })
  })

  it('falls back to the token portal when the feature is switched off', async () => {
    const { transport } = scripted([{ status: 503, payload: { ok: false, errors: [{ code: 'SUPPLIER_PORTAL_SESSION_DISABLED' }] } }])
    const client = createSupplierPortalClient({ transport, storage: memoryStorage() })
    await expect(client.openSession('tok')).resolves.toEqual({ mode: 'legacy' })
  })

  it('says «expired» for a dead link instead of falling back', async () => {
    const { transport } = scripted([{ status: 410, payload: { code: 'SUPPLIER_LINK_EXPIRED' } }])
    const client = createSupplierPortalClient({ transport, storage: memoryStorage() })
    const out = await client.openSession('tok')
    expect(out.mode).toBe('expired')
  })

  it('keeps the held session when the network is down', async () => {
    const storage = memoryStorage()
    storage.setItem(SUPPLIER_SESSION_STORAGE_KEY, JSON.stringify(SESSION_PAYLOAD))
    const { transport } = scripted([{ status: 0, payload: null }])
    const client = createSupplierPortalClient({ transport, storage, now: () => NOW })
    const out = await client.openSession('tok')
    expect(out).toMatchObject({ mode: 'session', session: { session: 'sess-abc' } })
  })

  it('does not reuse a stored session after it expires', async () => {
    const storage = memoryStorage()
    storage.setItem(SUPPLIER_SESSION_STORAGE_KEY, JSON.stringify({ ...SESSION_PAYLOAD, expires_at: new Date(NOW - 1).toISOString() }))
    const client = createSupplierPortalClient({ transport: scripted([]).transport, storage, now: () => NOW })
    expect(client.currentSession()).toBeNull()
    await expect(client.listRequests()).rejects.toMatchObject({ status: 401 })
  })

  it('drops the session on a 401 so the next call does not keep sending it', async () => {
    const storage = memoryStorage()
    const { transport } = scripted([
      { status: 200, payload: SESSION_PAYLOAD },
      { status: 401, payload: { code: 'SUPPLIER_SESSION_EXPIRED' } },
    ])
    const client = createSupplierPortalClient({ transport, storage, now: () => NOW })
    await client.openSession('tok')
    await expect(client.listMessages('inv-1')).rejects.toMatchObject({ message: 'انتهت الجلسة — افتح رابط الدعوة من جديد.' })
    expect(client.currentSession()).toBeNull()
    expect(storage.map.has(SUPPLIER_SESSION_STORAGE_KEY)).toBe(false)
  })
})

describe('sendMessage', () => {
  it('posts body, attachments and the client_message_id, and reads the stored message back', async () => {
    const { transport, calls } = scripted([
      { status: 200, payload: SESSION_PAYLOAD },
      {
        status: 201,
        payload: { message: { id: 'm-9', direction: 'OUT', body: 'مرحبا', client_message_id: 'cm-1', created_at: '2026-09-27T07:10:00Z' } },
      },
    ])
    const client = createSupplierPortalClient({ transport, storage: memoryStorage(), now: () => NOW })
    await client.openSession('tok')
    const sent = await client.sendMessage('inv/1', {
      body: 'مرحبا',
      client_message_id: 'cm-1',
      attachments: [{ filename: 'a.pdf', content_type: 'application/pdf', content: 'QUJD', size: 3 }],
    })
    expect(calls[1].path).toBe('/api/construction/supplier/requests/inv%2F1/messages')
    expect(calls[1].body).toEqual({
      body: 'مرحبا',
      client_message_id: 'cm-1',
      attachments: [{ filename: 'a.pdf', content_type: 'application/pdf', content: 'QUJD' }],
    })
    expect(sent).toMatchObject({ id: 'm-9', direction: 'OUT', client_message_id: 'cm-1', read_at: null })
  })
})

describe('account', () => {
  it('asks for an email code and verifies it with the password in one call', async () => {
    const { transport, calls } = scripted([
      { status: 200, payload: SESSION_PAYLOAD },
      { status: 200, payload: { sent_to: 'sales@taleea-block.sa', resend_after_sec: 42 } },
      { status: 200, payload: { account: { status: 'ACTIVE', has_password: true, email: 'sales@taleea-block.sa' } } },
    ])
    const client = createSupplierPortalClient({ transport, storage: memoryStorage(), now: () => NOW })
    await client.openSession('tok')
    await expect(client.requestOtp('ADD_EMAIL', 'sales@taleea-block.sa')).resolves.toEqual({
      sent_to: 'sales@taleea-block.sa',
      resend_after_sec: 42,
    })
    expect(calls[1].body).toEqual({ purpose: 'ADD_EMAIL', email: 'sales@taleea-block.sa' })
    const account = await client.verifyOtp('481922', 'long-enough')
    expect(calls[2]).toMatchObject({ path: '/api/construction/supplier/account/otp/verify', body: { code: '481922', password: 'long-enough' } })
    expect(account).toMatchObject({ status: 'ACTIVE', has_password: true })
  })

  it('names a wrong code plainly', async () => {
    const { transport } = scripted([
      { status: 200, payload: SESSION_PAYLOAD },
      { status: 400, payload: { ok: false, errors: [{ code: 'OTP_INVALID' }] } },
    ])
    const client = createSupplierPortalClient({ transport, storage: memoryStorage(), now: () => NOW })
    await client.openSession('tok')
    await expect(client.verifyOtp('000000', 'x'.repeat(8))).rejects.toMatchObject({ code: 'OTP_INVALID', message: 'الرمز غير صحيح — تأكد منه وأعد المحاولة.' })
  })
})

describe('normalizers', () => {
  it('reads a request row and orders its status path', () => {
    const row = normalizeRequest({
      invite_id: 'inv-1',
      buyer_company: 'شركة الدفع للتجارة والمقاولات',
      reference: 'PR-580',
      deadline: '2026-09-30T20:59:00Z',
      unread_count: '2',
      status_timeline: [
        { kind: 'OPENED', state: 'DONE', at: '2026-09-25T08:04:00Z' },
        { kind: 'SENT', state: 'DONE', at: '2026-09-25T06:30:00Z' },
        { kind: 'AWARDED', state: 'weird' },
        { kind: 'NOT_A_STEP', state: 'DONE' },
      ],
    })
    expect(row.unread_count).toBe(2)
    expect(row.status_timeline.map((s) => s.kind)).toEqual(['SENT', 'OPENED', 'AWARDED'])
    // An unrecognised state is UNKNOWN, never DONE.
    expect(row.status_timeline[2]).toEqual({ kind: 'AWARDED', state: 'UNKNOWN', at: null })
  })

  it('reads messages whether wrapped or bare', () => {
    expect(normalizeMessages({ messages: [{ id: '1', direction: 'in', body: 'x' }] })[0].direction).toBe('IN')
    expect(normalizeMessages({ ok: true, data: { messages: [{ id: '2', direction: 'OUT' }] } })[0].direction).toBe('OUT')
    expect(normalizeMessages([{ id: '3', system_kind: 'QUOTE_REVISED', body: 'أرسلتم نسخة جديدة' }])[0].system_kind).toBe('QUOTE_REVISED')
  })

  it('treats a missing timeline as empty, not as progress', () => {
    expect(normalizeTimeline(undefined)).toEqual([])
  })

  it('only 404-not-mounted and *_DISABLED mean «use the old routes»', () => {
    expect(isRouteUnavailable(404, '')).toBe(true)
    expect(isRouteUnavailable(503, 'SUPPLIER_CHAT_DISABLED')).toBe(true)
    expect(isRouteUnavailable(404, 'SUPPLIER_LINK_EXPIRED')).toBe(false)
    expect(isRouteUnavailable(500, 'BOOM')).toBe(false)
  })
})

describe('attachmentProblemAr', () => {
  const pdf = (size: number, name = 'a.pdf') => ({ name, size, type: 'application/pdf' })
  it('accepts PDFs and images within 10 files / 18 MB', () => {
    expect(attachmentProblemAr([pdf(1000), { name: 'p.jpg', size: 2000, type: 'image/jpeg' }])).toBeNull()
  })
  it('refuses an 11th file', () => {
    expect(attachmentProblemAr(Array.from({ length: 11 }, () => pdf(10)))).toBe('الحد 10 ملفات في الرسالة.')
  })
  it('refuses more than 18 MB in one message', () => {
    expect(attachmentProblemAr([pdf(10 * 1024 * 1024), pdf(9 * 1024 * 1024)])).toMatch(/18 ميجابايت/)
  })
  it('refuses anything but PDF and images', () => {
    expect(attachmentProblemAr([{ name: 'boq.xlsx', size: 10, type: 'application/vnd.ms-excel' }])).toBe('نقبل ملفات PDF والصور فقط.')
  })
})
