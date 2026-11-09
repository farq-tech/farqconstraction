export type DispatchAttemptEvidence = {
  channel: string
  status: string
  sent_at?: string | null
  attempted_at?: string | null
  failure_code?: string | null
  provider_delivery?: { state?: string; at?: string | null }
}

const ACCEPTED_INVITE_DELIVERY_STATES = new Set([
  'SENT',
  'PARTIALLY_SENT',
  'DELIVERED',
  'OPENED',
  'READ',
])

/** A provider accepted this invite, or a supplier interaction proves it arrived. */
export function inviteHasAcceptedDispatch(invite: {
  delivery_status?: string | null
  dispatch_attempts?: readonly DispatchAttemptEvidence[] | null
}): boolean {
  const status = String(invite.delivery_status || '').toUpperCase()
  return ACCEPTED_INVITE_DELIVERY_STATES.has(status)
    || Boolean(invite.dispatch_attempts?.some((attempt) => attempt.status === 'SENT'))
}

/** Retry only when the selected channel has no acceptance or unresolved attempt. */
export function inviteCanRetryDispatch(
  invite: {
    delivery_status?: string | null
    dispatch_attempts?: readonly DispatchAttemptEvidence[] | null
  },
  channel: string,
): boolean {
  const attempts = (invite.dispatch_attempts || []).filter((attempt) => attempt.channel === channel)
  const latest = latestDispatchAttempt(attempts, channel)
  if (latest) {
    if (['DELIVERY_FAILED', 'FAILED'].includes(latest.status)) return true
    // Meta acceptance followed by a definitive failed receipt is safe to
    // retry/fall back; an acceptance without such a receipt stays protected.
    return latest.status === 'SENT' && latest.provider_delivery?.state === 'FAILED'
  }
  return !ACCEPTED_INVITE_DELIVERY_STATES.has(String(invite.delivery_status || '').toUpperCase())
}

/** Return the newest recorded attempt for a channel, preserving API order for untimed legacy rows. */
export function latestDispatchAttempt<T extends DispatchAttemptEvidence>(
  attempts: readonly T[] | null | undefined,
  channel: string,
): T | undefined {
  let latest: T | undefined
  let latestTime: number | null = null

  for (const attempt of attempts || []) {
    if (attempt.channel !== channel) continue
    const time = Date.parse(String(attempt.attempted_at || attempt.sent_at || attempt.provider_delivery?.at || ''))
    if (Number.isFinite(time)) {
      if (latestTime === null || time >= latestTime) {
        latest = attempt
        latestTime = time
      }
    } else if (latestTime === null) {
      // Untimed rows use their stable response order; never let one override
      // a timestamped attempt that gives us stronger recency evidence.
      latest = attempt
    }
  }
  return latest
}

/** Prefer the strongest successful channel evidence; a failed WhatsApp receipt
 * must not hide an accepted email fallback recorded on the same invitation. */
export function bestAcceptedDispatchAttempt<T extends DispatchAttemptEvidence>(
  attempts: readonly T[] | null | undefined,
): T | undefined {
  const accepted = (attempts || []).filter((attempt) => {
    if (String(attempt.status || '').toUpperCase() !== 'SENT') return false
    return !(attempt.channel === 'WHATSAPP' && String(attempt.provider_delivery?.state || '').toUpperCase() === 'FAILED')
  })
  const score = (attempt: T) => {
    const receipt = String(attempt.provider_delivery?.state || '').toUpperCase()
    if (receipt === 'READ') return 3
    if (receipt === 'DELIVERED') return 2
    return 1
  }
  return accepted.reduce<T | undefined>((best, attempt) => {
    if (!best || score(attempt) > score(best)) return attempt
    return best
  }, undefined)
}

export type RecordedAttemptOutcome = 'ACCEPTED' | 'FAILED' | 'UNKNOWN'

/** Only begin a new batch after the server confirms no previous job is active. */
export function dispatchJobAllowsRetry(state: string | null | undefined): boolean {
  return ['NONE', 'DONE', 'FAILED', 'CANCELLED'].includes(String(state || '').toUpperCase())
}

export function dispatchPollTimedOut(lastProgressAt: number, now: number, timeoutMs: number): boolean {
  return now - lastProgressAt >= timeoutMs
}

/** SENT is provider acceptance, while no channel-specific attempt is unknown. */
export function recordedAttemptOutcome(attempt: DispatchAttemptEvidence | undefined): RecordedAttemptOutcome {
  if (!attempt) return 'UNKNOWN'
  const status = String(attempt.status || '').toUpperCase()
  if (status === 'SENT') return 'ACCEPTED'
  if (['FAILED', 'DELIVERY_FAILED', 'NOT_SENT'].includes(status) || status.startsWith('SKIPPED')) return 'FAILED'
  return 'UNKNOWN'
}
