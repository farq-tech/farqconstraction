import { beforeEach, describe, expect, it, vi } from 'vitest'
const identity = vi.hoisted(() => ({ id: 'owner' as string | null }))
vi.mock('./farqSession', () => ({ farqSession: { getUser: () => identity.id ? { id: identity.id } : null } }))
import { getPlatformReviewScope, setPlatformReviewScope, platformReviewPath } from './platformReviewScope'
beforeEach(() => { vi.stubGlobal('window', { dispatchEvent: vi.fn() }); identity.id = 'owner'; setPlatformReviewScope(null) })
describe('platform company browsing', () => {
  it('adds the selected company only to request and booklet reads', () => {
    setPlatformReviewScope('company')
    expect(platformReviewPath('/api/construction/rfqs?status=ACTIVE')).toBe('/api/construction/rfqs?status=ACTIVE&platform_scope=company')
    expect(platformReviewPath('/api/construction/booklets/123')).toContain('platform_scope=company')
    expect(platformReviewPath('/api/construction/me')).toBe('/api/construction/me')
  })
  it('refuses writes before any transport, including unrelated endpoints', () => {
    setPlatformReviewScope('company')
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(() => platformReviewPath('/api/construction/rfqs', method)).toThrow(/للقراءة فقط/)
  })
  it('never transfers another company selection to the next user or a logged out user', () => {
    setPlatformReviewScope('company'); identity.id = 'other'
    expect(getPlatformReviewScope()).toBeNull()
    expect(platformReviewPath('/api/construction/rfqs')).toBe('/api/construction/rfqs')
    identity.id = null; expect(getPlatformReviewScope()).toBeNull()
  })
})
