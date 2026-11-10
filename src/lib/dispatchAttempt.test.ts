import { describe, expect, it } from 'vitest'
import { acquireDispatchLock, bestAcceptedDispatchAttempt, dispatchJobAllowsRetry, dispatchPollTimedOut, inviteCanRetryDispatch, inviteHasAcceptedDispatch, latestDispatchAttempt, recordedAttemptOutcome } from './dispatchAttempt'

describe('dispatch attempt evidence', () => {
  it('allows only one retry batch until the active run releases its lock', () => {
    const lock = { current: false }
    const release = acquireDispatchLock(lock)
    expect(release).toBeTypeOf('function')
    expect(acquireDispatchLock(lock)).toBeNull()
    release?.()
    release?.()
    expect(acquireDispatchLock(lock)).toBeTypeOf('function')
  })

  it('only allows another batch after a terminal server job state', () => {
    for (const state of ['NONE', 'DONE', 'FAILED', 'CANCELLED']) {
      expect(dispatchJobAllowsRetry(state)).toBe(true)
    }
    for (const state of ['QUEUED', 'RUNNING', 'UNKNOWN', '', undefined]) {
      expect(dispatchJobAllowsRetry(state)).toBe(false)
    }
  })

  it('times out a server dispatch only after the configured period without progress', () => {
    expect(dispatchPollTimedOut(10_000, 99_999, 90_000)).toBe(false)
    expect(dispatchPollTimedOut(10_000, 100_000, 90_000)).toBe(true)
  })

  it('does not infer an email send from invitation-wide status without an email attempt', () => {
    const attempts = [{ channel: 'WHATSAPP', status: 'SENT', sent_at: '2026-11-09T12:00:00Z' }]
    expect(recordedAttemptOutcome(latestDispatchAttempt(attempts, 'EMAIL'))).toBe('UNKNOWN')
  })

  it('uses the newest channel attempt, not an older successful attempt', () => {
    const attempts = [
      { channel: 'EMAIL', status: 'SENT', sent_at: '2026-11-08T12:00:00Z' },
      { channel: 'EMAIL', status: 'DELIVERY_FAILED', sent_at: '2026-11-09T12:00:00Z' },
    ]
    const latest = latestDispatchAttempt(attempts, 'EMAIL')
    expect(latest?.status).toBe('DELIVERY_FAILED')
    expect(recordedAttemptOutcome(latest)).toBe('FAILED')
  })

  it('keeps unfamiliar or in-progress attempt states unknown', () => {
    expect(recordedAttemptOutcome({ channel: 'EMAIL', status: 'QUEUED' })).toBe('UNKNOWN')
    expect(recordedAttemptOutcome({ channel: 'EMAIL', status: 'ACCEPTED' })).toBe('UNKNOWN')
  })

  it('does not let a failed WhatsApp receipt hide a successful email fallback', () => {
    const whatsapp = { channel: 'WHATSAPP', status: 'SENT', provider_delivery: { state: 'FAILED' } }
    const email = { channel: 'EMAIL', status: 'SENT' }
    expect(bestAcceptedDispatchAttempt([whatsapp, email])).toBe(email)
    expect(bestAcceptedDispatchAttempt([email, whatsapp])).toBe(email)
    expect(bestAcceptedDispatchAttempt([whatsapp])).toBeUndefined()
  })

  it('prefers confirmed delivery/read evidence over unconfirmed provider acceptance', () => {
    const accepted = { channel: 'WHATSAPP', status: 'SENT', provider_delivery: { state: 'ACCEPTED' } }
    const delivered = { channel: 'WHATSAPP', status: 'SENT', provider_delivery: { state: 'DELIVERED' } }
    expect(bestAcceptedDispatchAttempt([accepted, delivered])).toBe(delivered)
  })

  it('uses response order when legacy attempt rows have no timestamp', () => {
    const attempts = [
      { channel: 'EMAIL', status: 'SENT' },
      { channel: 'EMAIL', status: 'DELIVERY_FAILED' },
    ]
    expect(latestDispatchAttempt(attempts, 'EMAIL')?.status).toBe('DELIVERY_FAILED')
  })

  it.each(['SENT', 'PARTIALLY_SENT', 'DELIVERED', 'OPENED', 'READ'])(
    'does not offer a second dispatch when invitation status is %s',
    (delivery_status) => {
      expect(inviteHasAcceptedDispatch({ delivery_status })).toBe(true)
    },
  )

  it('uses recorded provider acceptance when the aggregate invite status is stale', () => {
    expect(inviteHasAcceptedDispatch({
      delivery_status: 'PENDING',
      dispatch_attempts: [{ channel: 'WHATSAPP', status: 'SENT' }],
    })).toBe(true)
  })

  it('leaves failed and not-yet-sent invitations eligible for a retry', () => {
    expect(inviteHasAcceptedDispatch({ delivery_status: 'FAILED' })).toBe(false)
    expect(inviteHasAcceptedDispatch({ delivery_status: 'PENDING' })).toBe(false)
  })

  it('retries a recorded channel failure but blocks a channel with an unresolved attempt', () => {
    expect(inviteCanRetryDispatch({
      dispatch_attempts: [{ channel: 'EMAIL', status: 'DELIVERY_FAILED' }],
    }, 'EMAIL')).toBe(true)
    expect(inviteCanRetryDispatch({
      dispatch_attempts: [{ channel: 'EMAIL', status: 'UNKNOWN' }],
    }, 'EMAIL')).toBe(false)
    expect(inviteCanRetryDispatch({
      dispatch_attempts: [{ channel: 'EMAIL', status: 'SENT' }],
    }, 'EMAIL')).toBe(false)
    expect(inviteCanRetryDispatch({
      delivery_status: 'SENT',
      dispatch_attempts: [{
        channel: 'WHATSAPP',
        status: 'SENT',
        provider_delivery: { state: 'FAILED' },
      }],
    }, 'WHATSAPP')).toBe(true)
  })
})
