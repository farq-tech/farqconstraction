import { useEffect, useState } from 'react'
import type { NavProps } from '../types'
import { SearchIcon, ArrowRightIcon, FileIcon } from '../icons'
import { fetchTaseerNeeds } from '../api/taseerClient'
import { useFarqSession } from '../api/useFarqSession'
import { useProcurement } from '../procurementContext'

function greeting(): string {
  const hour = new Date().getHours()
  return hour < 12 ? 'صباح الخير' : 'مساء الخير'
}

type TaseerNeed = Awaited<ReturnType<typeof fetchTaseerNeeds>>[number]

export function HomeView({ navigate }: NavProps) {
  const [needs, setNeeds] = useState<TaseerNeed[]>([])
  const session = useFarqSession()
  const { openTaseerNeed } = useProcurement()
  const name = session.user?.displayName?.trim() || ''

  useEffect(() => {
    let cancelled = false
    fetchTaseerNeeds()
      .then((rows) => {
        if (!cancelled) setNeeds(rows)
      })
      .catch(() => {
        if (!cancelled) setNeeds([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const offersTotal = needs.reduce((sum, row) => sum + (row.offers || 0), 0)

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-[#0D1F1D]">
            {greeting()}
            {name ? `، ${name}` : ''}
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            {needs.length ? 'هذا ما يحتاج انتباهك اليوم.' : 'اكتب احتياجك وندور لك.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('create-upload')}
          className="flex items-center gap-2 px-5 py-3 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm shadow-sm"
        >
          <SearchIcon className="w-4 h-4" />
          اكتب احتياجك
        </button>
      </div>

      {needs.length === 0 ? (
        <button
          type="button"
          onClick={() => navigate('create-upload')}
          className="w-full rounded-2xl border-2 border-dashed border-neutral-200 bg-white hover:border-[#123F3A]/40 hover:bg-[#f0faf7]/50 transition-all py-16 px-8 flex flex-col items-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-[#CFF5DC] flex items-center justify-center mb-5">
            <SearchIcon className="w-8 h-8 text-[#123F3A]" />
          </div>
          <div className="text-xl font-bold text-[#0D1F1D] mb-2">اكتب احتياجك</div>
          <p className="text-neutral-500 text-sm text-center max-w-sm">
            سباك و كهربائي ودرابزين زجاج — ندور لك إعلانات لكل احتياج.
          </p>
        </button>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-[#0D1F1D] flex items-center gap-2">
              <FileIcon className="w-4 h-4 text-[#123F3A]" />
              الطلبات الجارية
              <span className="text-xs font-semibold text-neutral-400">({needs.length})</span>
            </h2>
            <button
              onClick={() => navigate('rfq-list')}
              className="text-sm text-[#123F3A] font-semibold hover:underline flex items-center gap-1"
            >
              كل الطلبات <ArrowRightIcon className="w-3.5 h-3.5 rotate-180" />
            </button>
          </div>
          {offersTotal > 0 && (
            <button
              type="button"
              onClick={() => navigate('taseer-sellers')}
              className="mb-3 w-full rounded-2xl border border-[#123F3A]/20 bg-[#f0faf7] px-4 py-3 text-right"
            >
              <div className="text-sm font-bold text-[#123F3A]">{offersTotal} عرض مستلم — افتح البائعون</div>
            </button>
          )}
          <div className="space-y-3">
            {needs.slice(0, 8).map((row) => (
              <button
                key={row.need}
                type="button"
                onClick={() => openTaseerNeed(row.need)}
                className="w-full text-right rounded-2xl border border-neutral-100 bg-white px-4 py-3"
              >
                <div className="text-sm font-bold text-[#0D1F1D]">{row.need}</div>
                <div className="text-xs text-neutral-400 mt-1">
                  {row.conversations} محادثة · {row.offers} عرض
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default HomeView
