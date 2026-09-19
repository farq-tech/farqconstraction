import { useEffect, useState, useSyncExternalStore } from 'react'
import type { NavProps, RFQSummary } from '../types'
import { SearchIcon, PlusIcon } from '../icons'
import { getSession, subscribeSession } from '../store/session'
import { listBuyerRfqs } from '../api/constructionClient'
import { useProcurement } from '../procurementContext'
import { toRfqSummary } from '../lib/rfqIdentity'
import { RfqCard } from '../components/RfqCard'

type Filter = 'all' | 'draft' | 'active' | 'closed' | 'awarded'

const FILTERS: [Filter, string][] = [
  ['all', 'الكل'],
  ['active', 'بانتظار العروض'],
  ['draft', 'مسودة'],
  ['closed', 'مغلق'],
  ['awarded', 'مُرسَّى'],
]

function useLocalRfqs() {
  return useSyncExternalStore(
    subscribeSession,
    () => getSession().rfqs,
    () => getSession().rfqs,
  )
}

export function RFQListView({ navigate }: NavProps) {
  const localRfqs = useLocalRfqs()
  const [apiRfqs, setApiRfqs] = useState<RFQSummary[]>([])
  // A failed load must not read as «no requests yet».
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const { openRfq } = useProcurement()

  useEffect(() => {
    let cancelled = false
    listBuyerRfqs()
      .then((overview) => {
        if (cancelled) return
        setLoadState('ok')
        setApiRfqs(
          (overview.rfqs || []).map(toRfqSummary),
        )
      })
      .catch(() => {
        if (!cancelled) {
          setApiRfqs([])
          setLoadState('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const seen = new Set<string>()
  const allRfqs: RFQSummary[] = []
  for (const r of [...localRfqs, ...apiRfqs]) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    allRfqs.push(r)
  }

  const filtered = allRfqs.filter((r) => {
    const matchFilter = filter === 'all' || r.status === filter
    const q = search.trim().toUpperCase()
    const matchSearch = !q || r.name.toUpperCase().includes(q) || r.id.toUpperCase().includes(q) || (r.reference || '').includes(q)
    return matchFilter && matchSearch
  })

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black text-[#0D1F1D]">الطلبات</h1>
          <p className="text-neutral-500 text-sm mt-1">{allRfqs.length} طلبات</p>
        </div>
        <button
          onClick={() => navigate('create-upload')}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
        >
          <PlusIcon className="w-4 h-4" />
          طلب جديد
        </button>
      </div>

      <div className="relative mb-4">
        <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم المشروع أو رقم الطلب…"
          className="w-full border border-neutral-200 rounded-xl pr-10 pl-4 py-2.5 text-sm outline-none focus:border-[#123F3A] bg-white"
        />
      </div>

      <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
        {FILTERS.map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
              filter === f
                ? 'bg-[#123F3A] text-white'
                : 'bg-white border border-neutral-200 text-neutral-600 hover:border-neutral-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 && loadState !== 'ok' && !localRfqs.length ? (
        <div className="text-center py-20 text-sm text-neutral-500">
          {loadState === 'loading' ? 'جارٍ تحميل الطلبات…' : 'تعذّر تحميل الطلبات. تحقق من الاتصال ثم أعد تحميل الصفحة.'}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-neutral-500 font-semibold mb-2">لا توجد طلبات تسعير</div>
          <p className="text-sm text-neutral-400 mb-4">ارفع كراسة لإنشاء أول طلب</p>
          <button
            onClick={() => navigate('create-upload')}
            className="mt-2 px-5 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm"
          >
            ابدأ طلب جديد
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((rfq) => (
            <RfqCard
              key={rfq.id}
              rfq={rfq}
              onOpen={() =>
                rfq.status === 'draft' && rfq.id.startsWith('RFQ-')
                  ? navigate('create-proposals')
                  : openRfq(rfq.id, rfq.status === 'closed' ? 'rfq-closed' : 'rfq-detail')
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
