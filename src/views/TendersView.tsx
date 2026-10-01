import { useEffect, useState } from 'react'
import type { NavProps } from '../types'
import {
  formatArDate,
  formatSar,
  listContractingTenders,
  type ContractingTender,
  type ContractingTenderSort,
} from '../api/constructionClient'

const PAGE_SIZE = 20
const DAY_MS = 24 * 60 * 60 * 1000

/** «باقي ٣ أيام» from the submission deadline; null when unknown or past. */
function daysLeft(deadline: string | null, now = Date.now()): number | null {
  if (!deadline) return null
  const ts = Date.parse(deadline)
  if (Number.isNaN(ts) || ts < now) return null
  return Math.ceil((ts - now) / DAY_MS)
}

function DaysLeft({ deadline }: { deadline: string | null }) {
  const days = daysLeft(deadline)
  if (days == null) return null
  const urgent = days <= 3
  const label = days <= 1 ? 'آخر يوم' : days === 2 ? 'باقي يومان' : days <= 10 ? `باقي ${days} أيام` : `باقي ${days} يوماً`
  return (
    <span
      className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full ${
        urgent ? 'bg-red-50 text-red-700' : 'bg-[#123F3A]/5 text-[#123F3A]'
      }`}
    >
      {label}
    </span>
  )
}

function TenderCard({ tender }: { tender: ContractingTender }) {
  const price = tender.booklet_price == null ? null : tender.booklet_price === 0 ? 'مجاناً' : formatSar(tender.booklet_price)
  return (
    <div className="px-4 py-4 border-t border-neutral-100 first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <div className="font-extrabold text-sm leading-6 text-[#0D1F1D]">{tender.title || 'منافسة بدون عنوان'}</div>
        <DaysLeft deadline={tender.submission_deadline} />
      </div>
      <div className="mt-1 text-xs font-semibold text-neutral-600">
        {tender.agency || '—'}
        {tender.agency_branch ? ` · ${tender.agency_branch}` : ''}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
        <span>
          <span className="font-semibold text-neutral-400">آخر موعد للعروض </span>
          {formatArDate(tender.submission_deadline)}
        </span>
        {price && (
          <span>
            <span className="font-semibold text-neutral-400">قيمة الكراسة </span>
            {price}
          </span>
        )}
        {tender.reference_number && (
          <span>
            <span className="font-semibold text-neutral-400">الرقم المرجعي </span>
            <span className="tabular-nums">{tender.reference_number}</span>
          </span>
        )}
      </div>
      {tender.source_url && (
        <a
          href={tender.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-3 text-xs font-extrabold text-[#123F3A] hover:underline"
        >
          التفاصيل في اعتماد ←
        </a>
      )}
    </div>
  )
}

/** Public Etimad tenders that fit contracting companies, searchable, newest or closing-soon first. */
export function TendersView(_props: NavProps) {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<ContractingTenderSort>('closing')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<ContractingTender[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Typing settles for a moment before the search runs.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 400)
    return () => clearTimeout(timer)
  }, [input])

  useEffect(() => {
    setPage(1)
  }, [query, sort])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    listContractingTenders({ q: query, sort, page, pageSize: PAGE_SIZE }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        setTotal(result.total)
        setItems((prev) => (page === 1 ? result.items : [...prev, ...result.items]))
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setError('تعذّر جلب المنافسات الآن. حاول بعد قليل.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [query, sort, page])

  const hasMore = total != null && items.length < total

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">
      <h1 className="text-2xl lg:text-3xl font-black text-[#0D1F1D]">منافسات المقاولات</h1>
      <p className="text-sm text-neutral-500 mt-1">
        {total == null ? 'نجلب المنافسات…' : `${total.toLocaleString('en-US')} منافسة من منصة اعتماد`}
      </p>

      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <input
          type="search"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="ابحث بالعنوان أو الجهة أو الرقم المرجعي"
          className="flex-1 bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#123F3A]"
        />
        <div className="flex bg-white border border-neutral-200 rounded-xl p-1 text-xs font-extrabold">
          {(
            [
              ['closing', 'تُغلق قريباً'],
              ['latest', 'الأحدث'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                sort === key ? 'bg-[#123F3A] text-white' : 'text-neutral-500 hover:text-[#123F3A]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mt-5 text-sm font-semibold text-red-700">{error}</div>}

      {items.length > 0 && (
        <div className="mt-5 bg-white border border-neutral-100 rounded-2xl overflow-hidden">
          {items.map((tender) => (
            <TenderCard key={tender.id} tender={tender} />
          ))}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="mt-8 text-sm text-neutral-500 text-center">لا توجد منافسات تطابق بحثك.</div>
      )}

      {loading && <div className="mt-5 text-sm text-neutral-400 text-center">جارٍ التحميل…</div>}

      {hasMore && !loading && (
        <div className="mt-5 text-center">
          <button
            onClick={() => setPage((p) => p + 1)}
            className="px-4 py-2 border border-neutral-200 text-[#123F3A] font-bold rounded-xl text-sm bg-white"
          >
            المزيد
          </button>
        </div>
      )}

      <p className="mt-5 text-xs leading-6 text-neutral-500">
        منافسات عامة منشورة على منصة اعتماد خلال آخر ٩٠ يوماً، مصنّفة كمقاولات (إنشاء، ترميم، طرق، أعمال مدنية…). التقديم يتم من منصة اعتماد نفسها.
      </p>
    </div>
  )
}

export default TendersView
