import { useEffect, useMemo, useState } from 'react'
import {
  inboxThreadSupplierLabel,
  isOutboundInviteSnapshot,
  listConstructionInboxThreads,
  type ConstructionInboxThread,
} from '../../api/constructionClient'
import { threadSnippet } from '../../lib/inboxChat'
import type { Nav } from '../MobileApp'
import { Avatar, Chips, Empty, ErrorNote, Screen, Skeleton, ago } from '../ui'

type Tab = 'needs_reply' | 'inbox' | 'sent'

export default function InboxScreen({ nav }: { nav: Nav }) {
  const [tab, setTab] = useState<Tab>('needs_reply')
  const [threads, setThreads] = useState<ConstructionInboxThread[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    listConstructionInboxThreads({ filter: tab === 'needs_reply' ? 'needs_reply' : 'all' })
      .then((r) => {
        if (!alive) return
        setThreads(r.threads || [])
        setCursor(r.next_cursor || null)
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'تعذّر تحميل المراسلات.'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [tab, tick])

  async function loadMore() {
    if (!cursor || more) return
    setMore(true)
    try {
      const r = await listConstructionInboxThreads({ filter: tab === 'needs_reply' ? 'needs_reply' : 'all', cursor })
      setThreads((t) => [...t, ...(r.threads || [])])
      setCursor(r.next_cursor || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر تحميل المزيد.')
    } finally {
      setMore(false)
    }
  }

  const visible = useMemo(() => {
    const q = query.trim()
    return threads.filter((t) => {
      const outbound = isOutboundInviteSnapshot(t)
      if (tab === 'inbox' && outbound) return false
      if (tab === 'sent' && !outbound) return false
      return !q || inboxThreadSupplierLabel(t).includes(q) || threadSnippet(t).includes(q)
    })
  }, [threads, tab, query])

  return (
    <Screen title="المراسلات">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ابحث باسم المورد أو نص الرسالة"
        className="w-full h-11 rounded-xl bg-black/[0.05] px-4 mb-3 outline-none placeholder:text-neutral-400"
      />
      <Chips<Tab>
        options={[
          ['needs_reply', 'تحتاج ردًا'],
          ['inbox', 'الوارد'],
          ['sent', 'الدعوات المرسلة'],
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="mt-4">
        {error && <ErrorNote message={error} onRetry={() => setTick((n) => n + 1)} />}
        {loading ? (
          <Skeleton rows={6} height={76} />
        ) : visible.length === 0 ? (
          <Empty
            title={tab === 'needs_reply' ? 'لا شيء ينتظر ردّك' : 'لا محادثات'}
            body={tab === 'needs_reply' ? 'كل رسائل الموردين تم الرد عليها.' : query ? 'لا نتيجة تطابق البحث.' : undefined}
          />
        ) : (
          <div className="bg-white rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(13,31,29,0.06)]">
            {visible.map((t, i) => {
              const name = inboxThreadSupplierLabel(t)
              const unread = Number(t.unread_count || 0)
              return (
                <button
                  key={`${t.invite_id}-${i}`}
                  onClick={() => t.invite_id && nav.push({ kind: 'thread', inviteId: String(t.invite_id) })}
                  className="w-full flex items-center gap-3 px-4 py-3 text-right active:bg-neutral-100 transition-colors"
                >
                  <Avatar name={name} size={46} />
                  <div className="flex-1 min-w-0 border-b border-neutral-100 pb-3 -mb-3 pt-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-[15px] ${unread ? 'font-black' : 'font-bold'}`}>{name}</span>
                      <span className={`shrink-0 text-[12px] ${unread ? 'text-[#1a7a45] font-bold' : 'text-neutral-400'}`}>{ago(t.last_received_at)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span dir="auto" className={`flex-1 truncate text-[14px] text-start ${unread ? 'text-[#0D1F1D] font-semibold' : 'text-neutral-500'}`}>
                        {threadSnippet(t) || 'بدون نص'}
                      </span>
                      {unread > 0 ? (
                        <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[#1a7a45] text-white text-[11px] font-bold flex items-center justify-center">{unread}</span>
                      ) : t.needs_reply ? (
                        <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-[#D9480F]" aria-label="تحتاج ردًا" />
                      ) : null}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
        {!loading && cursor && (
          <button onClick={loadMore} disabled={more} className="w-full mt-3 h-11 rounded-xl text-[14px] font-bold text-[#123F3A] disabled:opacity-50">
            {more ? 'جارٍ التحميل…' : 'تحميل محادثات أقدم'}
          </button>
        )}
      </div>
    </Screen>
  )
}
