import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { approvalsFor, counts, resultLabel, sendable } from './outcomeNotices'
import { __resetConstructionRateLimitGate, getOutcomeNotices, outcomeNoticesEnabled, sendOutcomeNotices, type OutcomeNotice } from '../api/constructionClient'

const notice = (over: Partial<OutcomeNotice>): OutcomeNotice => ({
  supplier_id: 'SUP-1', supplier_name: 'مؤسسة النور', invite_id: 'i1', outcome: 'NOT_SELECTED', state: 'READY',
  channel: 'EMAIL', channel_label_ar: 'البريد الإلكتروني', text: 'أهلاً وسهلاً مؤسسة النور، معك أحمد من فرق.', content_hash: 'a'.repeat(64), ...over,
})

describe('outcome notice approvals', () => {
  it('only ready drafts with their shown text are approvable', () => {
    const list = [notice({}), notice({ supplier_id: 'SUP-2', state: 'BLOCKED', content_hash: null, channel: null }), notice({ supplier_id: 'SUP-3', state: 'SENT', content_hash: null })]
    expect(sendable(list).map((n) => n.supplier_id)).toEqual(['SUP-1'])
    expect(approvalsFor(list)).toEqual([{ supplier_id: 'SUP-1', content_hash: 'a'.repeat(64) }])
    expect(approvalsFor(list, ['SUP-2'])).toEqual([])
    expect(counts(list)).toEqual({ ready: 1, sent: 1, blocked: 1 })
  })
  it('explains every result in Arabic', () => {
    expect(resultLabel({ supplier_id: 'x', state: 'SENT' })).toBe('أُرسلت')
    expect(resultLabel({ supplier_id: 'x', state: 'SKIPPED', reason: 'NO_FREE_CHANNEL' })).toBe('لا توجد قناة مجانية')
    expect(resultLabel({ supplier_id: 'x', state: 'SKIPPED', reason: 'TEXT_CHANGED' })).toContain('تغيّر النص')
    expect(resultLabel({ supplier_id: 'x', state: 'UNKNOWN' })).toContain('غير مؤكدة')
    expect(resultLabel({ supplier_id: 'x', state: 'FAILED', reason: 'ODD' })).toContain('تعذّر')
  })
})

describe('outcome notices client', () => {
  const fetchMock = vi.fn()
  beforeEach(() => { __resetConstructionRateLimitGate(); vi.stubGlobal('fetch', fetchMock); fetchMock.mockResolvedValue({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ ok: true, data: { results: [] } }) }) })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); fetchMock.mockReset(); __resetConstructionRateLimitGate() })
  it('is off unless the build turns it on', () => {
    expect(outcomeNoticesEnabled()).toBe(false)
    vi.stubEnv('VITE_CONSTRUCTION_OUTCOME_NOTICES', '1')
    expect(outcomeNoticesEnabled()).toBe(true)
  })
  it('previews with a GET and sends only the approved hashes', async () => {
    await getOutcomeNotices('rfq-1', { confirmNoPurchase: true })
    expect(fetchMock.mock.calls[0][0]).toContain('/api/construction/rfqs/rfq-1/outcome-notices?confirm_no_purchase=1')
    expect(fetchMock.mock.calls[0][1].method ?? 'GET').toBe('GET')
    const body = { notices: [{ supplier_id: 'SUP-1', content_hash: 'a'.repeat(64) }] }
    await sendOutcomeNotices('rfq-1', body)
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toContain('/api/construction/rfqs/rfq-1/outcome-notices/send')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual(body)
  })
  it('a read-only build never sends', async () => {
    vi.stubEnv('VITE_READ_ONLY', '1')
    await expect(sendOutcomeNotices('rfq-1', { notices: [{ supplier_id: 'SUP-1', content_hash: 'a'.repeat(64) }] })).rejects.toMatchObject({ code: 'CONSTRUCTION_READ_ONLY' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
