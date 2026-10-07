import type { AppView } from '../types'

export const simpleViews: AppView[] = ['home', 'settings', 'reports', 'material-prices', 'create-upload', 'create-proposals', 'rfq-list', 'supplier-management', 'learning-review', 'access-denied', 'services', 'tenders', 'booklets', 'login']

export function viewUrl(current: string, view: AppView, ids: { rfqId?: string | null; threadId?: string | null; bookletId?: string | null } = {}): string {
  const url = new URL(current)
  for (const key of ['view', 'rfq', 'thread', 'booklet', 'tab', 'supplier']) url.searchParams.delete(key)
  if (ids.bookletId) {
    url.searchParams.set('view', 'booklet'); url.searchParams.set('booklet', ids.bookletId)
  } else if (ids.threadId) {
    url.searchParams.set('view', 'inbox'); url.searchParams.set('thread', ids.threadId)
  } else if (ids.rfqId) {
    url.searchParams.set('view', 'rfq'); url.searchParams.set('rfq', ids.rfqId)
    if (view === 'offers' || view === 'comparison') url.searchParams.set('tab', 'quotes')
  } else url.searchParams.set('view', view)
  return url.pathname + url.search + url.hash
}
