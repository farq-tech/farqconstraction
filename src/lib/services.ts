import type { AppView } from '../types'
import type { ConstructionMyServices } from '../api/constructionClient'

/*
 * ADD-ON SERVICES («الخدمات») — what the app shows for this account.
 *
 * Today's behaviour is the floor: when the server does not answer, answers
 * without gating, or the endpoint does not exist yet, `rfq` is visible exactly
 * as before. Only an enforced «off» from the server hides it. Any other
 * service (e.g. `etimad`) is shown only when the server says it is enabled.
 */

/** What an account gets when nothing is known — the same default as the API. */
export const DEFAULT_SERVICES: readonly string[] = ['rfq']

export type ServicesState = {
  has: (key: string) => boolean
  canManage: boolean
  /** True once the server answered (false while loading or when it failed). */
  known: boolean
}

export function resolveServices(response: ConstructionMyServices | null | undefined): ServicesState {
  const enabled = new Map<string, boolean>()
  for (const service of response?.services || []) enabled.set(String(service.key), service.enabled === true)
  const enforced = response?.gating === 'enforce'
  return {
    known: Boolean(response),
    canManage: response?.can_manage === true,
    has(key: string) {
      // Not enforced (or unknown): the RFQ product stays exactly as it is.
      if (DEFAULT_SERVICES.includes(key) && !enforced) return true
      if (enabled.has(key)) return enabled.get(key) === true
      return DEFAULT_SERVICES.includes(key)
    },
  }
}

/** Screens that belong to a service; anything not listed is always shown. */
const VIEW_SERVICE: Partial<Record<AppView, string>> = {
  'rfq-list': 'rfq',
  'create-upload': 'rfq',
  'create-proposals': 'rfq',
  'rfq-detail': 'rfq',
  'rfq-closed': 'rfq',
  sent: 'rfq',
  'sent-failure': 'rfq',
  offers: 'rfq',
  'offer-detail': 'rfq',
  comparison: 'rfq',
  award: 'rfq',
  'award-success': 'rfq',
  booklets: 'rfq',
  'booklet-detail': 'rfq',
  // «منافسات المقاولات» (public Etimad tenders) — off unless the server enables it.
  tenders: 'etimad',
}

export function serviceForView(view: AppView): string | null {
  return VIEW_SERVICE[view] ?? null
}

export function viewAllowed(view: AppView, state: ServicesState): boolean {
  const key = serviceForView(view)
  return key == null || state.has(key)
}
