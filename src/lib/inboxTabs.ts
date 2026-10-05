/**
 * «المراسلات» tabs, read from the server one tab at a time.
 *
 * The API filters each tab itself (`filter=inbound|sent|needs_reply|hidden`)
 * and answers `tab_counts` from the same grouped rows, so a chip is exactly
 * the `total_count` of its tab and «تحميل المزيد» pages with `next_cursor`.
 *
 * An API from before that change refuses the new filters (400
 * INBOX_INVALID_FILTER) and sends no `tab_counts`. Against it we fall back to
 * what this screen used to do — read `all` and split the page here — so the
 * app keeps working whichever side is deployed first.
 */
import {
  ConstructionApiError,
  isOutboundInviteSnapshot,
  listConstructionInboxThreads,
  type ConstructionInboxThread,
  type ConstructionInboxThreadsResult,
} from '../api/constructionClient'
import type { InboxTab } from '../components/inbox/ConversationList'
import { serverFilterQuery, type InboxFilters, type ServerFacets } from './inboxFilters'

export type InboxTabCounts = Partial<Record<InboxTab, number>>

export type InboxTabPage = {
  threads: ConstructionInboxThread[]
  /** Conversations in this tab on the server; the page may hold fewer. */
  total: number
  nextCursor: string | null
  /** Chip per tab; a tab missing here has no chip. */
  counts: InboxTabCounts
  /** Unread conversations (not hidden, not closed); null from an older API. */
  unreadThreads: number | null
  /** true = the server split the tabs; false = older API, split on this page. */
  server: boolean
  /**
   * Counts for «فلترة المحادثات» when the server filters them itself; null =
   * an API without facets, whose rows the screen filters as before.
   */
  facets: ServerFacets | null
}

type ListFn = typeof listConstructionInboxThreads

/** Set once an API refused a tab filter; later reads go straight to the old way. */
let legacyApi = false

/** For tests. */
export function resetInboxTabsProbe() {
  legacyApi = false
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function withoutUndefined(counts: Record<string, number | undefined>): InboxTabCounts {
  return Object.fromEntries(Object.entries(counts).filter(([, v]) => v !== undefined)) as InboxTabCounts
}

export function serverTabPage(result: ConstructionInboxThreadsResult): InboxTabPage {
  const tc = result.tab_counts || {}
  const threads = result.threads || []
  return {
    threads,
    total: num(result.total_count) ?? threads.length,
    nextCursor: result.next_cursor || null,
    counts: withoutUndefined({
      inbound: num(tc.inbound),
      needs_reply: num(tc.needs_reply),
      sent: num(tc.sent),
      hidden: num(tc.hidden),
    }),
    unreadThreads: num(tc.unread_threads) ?? null,
    server: true,
    facets: result.facets && typeof result.facets === 'object' ? result.facets : null,
  }
}

/** Older API: one `all` (or needs_reply / hidden) page, split here. */
export function legacyTabPage(tab: InboxTab, result: ConstructionInboxThreadsResult): InboxTabPage {
  const raw = result.threads || []
  const threads =
    tab === 'hidden'
      ? raw
      : tab === 'needs_reply'
        ? raw.filter((t) => Boolean(t.needs_reply))
        : tab === 'sent'
          ? raw.filter((t) => isOutboundInviteSnapshot(t))
          : raw.filter((t) => !isOutboundInviteSnapshot(t))
  const fu = result.follow_up_counts
  let total = threads.length
  if (tab === 'hidden') total = num(result.total_count) ?? total
  else if (tab === 'needs_reply') total = num(fu?.action) ?? num(result.total_count) ?? total
  else if (tab === 'sent') total = num(fu?.unanswered) ?? total
  else if (fu?.all != null && fu?.unanswered != null) total = Math.max(0, fu.all - fu.unanswered)
  return {
    threads,
    total,
    nextCursor: result.next_cursor || null,
    counts: withoutUndefined({
      needs_reply: num(fu?.action),
      sent: num(fu?.unanswered),
      hidden: num(result.hidden_count),
    }),
    unreadThreads: null,
    server: false,
    facets: null,
  }
}

function legacyQuery(tab: InboxTab) {
  return {
    filter: tab === 'needs_reply' ? ('needs_reply' as const) : ('all' as const),
    ...(tab === 'hidden' ? { visibility: 'hidden' as const } : {}),
  }
}

/**
 * One page of a tab. `filters` (everything but the request, which goes as
 * `rfq_id`) are sent to servers that filter tabs; `counts` asks for facets.
 * An API without facets ignores them — the page then has `facets: null` and
 * the screen filters its rows itself.
 */
export async function loadInboxTab(
  tab: InboxTab,
  opts: { rfqId?: string | null; cursor?: string | null; filters?: InboxFilters | null; counts?: boolean } = {},
  list: ListFn = listConstructionInboxThreads,
): Promise<InboxTabPage> {
  const base = { rfq_id: opts.rfqId || undefined, cursor: opts.cursor || undefined }
  const extra = opts.filters ? serverFilterQuery(opts.filters, { counts: opts.counts }) : opts.counts ? { facets: '1' } : {}
  if (!legacyApi) {
    try {
      const result = await list({
        ...base,
        ...(Object.keys(extra).length ? { extra } : {}),
        filter: tab,
        // An older API ignores `filter=hidden` only by refusing it; it knows this.
        ...(tab === 'hidden' ? { visibility: 'hidden' as const } : {}),
      })
      return result.tab_counts ? serverTabPage(result) : legacyTabPage(tab, result)
    } catch (err) {
      if (!(err instanceof ConstructionApiError && err.status === 400 && err.code === 'INBOX_INVALID_FILTER')) throw err
      legacyApi = true
    }
  }
  return legacyTabPage(tab, await list({ ...base, ...legacyQuery(tab) }))
}

/**
 * The server's counts for a draft of the filter sheet (same tab, same
 * request), or null when the API has no facets. One list read of 25 rows.
 */
export async function loadTabFacets(
  tab: InboxTab,
  filters: InboxFilters,
  list: ListFn = listConstructionInboxThreads,
): Promise<ServerFacets | null> {
  if (legacyApi) return null
  const result = await list({
    rfq_id: filters.rfqId || undefined,
    extra: serverFilterQuery(filters, { counts: true }),
    filter: tab,
    ...(tab === 'hidden' ? { visibility: 'hidden' as const } : {}),
  })
  return result.tab_counts && result.facets && typeof result.facets === 'object' ? result.facets : null
}

/** Rows of a next page after the loaded ones, never the same conversation twice. */
export function appendThreads(
  loaded: ConstructionInboxThread[],
  more: ConstructionInboxThread[],
): ConstructionInboxThread[] {
  const seen = new Set(loaded.map((t) => String(t.invite_id || '')))
  return [...loaded, ...more.filter((t) => !t.invite_id || !seen.has(String(t.invite_id)))]
}
