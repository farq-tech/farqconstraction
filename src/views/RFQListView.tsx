import { useState } from 'react'
import type { NavProps } from '../types'
import { ALL_RFQS } from '../data'
import { SearchIcon, PlusIcon } from '../icons'

type Filter = 'all' | 'draft' | 'active' | 'closed' | 'awarded'

const FILTERS: [Filter, string][] = [
  ['all', 'الكل'],
  ['active', 'نشط'],
  ['draft', 'مسودة'],
  ['closed', 'مغلق'],
  ['awarded', 'مُرسَّى'],
]

const STATUS_CONF = {
  active:   { label: 'نشط',    cls: 'bg-amber-50 text-amber-700' },
  draft:    { label: 'مسودة',  cls: 'bg-neutral-100 text-neutral-500' },
  closed:   { label: 'مغلق',   cls: 'bg-neutral-200 text-neutral-600' },
  awarded:  { label: 'مُرسَّى', cls: 'bg-[#CFF5DC] text-[#1a7a45]' },
}

export function RFQListView({ navigate }: NavProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const filtered = ALL_RFQS.filter(r => {
    const matchFilter = filter === 'all' || r.status === filter
    const matchSearch = r.name.includes(search) || r.id.includes(search)
    return matchFilter && matchSearch
  })

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black text-[#0D1F1D]">طلبات التسعير</h1>
          <p className="text-neutral-500 text-sm mt-1">{ALL_RFQS.length} طلبات</p>
        </div>
        <button
          onClick={() => navigate('create-upload')}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
        >
          <PlusIcon className="w-4 h-4" />
          طلب جديد
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ابحث باسم المشروع أو رقم الطلب…"
          className="w-full border border-neutral-200 rounded-xl pr-10 pl-4 py-2.5 text-sm outline-none focus:border-[#123F3A] bg-white"
        />
      </div>

      {/* Filter tabs */}
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

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-neutral-300 text-5xl mb-4">📋</div>
          <div className="text-neutral-500 font-semibold mb-2">لا توجد نتائج</div>
          <button
            onClick={() => navigate('create-upload')}
            className="mt-4 px-5 py-2.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm"
          >
            ابدأ طلب جديد
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(rfq => {
            const cfg = STATUS_CONF[rfq.status]
            return (
              <button
                key={rfq.id}
                onClick={() => {
                  if (rfq.status === 'closed') navigate('rfq-closed')
                  else navigate('rfq-detail')
                }}
                className="w-full bg-white border border-neutral-100 rounded-2xl px-5 py-4 hover:border-[#123F3A]/30 hover:shadow-sm transition-all text-right"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cfg.cls}`}>
                        {cfg.label}
                      </span>
                      <span className="text-xs text-neutral-400">{rfq.id}</span>
                    </div>
                    <div className="font-black text-[#0D1F1D] text-base leading-snug mb-2">{rfq.name}</div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                      <span>{rfq.items} بند</span>
                      {rfq.suppliers > 0 && <span>{rfq.suppliers} موردًا</span>}
                      {rfq.offers > 0 && <span className="text-[#123F3A] font-semibold">{rfq.offers} عرضًا</span>}
                      {rfq.deadline && <span>الموعد: {rfq.deadline}</span>}
                    </div>
                  </div>
                  <div className="text-xs text-neutral-400 flex-shrink-0 pt-1">{rfq.date}</div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
