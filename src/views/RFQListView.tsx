import { useEffect, useState } from 'react'
import type { NavProps } from '../types'
import { SearchIcon, PlusIcon } from '../icons'
import { fetchTaseerNeeds } from '../api/taseerClient'
import { useProcurement } from '../procurementContext'

type TaseerNeed = Awaited<ReturnType<typeof fetchTaseerNeeds>>[number]

export function RFQListView({ navigate }: NavProps) {
  const [needs, setNeeds] = useState<TaseerNeed[]>([])
  const [search, setSearch] = useState('')
  const { openTaseerNeed } = useProcurement()

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

  const q = search.trim()
  const filtered = needs.filter((row) => !q || row.need.includes(q))

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black text-[#0D1F1D]">الطلبات</h1>
          <p className="text-neutral-500 text-sm mt-1">{needs.length} احتياجات</p>
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
          placeholder="ابحث بالاحتياج…"
          className="w-full border border-neutral-200 rounded-xl pr-10 pl-4 py-2.5 text-sm outline-none focus:border-[#123F3A] bg-white"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-neutral-500 font-semibold mb-2">لا توجد طلبات بعد</div>
          <p className="text-sm text-neutral-400 mb-4">اكتب احتياجك وندور لك</p>
          <button
            onClick={() => navigate('create-upload')}
            className="mt-2 px-5 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm"
          >
            ابدأ طلب جديد
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => (
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
      )}
    </div>
  )
}
