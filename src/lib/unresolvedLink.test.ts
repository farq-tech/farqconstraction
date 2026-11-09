import { describe, expect, it } from 'vitest'
import { isLinkableArrivalSupplier, uniqueSuggestedLinkSupplier } from './unresolvedLink'
import type { UnresolvedLinkSupplier } from './unresolvedLink'

const supplier = (invite_id: string, extra: Partial<UnresolvedLinkSupplier> = {}): UnresolvedLinkSupplier => ({
  invite_id,
  supplier_id: `supplier-${invite_id}`,
  name_ar: null,
  name_en: null,
  response_status: 'INVITED',
  suggested: false,
  ...extra,
})

describe('unresolved inbox link targets', () => {
  it('does not allow a sealed RFQ candidate to be linked', () => {
    const locked = supplier('invite-1', { locked: true, suggested: true })
    expect(isLinkableArrivalSupplier(locked)).toBe(false)
    expect(uniqueSuggestedLinkSupplier([locked])).toBeNull()
  })

  it('auto-selects a unique suggested supplier only when it is linkable', () => {
    const locked = supplier('invite-locked', { locked: true, suggested: true })
    const open = supplier('invite-open', { suggested: true })
    expect(uniqueSuggestedLinkSupplier([locked, open])).toEqual(open)
  })

  it('leaves ambiguous suggestions for explicit selection', () => {
    const first = supplier('invite-1', { suggested: true })
    const second = supplier('invite-2', { suggested: true })
    expect(uniqueSuggestedLinkSupplier([first, second])).toBeNull()
  })
})
