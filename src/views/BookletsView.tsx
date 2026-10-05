import { useEffect, useState } from 'react'
import type { NavProps } from '../types'
import { ClockIcon } from '../icons'
import { listConstructionBooklets, type ConstructionBookletSummary } from '../api/constructionClient'
import { useProcurement } from '../procurementContext'
import { bookletClosed, bookletDeadline, bookletStateLabel, coverage, waveCount } from '../lib/booklet'

/**
 * Every booklet (الكراسة) of the company: one purchase request / BOQ document
 * sent as several RFQs («دفعات»). Opening one shows a single comparison across
 * all its waves. The requests list is untouched by this screen.
 */
export function BookletsView({ navigate }: NavProps) {
  const { openBooklet } = useProcurement()
  const [booklets, setBooklets] = useState<ConstructionBookletSummary[]>([])
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState('loading')
    setError(null)
    listConstructionBooklets()
      .then((result) => {
        if (cancelled) return
        setBooklets(result.booklets)
        setState('ok')
      })
      .catch((err) => {
        if (cancelled) return
        setBooklets([])
        setError(err instanceof Error ? err.message : 'تعذّر تحميل الكراسات')
        setState('error')
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-3xl font-black text-[#0D1F1D]">الكراسات</h1>
          <p className="text-neutral-500 text-sm mt-1">
            {state === 'ok' ? `${booklets.length} كراسة · كل دفعات الكراسة في مقارنة واحدة` : 'كل دفعات الكراسة في مقارنة واحدة'}
          </p>
        </div>
        <button
          onClick={() => navigate('rfq-list')}
          className="px-4 py-2 border border-neutral-200 text-[#123F3A] font-bold rounded-xl text-sm hover:bg-neutral-50 whitespace-nowrap"
        >
          الطلبات
        </button>
      </div>

      {state === 'loading' && <div className="text-center py-20 text-sm text-neutral-500">جارٍ تحميل الكراسات…</div>}

      {state === 'error' && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error} — هذا فشل في القراءة، وليس دليلًا على عدم وجود كراسات.
          <button onClick={() => setAttempt((n) => n + 1)} className="ms-2 font-bold underline">
            أعد المحاولة
          </button>
        </div>
      )}

      {state === 'ok' && booklets.length === 0 && (
        <div className="text-center py-20 bg-white border border-neutral-100 rounded-2xl">
          <div className="font-semibold text-[#0D1F1D] mb-1">لا توجد كراسات بعد</div>
          <p className="text-sm text-neutral-500">حين تُرسل الكراسة نفسها على أكثر من دفعة، تظهر هنا بمقارنة واحدة لكل الدفعات.</p>
        </div>
      )}

      {state === 'ok' && booklets.length > 0 && (
        <div className="space-y-3">
          {booklets.map((b) => {
            const cov = coverage(b.lines_with_quotes, b.lines_total)
            const waves = waveCount(b.waves)
            const deadline = bookletDeadline(b.quote_deadline)
            return (
              <button
                key={b.id}
                onClick={() => openBooklet(b.id)}
                className="w-full text-right bg-white border border-neutral-100 rounded-2xl px-4 py-4 hover:border-neutral-200 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {b.reference && (
                      <div dir="ltr" className="font-mono text-xs text-neutral-400 text-right">
                        {b.reference}
                      </div>
                    )}
                    <div className="font-bold text-[#0D1F1D] truncate">{b.title || b.reference || 'كراسة'}</div>
                  </div>
                  <span className="shrink-0 flex items-center gap-1">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-bold ${bookletClosed(b) ? 'bg-neutral-100 text-neutral-600' : 'bg-[#e8f5ee] text-[#1a7a45]'}`}
                    >
                      {bookletStateLabel(b)}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#f0faf7] text-[#123F3A]">
                      {waves} {waves === 1 ? 'دفعة' : 'دفعات'}
                    </span>
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <Stat value={cov.label} label="بنود مغطاة" />
                  <Stat value={String(b.unique_suppliers_invited ?? 0)} label="موردون فريدون" />
                  <Stat value={String(b.quotes_count ?? 0)} label="عروض" strong={(b.quotes_count ?? 0) > 0} />
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                  <div className="h-full rounded-full bg-[#1a7a45]" style={{ width: `${cov.percent}%` }} />
                </div>
                {deadline && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-neutral-500">
                    <ClockIcon className="w-3.5 h-3.5" /> الموعد المطلوب للعروض: {deadline.label}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Stat({ value, label, strong }: { value: string; label: string; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-neutral-50 px-2 py-2">
      <div className={`text-base font-black tabular-nums ${strong ? 'text-[#1a7a45]' : 'text-[#0D1F1D]'}`}>{value}</div>
      <div className="text-[11px] text-neutral-500">{label}</div>
    </div>
  )
}

export default BookletsView
