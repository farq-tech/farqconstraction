import { useMemo, useState } from 'react'
import { deleteDraft, listDrafts } from '../purchaseRequests'
import { formatRfqTitle, listBuyerRfqs, mapRfqUiStatus, type ConstructionRfqSummary } from '../../api/constructionClient'
import { requestCreatorLabel } from '../../lib/rfqIdentity'
import type { Nav } from '../MobileApp'
import { Card, Chips, Empty, ErrorNote, Pill, Screen, Skeleton, ago, sar, useLoad } from '../ui'

type Tone = 'neutral' | 'brand' | 'good' | 'warn' | 'bad'

/** One Arabic word for where a request stands, from its own fields. */
export function requestState(r: Pick<ConstructionRfqSummary, 'status' | 'award_id' | 'response_count' | 'supplier_count'>): { label: string; tone: Tone } {
  const ui = mapRfqUiStatus(r.status, r.award_id)
  if (ui === 'awarded') return { label: 'تمت الترسية', tone: 'good' }
  if (ui === 'closed') return { label: String(r.status).toUpperCase() === 'CANCELLED' ? 'ملغى' : 'مغلق', tone: 'neutral' }
  if (ui === 'draft') return { label: 'مسودة', tone: 'warn' }
  if (String(r.status).toUpperCase() === 'DISPATCHING') return { label: 'جارٍ الإرسال', tone: 'brand' }
  if (r.response_count > 0) return { label: 'وصلت عروض', tone: 'good' }
  return { label: 'بانتظار العروض', tone: 'brand' }
}

type Filter = 'all' | 'active' | 'awarded' | 'closed'

export default function RequestsScreen({ nav }: { nav: Nav }) {
  const { data, error, loading, reload } = useLoad(() => listBuyerRfqs(), [])
  const [filter, setFilter] = useState<Filter>('active')
  const [query, setQuery] = useState('')
  const [drafts, setDrafts] = useState(() => listDrafts())

  const rows = useMemo(() => {
    const all = data?.rfqs || []
    const q = query.trim()
    return all.filter((r) => {
      const ui = mapRfqUiStatus(r.status, r.award_id)
      if (filter === 'active' && !(ui === 'active' || ui === 'draft')) return false
      if (filter === 'awarded' && ui !== 'awarded') return false
      if (filter === 'closed' && ui !== 'closed') return false
      return !q || formatRfqTitle(r).includes(q) || r.id.toLowerCase().includes(q.toLowerCase())
    })
  }, [data, filter, query])

  return (
    <Screen
      title="الطلبات"
      subtitle={data ? `${data.rfqs.length} طلب تسعير` : undefined}
      action={
        <button onClick={() => nav.push({ kind: 'new' })} className="h-9 px-3 rounded-full bg-[#123F3A] text-white text-[14px] font-bold">
          + جديد
        </button>
      }
    >
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ابحث باسم المشروع أو الموقع"
        className="w-full h-11 rounded-xl bg-black/[0.05] px-4 mb-3 outline-none placeholder:text-neutral-400"
      />
      {drafts.length > 0 && (
        <div className="mb-4">
          <div className="text-[13px] font-bold text-neutral-500 mb-2 px-1">مسودات على هذا الجوال ({drafts.length})</div>
          <div className="space-y-2">
            {drafts.map((d) => (
              <Card key={d.id} className="p-0 overflow-hidden">
                <div className="flex items-stretch">
                  <button onClick={() => nav.push({ kind: 'new', draftId: d.id })} className="flex-1 min-w-0 text-right p-4 active:bg-neutral-50">
                    <div className="flex items-center gap-2">
                      <Pill tone="warn">مسودة</Pill>
                      <span className="font-bold text-[15px] truncate">{d.project || 'طلب بلا اسم'}</span>
                    </div>
                    <div className="text-[12px] text-neutral-500 mt-1">
                      {d.lines.length} بند{d.reference ? <> · <bdi dir="ltr">{d.reference}</bdi></> : null} · {ago(d.updated_at)}
                    </div>
                  </button>
                  <button
                    onClick={() => { deleteDraft(d.id); setDrafts(listDrafts()) }}
                    className="px-4 text-[13px] font-semibold text-red-600 border-r border-neutral-100"
                  >
                    حذف
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
      <Chips<Filter>
        options={[
          ['active', 'النشطة'],
          ['awarded', 'المُرسّاة'],
          ['closed', 'المغلقة'],
          ['all', 'الكل'],
        ]}
        value={filter}
        onChange={setFilter}
      />
      <div className="mt-4">
        {error && <ErrorNote message={error} onRetry={reload} />}
        {loading && !data ? (
          <Skeleton rows={5} height={112} />
        ) : rows.length === 0 ? (
          <Empty title="لا طلبات هنا" body={query ? 'لا طلب يطابق البحث.' : 'لا توجد طلبات في هذا التصنيف.'} />
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const st = requestState(r)
              const progress = r.supplier_count ? Math.round((r.response_count / r.supplier_count) * 100) : 0
              return (
                <Card key={r.id} onClick={() => nav.push({ kind: 'request', id: r.id })} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-[16px] leading-snug line-clamp-2">{formatRfqTitle(r)}</div>
                      <div className="text-[12px] text-neutral-400 mt-1">
                        {r.line_count} بند · {ago(r.created_at)}
                        <div>منشئ الطلب: {requestCreatorLabel(r.creator)}</div>
                      </div>
                    </div>
                    <Pill tone={st.tone}>{st.label}</Pill>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-neutral-100 overflow-hidden">
                      <div className="h-full rounded-full bg-[#1a7a45]" style={{ width: `${Math.min(100, progress)}%` }} />
                    </div>
                    <span className="text-[12px] text-neutral-500 tabular-nums">
                      {r.response_count} من {r.supplier_count} ردّوا
                    </span>
                  </div>
                  {r.received_base_quote_total ? (
                    <div className="mt-2 text-[13px] text-neutral-500">
                      قيمة العروض: <b className="text-[#0D1F1D]">{sar(r.received_base_quote_total)}</b>
                    </div>
                  ) : null}
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </Screen>
  )
}
