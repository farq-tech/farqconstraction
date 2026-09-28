/**
 * «المراسلات» tabs, read from the server one tab at a time.
 *
 * The API filters each tab itself (`filter=inbound|sent|needs_reply|hidden`)
 * and answers `tab_counts` from the same grouped rows, so a chip is exactly
 * the `total_count` of its tab. Each tab reads oldest → newest like a chat:
 * the first page is the tab's NEWEST conversations and «تحميل الأقدم» follows
 * `next_cursor` to the ones before them (the list re-sorts ascending, so
 * pages from an older API that still answers newest-first read the same).
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
  }
}

function legacyQuery(tab: InboxTab) {
  return {
    filter: tab === 'needs_reply' ? ('needs_reply' as const) : ('all' as const),
    ...(tab === 'hidden' ? { visibility: 'hidden' as const } : {}),
  }
}

export async function loadInboxTab(
  tab: InboxTab,
  opts: { rfqId?: string | null; cursor?: string | null } = {},
  list: ListFn = listConstructionInboxThreads,
): Promise<InboxTabPage> {
  const base = { rfq_id: opts.rfqId || undefined, cursor: opts.cursor || undefined }
  if (!legacyApi) {
    try {
      const result = await list({
        ...base,
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

/** Rows of a next page after the loaded ones, never the same conversation twice. */
export function appendThreads(
  loaded: ConstructionInboxThread[],
  more: ConstructionInboxThread[],
): ConstructionInboxThread[] {
  const seen = new Set(loaded.map((t) => String(t.invite_id || '')))
  return [...loaded, ...more.filter((t) => !t.invite_id || !seen.has(String(t.invite_id)))]
}
