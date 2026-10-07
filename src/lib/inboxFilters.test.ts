import { describe, expect, it } from 'vitest'
import type { ConstructionInboxThread } from '../api/constructionClient'
import {
  SAVED_VIEWS_KEY,
  activeChips,
  activeFilterCount,
  applyFilters,
  channelKey,
  deleteSavedView,
  emptyFilters,
  hasAccountData,
  loadSavedViews,
  noResultSuggestion,
  removeCriterion,
  sanitizeFilters,
  saveView,
  suggestViewName,
  threadFacts,
  toggleCriterion,
  unknownFacts,
  type FilterContext,
  type InboxFilters,
} from './inboxFilters'

const NOW = new Date(2026, 8, 27, 12, 0, 0).getTime()
const today = (h: number) => new Date(2026, 8, 27, h, 0, 0).toISOString()
const daysAgo = (d: number) => new Date(NOW - d * 86400000).toISOString()

function row(id: string, extra: Partial<ConstructionInboxThread> & Record<string, unknown> = {}): ConstructionInboxThread {
  return {
    invite_id: id,
    supplier_id: `s-${id}`,
    supplier_name_ar: `مورد ${id}`,
    unread_count: 0,
    needs_reply: false,
    kind_hint: 'UNCLASSIFIED',
    last_received_at: today(9),
    response_status: 'INVITED',
    owner_user_id: null,
    request_context: { rfq_id: 'rfq-580', reference: 'PR-580', items: [{ name_ar: 'بلوك مقاس 15 سم' }] },
    ...extra,
  } as ConstructionInboxThread
}

const threads: ConstructionInboxThread[] = [
  row('a', { unread_count: 2, needs_reply: true, kind_hint: 'QUESTION' }),
  row('b', { kind_hint: 'CORRESPONDENCE', response_status: 'QUOTED', owner_user_id: 'me', can_reply: true }),
  row('c', {
    last_received_at: daysAgo(3),
    owner_user_id: 'colleague',
    request_context: { rfq_id: 'rfq-288', reference: 'PR-H288', items: [{ name_ar: 'حديد تسليح 12 مم' }] },
  }),
  row('d', { last_received_at: daysAgo(20), unread_count: 1, preview: 'السعر يشمل التوصيل؟' }),
]

const ctx: FilterContext = {
  now: NOW,
  meId: 'me',
  insights: {
    a: { channel: 'WHATSAPP', replyKind: 'QUESTION', hasFiles: false },
    b: { channel: 'EMAIL', replyKind: 'QUOTE_FILE', hasFiles: true, quoteVersion: 2 },
    c: { channel: 'HARAJ' },
  },
}

const ids = (list: ConstructionInboxThread[]) => list.map((t) => t.invite_id)
const withFilters = (patch: Partial<InboxFilters>): InboxFilters => ({ ...emptyFilters(), ...patch })

describe('threadFacts', () => {
  it('reads row fields and the insight of an opened conversation', () => {
    const a = threadFacts(threads[0]!, ctx)
    expect(a).toMatchObject({ channel: 'whatsapp', meaning: 'QUESTION', needsReply: true, unread: true, owner: 'unassigned', hasAttachment: false })
    const b = threadFacts(threads[1]!, ctx)
    expect(b).toMatchObject({ channel: 'email', meaning: 'QUOTE_FILE', waitingSupplier: true, quoteSubmitted: true, newVersion: true, owner: 'mine' })
  })

  it('never guesses: unknown channel, meaning and attachment stay null', () => {
    const d = threadFacts(threads[3]!, ctx)
    expect(d.channel).toBeNull()
    expect(d.meaning).toBeNull()
    expect(d.hasAttachment).toBeNull()
  })

  it('names Haraj «chat» and the platform form «platform»', () => {
    expect(channelKey('HARAJ')).toBe('chat')
    expect(channelKey('FORM')).toBe('platform')
    expect(channelKey('SMS')).toBeNull()
  })

  it('uses can_reply for ownership when the user id is unknown', () => {
    const facts = threadFacts(row('x', { owner_user_id: 'u1', can_reply: false }), { now: NOW })
    expect(facts.owner).toBe('colleague')
    expect(threadFacts(row('y', { owner_user_id: 'u1', can_reply: true }), { now: NOW }).owner).toBe('mine')
  })

  it('does not read hidden text of a sealed thread for item search', () => {
    const sealed = row('z', { locked: true, preview: 'سر', request_context: { rfq_id: 'r', items: [] } })
    expect(threadFacts(sealed, { now: NOW }).itemText).toBe('')
  })
})

describe('applyFilters', () => {
  it('returns everything with no filter', () => {
    expect(applyFilters(threads, emptyFilters(), ctx)).toHaveLength(4)
  })

  it('ORs inside a group and ANDs across groups', () => {
    expect(ids(applyFilters(threads, withFilters({ channels: ['whatsapp', 'email'] }), ctx))).toEqual(['a', 'b'])
    expect(ids(applyFilters(threads, withFilters({ channels: ['whatsapp', 'email'], states: ['unread'] }), ctx))).toEqual(['a'])
  })

  it('filters by conversation state', () => {
    expect(ids(applyFilters(threads, withFilters({ states: ['needs_reply'] }), ctx))).toEqual(['a'])
    expect(ids(applyFilters(threads, withFilters({ states: ['waiting_supplier'] }), ctx))).toEqual(['b'])
    expect(ids(applyFilters(threads, withFilters({ states: ['read'] }), ctx))).toEqual(['b', 'c'])
  })

  it('filters by reply meaning, attachment and quote status', () => {
    expect(ids(applyFilters(threads, withFilters({ meanings: ['QUESTION'] }), ctx))).toEqual(['a'])
    expect(ids(applyFilters(threads, withFilters({ hasAttachment: true }), ctx))).toEqual(['b'])
    expect(ids(applyFilters(threads, withFilters({ quote: ['submitted'] }), ctx))).toEqual(['b'])
    expect(ids(applyFilters(threads, withFilters({ quote: ['not_submitted'] }), ctx))).toEqual(['a', 'c', 'd'])
    expect(ids(applyFilters(threads, withFilters({ quote: ['new_version'] }), ctx))).toEqual(['b'])
  })

  it('filters by owner, request and booklet', () => {
    expect(ids(applyFilters(threads, withFilters({ owner: ['mine'] }), ctx))).toEqual(['b'])
    expect(ids(applyFilters(threads, withFilters({ owner: ['colleague'] }), ctx))).toEqual(['c'])
    expect(ids(applyFilters(threads, withFilters({ rfqId: 'rfq-288' }), ctx))).toEqual(['c'])
    const bookletCtx: FilterContext = { ...ctx, bookletByRfq: { 'rfq-288': { bookletId: 'bk', reference: 'PR-H288', waveNumber: 2, waves: 6 } } }
    expect(ids(applyFilters(threads, withFilters({ bookletId: 'bk' }), bookletCtx))).toEqual(['c'])
  })

  it('filters by date presets and a custom range', () => {
    expect(ids(applyFilters(threads, withFilters({ date: { preset: 'today' } }), ctx))).toEqual(['a', 'b'])
    expect(ids(applyFilters(threads, withFilters({ date: { preset: '7d' } }), ctx))).toEqual(['a', 'b', 'c'])
    const from = new Date(NOW - 25 * 86400000)
    const to = new Date(NOW - 10 * 86400000)
    const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(ids(applyFilters(threads, withFilters({ date: { preset: 'custom', from: day(from), to: day(to) } }), ctx))).toEqual(['d'])
  })

  it('searches item text with Arabic folding', () => {
    expect(ids(applyFilters(threads, withFilters({ item: 'حديد' }), ctx))).toEqual(['c'])
    expect(ids(applyFilters(threads, withFilters({ item: 'بلوك 15' }), ctx))).toEqual(['a', 'b', 'd'])
  })
})

describe('chips', () => {
  const filters = withFilters({ channels: ['whatsapp'], states: ['needs_reply'], rfqId: 'rfq-580' })

  it('counts each chip on its own and labels it', () => {
    const chips = activeChips(threads, filters, ctx, { request: (id) => (id === 'rfq-580' ? 'PR-580' : null) })
    expect(chips.map((c) => [c.label, c.count])).toEqual([
      ['الطلب: PR-580', 3],
      ['القناة: واتساب', 1],
      ['تحتاج رد', 1],
    ])
    expect(activeFilterCount(filters)).toBe(3)
  })

  it('removes one chip and toggles criteria', () => {
    const next = removeCriterion(filters, { group: 'channel', value: 'whatsapp' })
    expect(next.channels).toEqual([])
    expect(next.states).toEqual(['needs_reply'])
    expect(toggleCriterion(next, { group: 'state', value: 'needs_reply' }).states).toEqual([])
    expect(toggleCriterion(next, { group: 'attachment', value: 'yes' }).hasAttachment).toBe(true)
  })

  it('suggests the chip whose removal brings results back', () => {
    const none = withFilters({ channels: ['chat'], states: ['unread'] })
    expect(applyFilters(threads, none, ctx)).toHaveLength(0)
    const hint = noResultSuggestion(threads, none, ctx)
    expect(hint?.chip.label).toBe('القناة: محادثة')
    expect(hint?.results).toBe(2)
  })

  it('reports rows it cannot judge and hides account status without data', () => {
    const unknown = unknownFacts(threads, ctx)
    expect(unknown).toMatchObject({ channel: 1, meaning: 2, attachment: 2, total: 4 })
    expect(hasAccountData(threads)).toBe(false)
    expect(hasAccountData([row('q', { supplier_account_status: 'ACTIVE' })])).toBe(true)
  })

  it('suggests a view name from the chips', () => {
    expect(suggestViewName(withFilters({ states: ['needs_reply'], rfqId: 'r1' }), { request: () => 'PR-580' })).toBe('PR-580 — تحتاج رد')
  })
})

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    raw: map,
  }
}

describe('saved views', () => {
  it('saves, lists newest first, replaces by name and deletes', () => {
    const storage = memoryStorage()
    expect(loadSavedViews(storage)).toEqual([])
    saveView('تحتاج رد — PR-580', withFilters({ states: ['needs_reply'] }), storage)
    const views = saveView('واتساب بلا رد', withFilters({ channels: ['whatsapp'] }), storage)
    expect(views.map((v) => v.name)).toEqual(['واتساب بلا رد', 'تحتاج رد — PR-580'])
    const replaced = saveView('واتساب بلا رد', withFilters({ channels: ['email'] }), storage)
    expect(replaced).toHaveLength(2)
    expect(replaced[0]!.filters.channels).toEqual(['email'])
    expect(deleteSavedView(replaced[0]!.id, storage).map((v) => v.name)).toEqual(['تحتاج رد — PR-580'])
  })

  it('refuses an empty view or name', () => {
    const storage = memoryStorage()
    expect(saveView('فارغ', emptyFilters(), storage)).toEqual([])
    expect(saveView('  ', withFilters({ states: ['unread'] }), storage)).toEqual([])
  })

  it('survives broken or foreign storage content', () => {
    const storage = memoryStorage()
    storage.setItem(SAVED_VIEWS_KEY, '{not json')
    expect(loadSavedViews(storage)).toEqual([])
    storage.setItem(SAVED_VIEWS_KEY, JSON.stringify([{ id: 'x', name: 'قديم', filters: { channels: ['whatsapp', 'sms'], states: 'unread', date: { preset: 'year' } } }]))
    const [view] = loadSavedViews(storage)
    expect(view!.filters.channels).toEqual(['whatsapp'])
    expect(view!.filters.states).toEqual([])
    expect(view!.filters.date.preset).toBeNull()
    expect(loadSavedViews(null)).toEqual([])
  })

  it('sanitizes custom date ranges', () => {
    expect(sanitizeFilters({ date: { preset: 'custom', from: '2026-09-20', to: 'tomorrow' } }).date).toEqual({ preset: 'custom', from: '2026-09-20', to: null })
  })
})

describe('reply meanings from the 245-thread playbook', () => {
  it('knows BUTTON and NON_TEXT_ACK, with Arabic labels', async () => {
    const { meaningKey, MEANING_LABEL } = await import('./inboxFilters')
    expect(meaningKey('BUTTON')).toBe('BUTTON')
    expect(meaningKey('non_text_ack')).toBe('NON_TEXT_ACK')
    expect(MEANING_LABEL.BUTTON).toBe('ضغط «متوفر وبسعّره»')
    expect(MEANING_LABEL.NON_TEXT_ACK).toBe('تأكيد أو تفاعل')
  })
})
