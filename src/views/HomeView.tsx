import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { setPendingUpload } from '../lib/pendingUpload'
import type { NavProps, RFQSummary } from '../types'
import { UploadIcon, ArrowRightIcon, InboxIcon, FileIcon } from '../icons'
import { getSession, subscribeSession } from '../store/session'
import { listBuyerRfqs, listConstructionInboxMessages } from '../api/constructionClient'
import { useProcurement } from '../procurementContext'
import { useFarqSession } from '../api/useFarqSession'
import { toRfqSummary } from '../lib/rfqIdentity'
import { RfqCard } from '../components/RfqCard'

function useLocalRfqs() {
  return useSyncExternalStore(
    subscribeSession,
    () => getSession().rfqs,
    () => getSession().rfqs,
  )
}

function greeting(): string {
  const hour = new Date().getHours()
  return hour < 12 ? 'صباح الخير' : 'مساء الخير'
}

/** One thing waiting for the buyer, with the action that deals with it. */
function AttentionCard({
  count,
  title,
  hint,
  tone,
  onClick,
}: {
  count: number | null
  title: string
  hint: string
  tone: 'green' | 'blue' | 'red'
  onClick: () => void
}) {
  const active = (count ?? 0) > 0
  const colours = {
    green: active ? 'bg-[#f0faf7] border-[#123F3A]/20' : 'bg-white border-neutral-100',
    blue: active ? 'bg-[#eef4fb] border-[#2F6CB5]/20' : 'bg-white border-neutral-100',
    red: active ? 'bg-red-50 border-red-200' : 'bg-white border-neutral-100',
  }[tone]
  const number = { green: 'text-[#123F3A]', blue: 'text-[#2F6CB5]', red: 'text-red-600' }[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 min-w-[150px] rounded-2xl border px-4 py-4 text-right transition-all hover:shadow-sm ${colours}`}
    >
      <div className={`text-3xl font-black tabular-nums ${active ? number : 'text-neutral-300'}`}>{count ?? '—'}</div>
      <div className="mt-1 text-sm font-bold text-[#0D1F1D]">{title}</div>
      <div className="text-xs text-neutral-500 mt-0.5">{active ? hint : 'لا جديد'}</div>
    </button>
  )
}

export function HomeView({ navigate }: NavProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const localRfqs = useLocalRfqs()
  const [apiRfqs, setApiRfqs] = useState<RFQSummary[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [unread, setUnread] = useState<number | null>(null)
  const { openRfq } = useProcurement()
  const session = useFarqSession()
  const name = session.user?.displayName?.trim() || ''

  useEffect(() => {
    let cancelled = false
    listBuyerRfqs()
      .then((overview) => {
        if (cancelled) return
        setLoadState('ok')
        setApiRfqs((overview.rfqs || []).map(toRfqSummary))
      })
      .catch(() => {
        if (!cancelled) {
          setApiRfqs([])
          setLoadState('error')
        }
      })
    listConstructionInboxMessages()
      .then((page) => {
        if (!cancelled) setUnread(page.unread_count ?? 0)
      })
      .catch(() => {
        if (!cancelled) setUnread(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const seen = new Set<string>()
  const rfqs: RFQSummary[] = []
  for (const r of [...localRfqs, ...apiRfqs]) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    rfqs.push(r)
  }
  const active = rfqs.filter((r) => r.status === 'active' || r.status === 'draft')
  const offersTotal = rfqs.filter((r) => r.status === 'active').reduce((sum, r) => sum + (r.offers || 0), 0)
  const withOffers = rfqs.find((r) => r.status === 'active' && r.offers > 0)
  const closingSoon = rfqs.filter((r) => r.status === 'active' && r.closesUrgent)

  const openCard = (rfq: RFQSummary) =>
    rfq.status === 'draft' && rfq.id.startsWith('RFQ-')
      ? navigate('create-proposals')
      : openRfq(rfq.id, rfq.status === 'closed' ? 'rfq-closed' : 'rfq-detail')

  const pickFile = () => inputRef.current?.click()

  return (
    <div
      className="max-w-4xl mx-auto px-4 lg:px-8 py-8"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        setPendingUpload(e.dataTransfer.files?.[0])
        navigate('create-upload')
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          setPendingUpload(e.target.files?.[0])
          navigate('create-upload')
        }}
      />

      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-[#0D1F1D]">
            {greeting()}
            {name ? `، ${name}` : ''}
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            {rfqs.length ? 'هذا ما يحتاج انتباهك اليوم.' : 'ارفع كراسة وسنقرأ البنود ونقترح لكل بند موردين مناسبين.'}
          </p>
        </div>
        <button
          type="button"
          onClick={pickFile}
          className="flex items-center gap-2 px-5 py-3 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm shadow-sm"
        >
          <UploadIcon className="w-4 h-4" />
          طلب تسعير جديد
        </button>
      </div>

      {dragging && (
        <div className="mb-6 rounded-2xl border-2 border-dashed border-[#123F3A] bg-[#f0faf7] py-10 text-center text-sm font-bold text-[#123F3A]">
          أفلت الكراسة هنا لنبدأ القراءة
        </div>
      )}

      {rfqs.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-8">
          <AttentionCard
            count={unread}
            title="ردود جديدة من الموردين"
            hint="افتح المراسلات للرد"
            tone="blue"
            onClick={() => navigate('inbox')}
          />
          <AttentionCard
            count={offersTotal}
            title="عروض أسعار مستلمة"
            hint="راجعها وقارن بينها"
            tone="green"
            onClick={() => (withOffers ? openRfq(withOffers.id, 'offers') : navigate('rfq-list'))}
          />
          <AttentionCard
            count={closingSoon.length}
            title="طلبات تغلق قريبًا"
            hint="خلال يومين — تابع الموردين"
            tone="red"
            onClick={() => (closingSoon[0] ? openRfq(closingSoon[0].id, 'rfq-detail') : navigate('rfq-list'))}
          />
        </div>
      )}

      {loadState !== 'ok' && !rfqs.length ? (
        <div className="text-center py-16 text-sm text-neutral-500">
          {loadState === 'loading' ? 'جارٍ تحميل الطلبات…' : 'تعذّر تحميل الطلبات. تحقق من الاتصال ثم أعد تحميل الصفحة.'}
        </div>
      ) : rfqs.length === 0 ? (
        <button
          type="button"
          onClick={pickFile}
          className="w-full rounded-2xl border-2 border-dashed border-neutral-200 bg-white hover:border-[#123F3A]/40 hover:bg-[#f0faf7]/50 transition-all py-16 px-8 flex flex-col items-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-[#CFF5DC] flex items-center justify-center mb-5">
            <UploadIcon className="w-8 h-8 text-[#123F3A]" />
          </div>
          <div className="text-xl font-bold text-[#0D1F1D] mb-2">ارفع أول كراسة</div>
          <p className="text-neutral-500 text-sm text-center max-w-sm">
            ملف PDF لجدول الكميات. نقرأ البنود خلال دقائق، ونختار لكل بند خمسة موردين، وترسل لهم بضغطة.
          </p>
        </button>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-[#0D1F1D] flex items-center gap-2">
              <FileIcon className="w-4 h-4 text-[#123F3A]" />
              الطلبات الجارية
              <span className="text-xs font-semibold text-neutral-400">({active.length})</span>
            </h2>
            <button
              onClick={() => navigate('rfq-list')}
              className="text-sm text-[#123F3A] font-semibold hover:underline flex items-center gap-1"
            >
              كل الطلبات <ArrowRightIcon className="w-3.5 h-3.5 rotate-180" />
            </button>
          </div>
          {active.length === 0 ? (
            <div className="rounded-2xl border border-neutral-100 bg-white py-10 text-center text-sm text-neutral-500">
              لا طلبات جارية. كل طلباتك مغلقة أو تمت ترسيتها.
              <button onClick={() => navigate('inbox')} className="mt-3 flex items-center gap-1 mx-auto text-[#123F3A] font-semibold">
                <InboxIcon className="w-4 h-4" /> المراسلات
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {active.slice(0, 8).map((rfq) => (
                <RfqCard key={rfq.id} rfq={rfq} onOpen={() => openCard(rfq)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default HomeView
