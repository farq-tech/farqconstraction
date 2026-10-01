import { describe, expect, it } from 'vitest'
import { resolveServices, serviceForView, viewAllowed } from './services'
import type { ConstructionMyServices } from '../api/constructionClient'

const answer = (gating: ConstructionMyServices['gating'], rfq: boolean, etimad: boolean, canManage = false): ConstructionMyServices => ({
  gating,
  can_manage: canManage,
  services: [
    { key: 'rfq', name_ar: 'طلبات عروض الأسعار', enabled: rfq },
    { key: 'etimad', name_ar: 'منافسات اعتماد', enabled: etimad },
  ],
})

describe('resolveServices', () => {
  it('no answer (old API, network failure): today’s behaviour — rfq visible, etimad hidden', () => {
    const state = resolveServices(null)
    expect(state.has('rfq')).toBe(true)
    expect(state.has('etimad')).toBe(false)
    expect(state.canManage).toBe(false)
    expect(state.known).toBe(false)
  })

  it('gating off or log-only never hides rfq, even if the account row says off', () => {
    expect(resolveServices(answer('off', false, false)).has('rfq')).toBe(true)
    expect(resolveServices(answer('log', false, false)).has('rfq')).toBe(true)
  })

  it('enforced: follows the server', () => {
    expect(resolveServices(answer('enforce', false, true)).has('rfq')).toBe(false)
    expect(resolveServices(answer('enforce', true, false)).has('rfq')).toBe(true)
    expect(resolveServices(answer('enforce', true, true)).has('etimad')).toBe(true)
  })

  it('etimad shows only when the server enables it', () => {
    expect(resolveServices(answer('off', true, false)).has('etimad')).toBe(false)
    expect(resolveServices(answer('off', true, true)).has('etimad')).toBe(true)
  })

  it('canManage comes from the server', () => {
    expect(resolveServices(answer('off', true, false, true)).canManage).toBe(true)
  })
})

describe('views', () => {
  it('rfq screens need rfq; home, inbox and settings never hide', () => {
    expect(serviceForView('rfq-list')).toBe('rfq')
    expect(serviceForView('booklets')).toBe('rfq')
    expect(serviceForView('home')).toBe(null)
    const off = resolveServices(answer('enforce', false, false))
    expect(viewAllowed('rfq-list', off)).toBe(false)
    expect(viewAllowed('home', off)).toBe(true)
    expect(viewAllowed('settings', off)).toBe(true)
    expect(viewAllowed('rfq-list', resolveServices(null))).toBe(true)
  })
})
