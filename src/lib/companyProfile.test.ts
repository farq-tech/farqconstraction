import { afterEach, describe, expect, it, vi } from 'vitest'
const identity = vi.hoisted(() => ({ id: 'a' }))
vi.mock('../api/farqSession', () => ({ farqSession: { getUser: () => ({ id: identity.id }) } }))
import { DEFAULT_COMPANY_PROFILE, loadCompanyProfile, saveCompanyProfile } from './companyProfile'
afterEach(() => vi.unstubAllGlobals())
describe('sender company identity', () => {
  it('does not introduce Farq company or contact details for another buyer', () => {
    expect(DEFAULT_COMPANY_PROFILE).toMatchObject({ name: '', phone: '', email: '' })
  })
  it('keeps profile data isolated when switching signed-in users', () => {
    const rows = new Map<string, string>()
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => rows.set(key, value) } })
    identity.id = 'a'
    expect(saveCompanyProfile({ ...DEFAULT_COMPANY_PROFILE, name: 'شركة أ' })).toBe(true)
    identity.id = 'b'
    expect(loadCompanyProfile().name).toBe('')
    identity.id = 'a'
    expect(loadCompanyProfile().name).toBe('شركة أ')
  })
  it('retains an unscoped legacy record without assigning it to the current buyer', () => {
    const legacy = JSON.stringify({ name: 'شركة قديمة' })
    const rows = new Map([['farq.construction.companyProfile.v1', legacy]])
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => rows.get(key) ?? null } })
    expect(loadCompanyProfile().name).toBe('')
    expect(rows.get('farq.construction.companyProfile.v1')).toBe(legacy)
  })
})
