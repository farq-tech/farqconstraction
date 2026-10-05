import { describe, expect, it } from 'vitest'
import { readJoinToken, stripJoinToken } from './joinLink'
import { normalizeJoinPreview, supplierErrorMessageAr } from '../api/supplierPortalClient'

const TOKEN = 'A'.repeat(43)

describe('«انضم لفرق كمورد» link', () => {
  it('reads only a well-formed join token', () => {
    expect(readJoinToken(`?join_token=${TOKEN}`)).toBe(TOKEN)
    expect(readJoinToken('?join_token=short')).toBeNull()
    expect(readJoinToken(`?supplier_token=${TOKEN}`)).toBeNull()
  })

  it('takes the token out of the address and keeps view=join', () => {
    const out = stripJoinToken({ pathname: '/', search: `?join_token=${TOKEN}`, hash: '' })
    expect(out).toBe('/?view=join')
    expect(out).not.toContain(TOKEN)
  })

  it('reads the preview and says the join errors in Arabic', () => {
    expect(normalizeJoinPreview({ company_name: 'مؤسسة', phone_masked: '05•••••463', trades: ['كهرباء', 7], terms_version: 'v1' })).toEqual({
      company_name: 'مؤسسة', phone_masked: '05•••••463', trades: ['كهرباء', '7'], city: null, expires_at: null, terms_version: 'v1',
    })
    expect(supplierErrorMessageAr(404, 'JOIN_LINK_INVALID')).toMatch(/الرابط غير صالح/)
    expect(supplierErrorMessageAr(401, 'INVALID_CREDENTIALS')).toMatch(/كلمة السر/)
  })
})
