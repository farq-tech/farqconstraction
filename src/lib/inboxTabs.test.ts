import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ConstructionApiError,
  inboxUnreadConversations,
  type ConstructionInboxThread,
  type ConstructionInboxThreadsResult,
} from '../api/constructionClient'
import { appendThreads, legacyTabPage, loadInboxTab, resetInboxTabsProbe } from './inboxTabs'

const row = (id: string, extra: Partial<ConstructionInboxThread> = {}): ConstructionInboxThread => ({
  invite_id: id,
  supplier_id: `s-${id}`,
  ...extra,
})

const tabCounts = { all: 940, inbound: 5, sent: 935, needs_reply: 2, hidden: 3, unread_threads: 1 }

describe('loadInboxTab against a server that filters tabs', () => {
  beforeEach(() => resetInboxTabsProbe())

  it('sends the tab as the filter and takes the counts and total from the server', async () => {
    const list = vi.fn(async (): Promise<ConstructionInboxThreadsResult> => ({
      threads: [row('a', { kind_hint: 'DISPATCH' })],
      total_count: 935,
      tab_counts: tabCounts,
      next_cursor: 'next',
    }))
    const page = await loadInboxTab('sent', { rfqId: 'r1' }, list)
    expect(list).toHaveBeenCalledWith({ rfq_id: 'r1', cursor: undefined, filter: 'sent' })
    expect(page.server).toBe(true)
    // No client-side split: the rows are the server's rows.
    expect(page.threads.map((t) => t.invite_id)).toEqual(['a'])
    expect(page.total).toBe(935)
    expect(page.counts).toEqual({ inbound: 5, needs_reply: 2, sent: 935, hidden: 3 })
    expect(page.unreadThreads).toBe(1)
    expect(page.nextCursor).toBe('next')
  })

  it('asks for the hidden list in a way older servers also understand, and passes the cursor on', async () => {
    const list = vi.fn(async (): Promise<ConstructionInboxThreadsResult> => ({ threads: [], total_count: 3, tab_counts: tabCounts }))
    await loadInboxTab('hidden', { cursor: 'c2' }, list)
    expect(list).toHaveBeenCalledWith({ rfq_id: undefined, cursor: 'c2', filter: 'hidden', visibility: 'hidden' })
  })
})

describe('loadInboxTab against an older API', () => {
  beforeEach(() => resetInboxTabsProbe())

  it('falls back to all + split on INBOX_INVALID_FILTER, and stops asking afterwards', async () => {
    const list = vi.fn(async (query: { filter?: string } = {}): Promise<ConstructionInboxThreadsResult> => {
      if (query.filter !== 'all' && query.filter !== 'needs_reply') {
        throw new ConstructionApiError('bad filter', 400, 'INBOX_INVALID_FILTER')
      }
      return {
        threads: [row('invite', { kind_hint: 'DISPATCH' }), row('reply', { kind_hint: 'QUESTION', needs_reply: true })],
        follow_up_counts: { all: 10, action: 1, unanswered: 7 },
        hidden_count: 2,
        next_cursor: null,
      }
    })
    const inbound = await loadInboxTab('inbound', {}, list)
    expect(inbound.server).toBe(false)
    expect(inbound.threads.map((t) => t.invite_id)).toEqual(['reply'])
    expect(inbound.total).toBe(3)
    expect(inbound.counts).toEqual({ needs_reply: 1, sent: 7, hidden: 2 })
    expect(list).toHaveBeenCalledTimes(2)

    const sent = await loadInboxTab('sent', {}, list)
    expect(sent.threads.map((t) => t.invite_id)).toEqual(['invite'])
    expect(list).toHaveBeenCalledTimes(3)
    expect(list).toHaveBeenLastCalledWith({ rfq_id: undefined, cursor: undefined, filter: 'all' })
  })

  it('reads a needs_reply answer without tab_counts the old way', async () => {
    const list = vi.fn(async (): Promise<ConstructionInboxThreadsResult> => ({
      threads: [row('x', { needs_reply: true })],
      total_count: 4,
      follow_up_counts: { action: 4 },
    }))
    const page = await loadInboxTab('needs_reply', {}, list)
    expect(page.server).toBe(false)
    expect(page.total).toBe(4)
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('does not swallow other errors', async () => {
    const list = vi.fn(async (): Promise<ConstructionInboxThreadsResult> => {
      throw new ConstructionApiError('down', 503, 'INBOX_UNAVAILABLE')
    })
    await expect(loadInboxTab('inbound', {}, list)).rejects.toThrow('down')
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('legacyTabPage keeps the old totals', () => {
    const result = { threads: [], total_count: 9, follow_up_counts: { all: 10, unanswered: 7, action: 2 } }
    expect(legacyTabPage('inbound', result).total).toBe(3)
    expect(legacyTabPage('sent', result).total).toBe(7)
    expect(legacyTabPage('needs_reply', result).total).toBe(2)
    expect(legacyTabPage('hidden', result).total).toBe(9)
  })
})

describe('appendThreads', () => {
  it('adds the next page after the loaded rows without repeating one', () => {
    expect(appendThreads([row('a'), row('b')], [row('b'), row('c')]).map((t) => t.invite_id)).toEqual(['a', 'b', 'c'])
  })
})

describe('inboxUnreadConversations', () => {
  it('counts conversations when the API reports them, messages otherwise', () => {
    expect(inboxUnreadConversations({ messages: [], unread_count: 12, unread_threads: 3 })).toEqual({ count: 3, conversations: true })
    expect(inboxUnreadConversations({ messages: [], unread_count: 12 })).toEqual({ count: 12, conversations: false })
  })
})
