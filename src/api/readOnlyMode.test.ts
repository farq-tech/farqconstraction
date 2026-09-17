import { afterEach, describe, expect, it, vi } from 'vitest'
import { isBlockedWrite } from './readOnlyMode'

/**
 * `isReadOnlyBuild` reads `import.meta.env`, which is the bundler's object and
 * not a plain one the test can assign to. `vi.stubEnv` is the supported way to
 * set it, so each case sets the flag the way the build would.
 */
function withReadOnly(value: string | undefined, run: () => void) {
  if (value !== undefined) vi.stubEnv('VITE_READ_ONLY', value)
  try {
    run()
  } finally {
    vi.unstubAllEnvs()
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('read-only mode', () => {
  it('lets every write through when the flag is not set', () => {
    withReadOnly(undefined, () => {
      expect(isBlockedWrite('/api/construction/rfqs/1/invites/2/send', 'POST')).toBe(false)
    })
  })

  it('refuses the invite send, which is the call that reaches Resend', () => {
    withReadOnly('1', () => {
      expect(isBlockedWrite('/api/construction/rfqs/1/invites/2/send', 'POST')).toBe(true)
    })
  })

  it('refuses the other routes that reach a real supplier', () => {
    withReadOnly('1', () => {
      expect(isBlockedWrite('/api/construction/inbox/threads/7/reply', 'POST')).toBe(true)
      expect(isBlockedWrite('/api/construction/inbox/outbox/7/retry', 'POST')).toBe(true)
      expect(isBlockedWrite('/api/construction/rfqs/1/invites/2/whatsapp-link', 'POST')).toBe(true)
    })
  })

  it('refuses the other writes too, so nothing mutates the real database', () => {
    withReadOnly('1', () => {
      expect(isBlockedWrite('/api/construction/awards', 'POST')).toBe(true)
      expect(isBlockedWrite('/api/construction/rfqs', 'POST')).toBe(true)
      expect(isBlockedWrite('/api/construction/suppliers/import', 'POST')).toBe(true)
      expect(isBlockedWrite('/api/construction/inbox/gmail/connect', 'POST')).toBe(true)
    })
  })

  it('keeps reads open, because the point is to run against real data', () => {
    withReadOnly('1', () => {
      expect(isBlockedWrite('/api/construction/projects', 'GET')).toBe(false)
      expect(isBlockedWrite('/api/construction/projects', undefined)).toBe(false)
    })
  })

  it('keeps the search POSTs open, because the journey needs them', () => {
    withReadOnly('1', () => {
      expect(isBlockedWrite('/api/construction/boq/match', 'POST')).toBe(false)
      expect(isBlockedWrite('/api/construction/suppliers/match', 'POST')).toBe(false)
      expect(isBlockedWrite('/api/construction/boq/parse-pdf', 'POST')).toBe(false)
    })
  })

  it('matches on the path, so a query string cannot smuggle a write through', () => {
    withReadOnly('1', () => {
      expect(isBlockedWrite('/api/construction/boq/match?x=1', 'POST')).toBe(false)
      expect(isBlockedWrite('/api/construction/rfqs?/api/construction/boq/match', 'POST')).toBe(true)
    })
  })

  it('denies by default, so a route added later is blocked until reviewed', () => {
    withReadOnly('1', () => {
      expect(isBlockedWrite('/api/construction/some/future/route', 'POST')).toBe(true)
      expect(isBlockedWrite('/api/construction/projects/1', 'DELETE')).toBe(true)
      expect(isBlockedWrite('/api/construction/projects/1', 'patch')).toBe(true)
    })
  })
})
