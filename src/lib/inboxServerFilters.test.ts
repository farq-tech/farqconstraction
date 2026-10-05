import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ConstructionApiError,
  type ConstructionInboxThread,
  type ConstructionInboxThreadsResult,
} from '../api/constructionClient'
import {
  emptyFilters,
  facetCount,
  serverChips,
  serverFilterQuery,
  threadFacts,
  toggleCriterion,
  type InboxFilters,
  type ServerFacets,
} from './inboxFilters'
import { loadInboxTab, loadTabFacets, resetInboxTabsProbe } from './inboxTabs'

const tabCounts = { all: 9, inbound: 5, sent: 4, needs_reply: 2, hidden: 0, unread_threads: 1 }
const facets: ServerFacets = {
  version: 1,
  total: 7,
  channel: { platform: 1, whatsapp: 4, email: 1, chat: 1 },
  meaning: { QUOTE_FILE: 2, PRICE_IN_TEXT: 3, QUESTION: 0 },
  state: { needs_reply: 2, waiting_supplier: 3, unread: 1, read: 6 },
  quote: { submitted: 2, not_submitted: 5, new_version: 1 },
  attachment: { yes: 2 },
  owner: { mine: 3, unassigned: 4, colleague: 0 },
  account: null,
  date: { today: 1, '7d': 5 },
  item: null,
  requests: [{ rfq_id: 'r1', reference: 'RFQ-1', count: 4 }],
  booklets: [{ booklet_id: 'b1', reference: 'PR-H288', count: 3, requests: 2 }],
}

function withAll(): InboxFilters {
  let f = emptyFilters()
  f = toggleCriterion(f, { group: 'channel', value: 'whatsapp' })
  f = toggleCriterion(f, { group: 'channel', value: 'chat' })
  f = toggleCriterion(f, { group: 'meaning', value: 'QUOTE_FILE' })
  f = toggleCriterion(f, { group: 'meaning', value: 'VOICE' })
  f = toggleCriterion(f, { group: 'state', value: 'unread' })
  f = toggleCriterion(f, { group: 'quote', value: 'new_version' })
  f = toggleCriterion(f, { group: 'owner', value: 'mine' })
  f = toggleCriterion(f, { group: 'attachment', value: 'yes' })
  f = toggleCriterion(f, { group: 'booklet', value: 'b1' })
  return { ...f, rfqId: 'r1', item: '  بلوك 15 ', date: { preset: 'custom', from: '2026-09-01', to: '2026-09-28' } }
}

describe('serverFilterQuery', () => {
  it('sends nothing without filters, so the request is the one it always was', () => {
    expect(serverFilterQuery(emptyFilters(), { tz: 'Asia/Riyadh' })).toEqual({})
  })

  it('sends every selection, OR lists comma-joined, and asks for counts with the time zone', () => {
    expect(serverFilterQuery(withAll(), { counts: true, tz: 'Asia/Riyadh' })).toEqual({
      channel: 'whatsapp,chat',
      // «صوتية» is not a server meaning.
      meaning: 'QUOTE_FILE',
      state: 'unread',
      quote: 'new_version',
      owner: 'mine',
      attachment: '1',
      date: 'custom',
      date_from: '2026-09-01',
      date_to: '2026-09-28',
      item: 'بلوك 15',
      booklet_id: 'b1',
      tz: 'Asia/Riyadh',
      facets: '1',
    })
  })

  it('sends the time zone for a date preset even without counts', () => {
    const f = toggleCriterion(emptyFilters(), { group: 'date', value: 'today' })
    expect(serverFilterQuery(f, { tz: 'Asia/Riyadh' })).toEqual({ date: 'today', tz: 'Asia/Riyadh' })
    expect(serverFilterQuery(f, { tz: null })).toEqual({ date: 'today' })
  })
})

describe('facetCount / serverChips', () => {
  it('reads each pill from the server counts, null where it cannot tell', () => {
    expect(facetCount(facets, { group: 'channel', value: 'whatsapp' })).toBe(4)
    expect(facetCount(facets, { group: 'meaning', value: 'PRICE_IN_TEXT' })).toBe(3)
    expect(facetCount(facets, { group: 'state', value: 'read' })).toBe(6)
    expect(facetCount(facets, { group: 'quote', value: 'new_version' })).toBe(1)
    expect(facetCount(facets, { group: 'attachment', value: 'yes' })).toBe(2)
    expect(facetCount(facets, { group: 'owner', value: 'colleague' })).toBe(0)
    expect(facetCount(facets, { group: 'date', value: '7d' })).toBe(5)
    expect(facetCount(facets, { group: 'rfq', value: 'r1' })).toBe(4)
    expect(facetCount(facets, { group: 'rfq', value: 'other' })).toBe(0)
    expect(facetCount(facets, { group: 'booklet', value: 'b1' })).toBe(3)
    expect(facetCount(facets, { group: 'account', value: 'active' })).toBeNull()
    expect(facetCount({ ...facets, meaning: null }, { group: 'meaning', value: 'QUOTE_FILE' })).toBeNull()
    expect(facetCount(null, { group: 'channel', value: 'email' })).toBeNull()
  })

  it('gives the active chips the server numbers', () => {
    const f = toggleCriterion(emptyFilters(), { group: 'channel', value: 'email' })
    expect(serverChips(f, facets).map((c) => [c.key, c.count])).toEqual([['channel:email', 1]])
  })
})

describe('the row facts the server sends', () => {
  it('fill channel, meaning, files and quote state without opening the conversation', () => {
    const row: ConstructionInboxThread = {
      invite_id: 'i',
      channel: 'HARAJ',
      reply_kind: 'QUOTE_FILE',
      has_files: true,
      quote_submitted: true,
      quote_new_version: false,
      supplier_account_status: 'not_opened',
    }
    const f = threadFacts(row, { now: Date.now() })
    expect([f.channel, f.meaning, f.hasAttachment, f.quoteSubmitted, f.newVersion, f.account]).toEqual(['chat', 'QUOTE_FILE', true, true, false, 'not_opened'])
  })
})

describe('loadInboxTab with filters', () => {
  beforeEach(() => resetInboxTabsProbe())

  it('sends the filters and returns the server facets', async () => {
    const list = vi.fn(async (_query?: unknown): Promise<ConstructionInboxThreadsResult> => ({ threads: [], total_count: 7, tab_counts: tabCounts, facets }))
    const f = toggleCriterion(emptyFilters(), { group: 'channel', value: 'whatsapp' })
    const page = await loadInboxTab('inbound', { filters: f, counts: true, cursor: 'c' }, list)
    const query = list.mock.calls[0]![0] as { extra?: Record<string, string>; filter?: string; cursor?: string }
    expect(query.filter).toBe('inbound')
    expect(query.cursor).toBe('c')
    expect(query.extra).toMatchObject({ channel: 'whatsapp', facets: '1' })
    expect(page.facets).toEqual(facets)
    expect(page.total).toBe(7)
  })

  it('an API without facets gives facets: null, so the screen filters the loaded rows as before', async () => {
    const list = vi.fn(async (): Promise<ConstructionInboxThreadsResult> => ({ threads: [], total_count: 3, tab_counts: tabCounts }))
    const page = await loadInboxTab('inbound', { filters: emptyFilters(), counts: true }, list)
    expect(page.server).toBe(true)
    expect(page.facets).toBeNull()
  })

  it('an API from before server tabs gets no filter parameters and no facets', async () => {
    const list = vi.fn(async (query: { filter?: string; extra?: Record<string, string> } = {}): Promise<ConstructionInboxThreadsResult> => {
      if (query.filter !== 'all' && query.filter !== 'needs_reply') throw new ConstructionApiError('bad filter', 400, 'INBOX_INVALID_FILTER')
      return { threads: [], follow_up_counts: { all: 1, unanswered: 0 } }
    })
    const f = toggleCriterion(emptyFilters(), { group: 'channel', value: 'email' })
    const page = await loadInboxTab('inbound', { filters: f, counts: true }, list)
    expect(page.facets).toBeNull()
    expect(list).toHaveBeenLastCalledWith({ rfq_id: undefined, cursor: undefined, filter: 'all' })
    expect(await loadTabFacets('inbound', f, list)).toBeNull()
  })

  it('loadTabFacets counts a draft of the sheet on the same tab', async () => {
    const list = vi.fn(async (_query?: unknown): Promise<ConstructionInboxThreadsResult> => ({ threads: [], tab_counts: tabCounts, facets }))
    const f = { ...toggleCriterion(emptyFilters(), { group: 'owner', value: 'mine' }), rfqId: 'r1' }
    expect(await loadTabFacets('hidden', f, list)).toEqual(facets)
    const query = list.mock.calls[0]![0] as { extra?: Record<string, string>; rfq_id?: string; visibility?: string }
    expect(query.rfq_id).toBe('r1')
    expect(query.visibility).toBe('hidden')
    expect(query.extra).toMatchObject({ owner: 'mine', facets: '1' })
  })
})

describe('button taps and stickers as «معنى الرد» filters', () => {
  it('sends BUTTON and NON_TEXT_ACK to the server like any other meaning', () => {
    let filters: InboxFilters = emptyFilters()
    filters = toggleCriterion(filters, { group: 'meaning', value: 'BUTTON' })
    filters = toggleCriterion(filters, { group: 'meaning', value: 'NON_TEXT_ACK' })
    expect(serverFilterQuery(filters).meaning).toBe('BUTTON,NON_TEXT_ACK')
  })
})
