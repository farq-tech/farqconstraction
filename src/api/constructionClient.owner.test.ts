/**
 * Request ownership: the member list decides whether the «نقل الملكية» control
 * shows (ADMIN only), and a transfer posts to the right endpoint.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ConstructionApiError,
  __resetConstructionRateLimitGate,
  listCompanyMembers,
  transferBookletOwner,
  transferRfqOwner,
  type ConstructionCompanyMember,
} from './constructionClient'
import {
  canTransferOwnership,
  ownerLabel,
  roleLabel,
  transferSuccessMessage,
} from '../lib/requestOwner'

type Reply = { status: number; body: unknown }

let fetchMock: ReturnType<typeof vi.fn>

function installFetch(reply: Reply) {
  fetchMock = vi.fn(async () => ({
    ok: reply.status >= 200 && reply.status < 300,
    status: reply.status,
    headers: { get: () => null },
    json: async () => reply.body,
  }) as unknown as Response)
  vi.stubGlobal('fetch', fetchMock)
}

const members: ConstructionCompanyMember[] = [
  { user_id: 'u1', email: 'bader@aldafe.com', role: 'ADMIN', request_scope: 'ALL' },
  { user_id: 'u2', email: 'sara@aldafe.com', role: 'PROCUREMENT', request_scope: 'OWN_REQUESTS' },
]

beforeEach(() => __resetConstructionRateLimitGate())
afterEach(() => {
  vi.unstubAllGlobals()
  __resetConstructionRateLimitGate()
})

describe('listCompanyMembers and the control visibility', () => {
  it('an admin sees the control', async () => {
    installFetch({ status: 200, body: { ok: true, data: { members, department_rules: [], can_transfer: true } } })
    const result = await listCompanyMembers()
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/construction/members')
    expect(result.members).toHaveLength(2)
    expect(canTransferOwnership(result)).toBe(true)
  })

  it('a non-admin does not', async () => {
    installFetch({ status: 200, body: { ok: true, data: { members, department_rules: [], can_transfer: false } } })
    expect(canTransferOwnership(await listCompanyMembers())).toBe(false)
  })

  it('a missing flag, a missing payload or a failed read never shows it', async () => {
    installFetch({ status: 200, body: { ok: true, data: { members } } })
    expect(canTransferOwnership(await listCompanyMembers())).toBe(false)
    installFetch({ status: 200, body: { ok: true, data: null } })
    await expect(listCompanyMembers()).resolves.toEqual({ members: [], department_rules: [], can_transfer: false })
    expect(canTransferOwnership(null)).toBe(false)
  })
})

describe('transfer endpoints', () => {
  it('an RFQ transfer posts the user id to /rfqs/:id/owner', async () => {
    const data = { rfq_id: 'r1', booklet_id: 'b1', rfq_ids: ['r1', 'r2'], from_user_id: 'u1', to_user_id: 'u2' }
    installFetch({ status: 200, body: { ok: true, data } })
    await expect(transferRfqOwner('r1', 'u2')).resolves.toEqual(data)
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit]
    expect(url).toContain('/api/construction/rfqs/r1/owner')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ user_id: 'u2' })
  })

  it('a booklet transfer posts to /booklets/:id/owner, with the note when given', async () => {
    const data = { booklet_id: 'b1', rfq_ids: ['r1'], from_user_id: null, to_user_id: 'u2' }
    installFetch({ status: 200, body: { ok: true, data } })
    await expect(transferBookletOwner('b1', 'u2', ' handover ')).resolves.toEqual(data)
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit]
    expect(url).toContain('/api/construction/booklets/b1/owner')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ user_id: 'u2', note: 'handover' })
  })

  it('a non-admin refusal says so, not a supplier-role message', async () => {
    installFetch({ status: 403, body: { ok: false, error: 'CONSTRUCTION_ADMIN_REQUIRED' } })
    const err = await transferRfqOwner('r1', 'u2').catch((e) => e)
    expect(err).toBeInstanceOf(ConstructionApiError)
    expect(err.code).toBe('CONSTRUCTION_ADMIN_REQUIRED')
    expect(err.message).toContain('ADMIN')
    expect(err.message).not.toContain('الموردين')
  })

  it('an invalid target names the reason', async () => {
    installFetch({ status: 400, body: { ok: false, error: 'CONSTRUCTION_TRANSFER_TARGET_INVALID' } })
    const err = await transferBookletOwner('b1', 'ghost').catch((e) => e)
    expect(err.code).toBe('CONSTRUCTION_TRANSFER_TARGET_INVALID')
    expect(err.message).toContain('ليس عضوًا نشطًا')
  })
})

describe('owner wording', () => {
  it('shows the owner email, resolves a bare id from members, or «غير محدد»', () => {
    expect(ownerLabel({ user_id: 'u1', email: 'bader@aldafe.com' })).toBe('bader@aldafe.com')
    expect(ownerLabel(null, 'u2', members)).toBe('sara@aldafe.com')
    expect(ownerLabel(null)).toBe('غير محدد')
    expect(ownerLabel(undefined, null, members)).toBe('غير محدد')
  })

  it('labels roles in Arabic and keeps unknown ones', () => {
    expect(roleLabel('ADMIN')).toBe('مدير')
    expect(roleLabel('procurement')).toBe('مشتريات')
    expect(roleLabel('AUDITOR')).toBe('AUDITOR')
  })

  it('says the whole booklet moved when an RFQ is a wave of one', () => {
    expect(transferSuccessMessage('booklet', 'sara@aldafe.com', { booklet_id: 'b1', rfq_ids: ['r1'] })).toBe(
      'نُقلت ملكية الكراسة إلى sara@aldafe.com',
    )
    expect(transferSuccessMessage('rfq', 'sara@aldafe.com', { booklet_id: null, rfq_ids: ['r1'] })).toBe(
      'نُقلت ملكية الطلب إلى sara@aldafe.com',
    )
    expect(transferSuccessMessage('rfq', 'sara@aldafe.com', { booklet_id: 'b1', rfq_ids: ['r1', 'r2', 'r3'] })).toContain(
      'الكراسة كاملة',
    )
  })
})
