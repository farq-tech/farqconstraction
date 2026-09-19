import { useMemo, useState, type ReactNode } from 'react'
import {
  inboxThreadSupplierLabel,
  type ConstructionInboxThread,
} from '../../api/constructionClient'
import { filterThreads, listTimeLabel, sortThreadsNewestFirst, threadSnippet } from '../../lib/inboxChat'
import { SupplierAvatar } from './SupplierAvatar'

export type InboxTab = 'inbound' | 'needs_reply' | 'sent'

/** Stable identity of a row: the invitation id when there is one. */
export function threadRowKey(thread: ConstructionInboxThread): string {
  return String(thread.invite_id || `${thread.supplier_id}-${thread.last_received_at}`)
}

function ListSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <div key={row} className="flex items-center gap-3 px-4 py-3">
          <div className="w-12 h-12 rounded-full bg-neutral-100 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/5 rounded bg-neutral-100" />
            <div className="h-2.5 w-4/5 rounded bg-neutral-100" />
          </div>
        </div>
      ))}
    </div>
  )
}

export type ConversationListProps = {
  /** Rows of the current tab, exactly as the API returned them. */
  threads: ConstructionInboxThread[]
  loading: boolean
  error: string | null
  /** Seconds left on the API limiter, when the failure was a rate limit. */
  rateLimitSec: number | null
  onRetry: () => void
  tab: InboxTab
  onTabChange: (tab: InboxTab) => void
  /** Server counters (`follow_up_counts`), shown only when the server sent them. */
  needsReplyCount: number | null
  sentCount: number | null
  /** Server-derived total for the tab; null while unknown. */
  total: number | null
  /** The server has another page this screen does not load. */
  hasMore: boolean
  activeKey: string | null
  onSelect: (thread: ConstructionInboxThread) => void
  /** Header actions (mailbox status, offers link). */
  actions: ReactNode
  /** Optional strip under the header, e.g. a mailbox warning. */
  alert?: ReactNode
  /** What to say when the tab is truly empty — the view knows why. */
  emptyState: ReactNode
  /** Extra line under the tabs (the «مرسَل» explanation). */
  tabNote?: ReactNode
  /** Mark whole conversations read or unread (listed invites, or 'all'). */
  onMarkThreads?: (target: string[] | 'all', read: boolean) => Promise<void>
}

export function ConversationList({
  threads,
  loading,
  error,
  rateLimitSec,
  onRetry,
  tab,
  onTabChange,
  needsReplyCount,
  sentCount,
  total,
  hasMore,
  activeKey,
  onSelect,
  actions,
  alert,
  emptyState,
  tabNote,
  onMarkThreads,
}: ConversationListProps) {
  const [query, setQuery] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [marking, setMarking] = useState(false)
  const [markNote, setMarkNote] = useState<string | null>(null)
  const mark = async (target: string[] | 'all', read: boolean) => {
    if (!onMarkThreads) return
    setMarking(true)
    setMarkNote(null)
    try {
      await onMarkThreads(target, read)
      setMarkNote(target === 'all' ? (read ? 'عُلّمت كل المحادثات كمقروءة.' : 'عُلّمت كل المحادثات كغير مقروءة.') : `عُلّمت ${target.length} محادثة ${read ? 'كمقروءة' : 'كغير مقروءة'}.`)
      setPicked(new Set())
      setSelecting(false)
    } catch (err) {
      setMarkNote(err instanceof Error ? err.message : 'تعذّر التعليم.')
    } finally {
      setMarking(false)
    }
  }
  const now = Date.now()

  const sorted = useMemo(() => sortThreadsNewestFirst(threads), [threads])
  const visible = useMemo(() => filterThreads(sorted, query), [sorted, query])
  const searching = query.trim().length > 0

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <div className="flex-shrink-0 px-4 pt-4 pb-2">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h1 className="text-2xl font-black text-[#0D1F1D]">المراسلات</h1>
          <div className="flex items-center gap-1.5">{actions}</div>
        </div>

        <label className="relative block">
          <span className="sr-only">بحث في المحادثات</span>
          <svg viewBox="0 0 20 20" className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-neutral-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="9" cy="9" r="5.5" />
            <path d="M13.5 13.5L17 17" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث باسم المورد أو نص الرسالة"
            className="w-full rounded-full bg-neutral-100 border border-transparent ps-9 pe-4 py-2 text-[13px] text-[#0D1F1D] placeholder:text-neutral-400 focus:bg-white focus:border-[#123F3A]/40 focus:outline-none"
          />
        </label>

        <div className="flex items-center gap-1.5 mt-3 overflow-x-auto">
          {(
            [
              ['inbound', 'وارد', null],
              ['needs_reply', 'تحتاج ردًا', needsReplyCount],
              ['sent', 'مرسَل', sentCount],
            ] as [InboxTab, string, number | null][]
          ).map(([id, label, badge]) => (
            <button
              key={id}
              type="button"
              aria-pressed={tab === id}
              onClick={() => onTabChange(id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors inline-flex items-center gap-1.5 ${
                tab === id ? 'bg-[#123F3A] text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {label}
              {badge != null && badge > 0 && (
                <span
                  className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none ${
                    tab === id ? 'bg-white/20 text-white' : 'bg-white text-neutral-600'
                  }`}
                >
                  {badge}
                </span>
              )}
            </button>
          ))}
          {!loading && !error && (
            <span className="text-[11px] text-neutral-400 ms-auto flex-shrink-0 ps-2">
              {searching
                ? `${visible.length} نتيجة من ${threads.length} معروضة`
                : total != null
                  ? tab === 'sent'
                    ? `${total} دعوة مرسلة`
                    : `${total} محادثة`
                  : ''}
            </span>
          )}
        </div>
        {tabNote}
        {onMarkThreads && threads.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px]">
            {!selecting ? (
              <>
                <button type="button" onClick={() => setSelecting(true)} className="font-bold text-[#123F3A] hover:underline">تحديد محادثات</button>
                <span className="text-neutral-300">·</span>
                <button type="button" disabled={marking} onClick={() => void mark('all', true)} className="font-bold text-[#123F3A] hover:underline disabled:opacity-40">الكل مقروء</button>
              </>
            ) : (
              <>
                <span className="font-bold text-[#0D1F1D]">{picked.size} محددة</span>
                <button type="button" onClick={() => setPicked(new Set(visible.map((t) => String(t.invite_id))))} className="font-semibold text-[#123F3A] hover:underline">تحديد الكل</button>
                <span className="flex-1" />
                <button type="button" disabled={!picked.size || marking} onClick={() => void mark([...picked], true)} className="px-2.5 py-1 rounded-lg bg-white border border-neutral-200 font-bold text-[#123F3A] disabled:opacity-40">مقروءة</button>
                <button type="button" disabled={!picked.size || marking} onClick={() => void mark([...picked], false)} className="px-2.5 py-1 rounded-lg bg-[#123F3A] text-white font-bold disabled:opacity-40">غير مقروءة</button>
                <button type="button" onClick={() => { setSelecting(false); setPicked(new Set()) }} className="text-neutral-500 hover:underline">إلغاء</button>
              </>
            )}
          </div>
        )}
        {markNote && <p className="mt-1 text-[11px] text-[#123F3A]">{markNote}</p>}
      </div>

      {alert && <div className="flex-shrink-0 px-4 pb-2">{alert}</div>}

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain border-t border-neutral-100">
        {loading && <ListSkeleton />}

        {!loading && error && (
          <div role="alert" className="m-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="font-bold text-amber-900 text-sm mb-1">
              {rateLimitSec != null ? 'تجاوزنا حد المحاولات' : 'تعذّر تحميل المحادثات'}
            </div>
            <p className="text-xs text-amber-800 leading-relaxed mb-3 break-words">{error}</p>
            <button
              type="button"
              disabled={rateLimitSec != null}
              onClick={onRetry}
              className="rounded-xl bg-[#123F3A] text-white text-xs font-bold px-4 py-2 disabled:opacity-50"
            >
              {rateLimitSec != null ? `أعد المحاولة بعد ${rateLimitSec} ثانية` : 'إعادة المحاولة'}
            </button>
            {threads.length > 0 && (
              <p className="text-[11px] text-amber-800 mt-3 leading-relaxed">
                القائمة أدناه آخر قراءة ناجحة، وقد لا تكون محدّثة.
              </p>
            )}
          </div>
        )}

        {!loading && !error && threads.length === 0 && <div className="px-5 py-12 text-center">{emptyState}</div>}

        {!loading && threads.length > 0 && visible.length === 0 && (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-neutral-500 mb-1">لا محادثة تطابق «{query.trim()}».</p>
            <p className="text-xs text-neutral-400 leading-relaxed">
              البحث يجري في المحادثات المحمّلة في هذا التبويب فقط.
            </p>
          </div>
        )}

        {!loading && (
          <ul>
            {visible.map((thread) => {
              const key = threadRowKey(thread)
              const name = inboxThreadSupplierLabel(thread)
              const snippet = threadSnippet(thread)
              const unread = Number(thread.unread_count || 0)
              const selected = activeKey != null && key === activeKey
              const time = listTimeLabel(thread.last_received_at, now)
              const reference = thread.request_context?.reference
              return (
                <li key={key}>
                  <button
                    type="button"
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => {
                      if (!selecting) return onSelect(thread)
                      const id = String(thread.invite_id)
                      setPicked((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
                    }}
                    className={`w-full text-start flex items-center gap-3 ps-4 pe-3 py-3 border-b border-neutral-100 border-s-4 transition-colors ${
                      selected
                        ? 'bg-[#E9F8EF] border-s-[#123F3A]'
                        : 'border-s-transparent hover:bg-neutral-50'
                    }`}
                  >
                    {selecting && (
                      <input type="checkbox" readOnly tabIndex={-1} checked={picked.has(String(thread.invite_id))} className="accent-[#123F3A] w-4 h-4 flex-shrink-0" aria-label={`تحديد ${name}`} />
                    )}
                    <SupplierAvatar name={name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`truncate text-sm text-[#0D1F1D] ${unread > 0 ? 'font-black' : 'font-bold'}`}>
                          {name}
                        </span>
                        {time && (
                          <span
                            className={`flex-shrink-0 text-[10px] ${
                              unread > 0 ? 'text-[#1a7a45] font-bold' : 'text-neutral-400'
                            }`}
                          >
                            {time}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span
                          dir="auto"
                          className={`truncate text-xs text-start ${
                            unread > 0 ? 'text-[#0D1F1D] font-semibold' : 'text-neutral-500'
                          }`}
                        >
                          {snippet || 'بدون نص'}
                        </span>
                        {unread > 0 && (
                          <span
                            aria-label={`${unread} غير مقروءة`}
                            className="flex-shrink-0 min-w-5 h-5 rounded-full bg-[#1a7a45] text-white text-[10px] font-bold px-1.5 flex items-center justify-center"
                          >
                            {unread}
                          </span>
                        )}
                      </div>
                      {(reference || thread.needs_reply) && (
                        <div className="flex items-center gap-1.5 mt-1">
                          {reference && (
                            <bdi className="truncate text-[10px] text-neutral-500 bg-neutral-100 rounded-md px-1.5 py-0.5">
                              {reference}
                            </bdi>
                          )}
                          {thread.needs_reply && (
                            <span className="flex-shrink-0 bg-amber-50 text-amber-800 text-[10px] font-bold rounded-full px-1.5 py-0.5">
                              تحتاج ردًا
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {!loading && hasMore && threads.length > 0 && (
          <p className="px-5 py-4 text-[11px] text-neutral-400 leading-relaxed text-center">
            هذه أول صفحة يعيدها الخادم — توجد محادثات أقدم غير محمّلة هنا.
          </p>
        )}
      </div>
    </div>
  )
}

export default ConversationList
