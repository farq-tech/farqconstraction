import { useState } from 'react'
import type { NavProps } from '../types'
import { BOQ_ITEMS } from '../data'
import { ClockIcon } from '../icons'

type Tab = 'overview' | 'items' | 'offers' | 'suppliers' | 'log'

const TABS: [Tab, string][] = [
  ['overview', 'نظرة عامة'],
  ['items', 'البنود'],
  ['offers', 'العروض'],
  ['suppliers', 'الموردون'],
  ['log', 'السجل'],
]

const LOG_ENTRIES = [
  { time: '14 سبتمبر 2026 · 09:12', action: 'تم رفع الكراسة', user: 'محمد العمري' },
  { time: '14 سبتمبر 2026 · 09:14', action: 'قرأ فرق 65 بندًا', user: 'فرق (تلقائي)' },
  { time: '14 سبتمبر 2026 · 09:22', action: 'تم تأكيد الموردين المقترحين', user: 'محمد العمري' },
  { time: '14 سبتمبر 2026 · 09:25', action: 'تم إرسال طلب التسعير إلى 92 موردًا', user: 'فرق (تلقائي)' },
  { time: '14 سبتمبر 2026 · 11:40', action: 'استلم عرض من الخزف السعودي', user: 'فرق (تلقائي)' },
  { time: '14 سبتمبر 2026 · 14:05', action: 'استلم عرض من سيكا السعودية', user: 'فرق (تلقائي)' },
  { time: '15 سبتمبر 2026 · 08:30', action: 'استلم 4 عروض إضافية', user: 'فرق (تلقائي)' },
]

export function RFQDetailView({ navigate }: NavProps) {
  const [tab, setTab] = useState<Tab>('overview')

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold text-neutral-400">RFQ-2024-089</span>
          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold">بانتظار العروض</span>
        </div>
        <h1 className="text-3xl font-black text-[#0D1F1D]">تجديد مبنى إداري — الرياض</h1>
        <div className="flex items-center gap-1.5 mt-2 text-sm text-neutral-500">
          <ClockIcon className="w-4 h-4" />
          الموعد النهائي: <span className="font-semibold text-[#0D1F1D]">16 سبتمبر 2026</span>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { n: '65', label: 'بندًا' },
          { n: '92', label: 'موردًا' },
          { n: '18', label: 'ردًا' },
          { n: '7', label: 'عروض مكتملة' },
        ].map(m => (
          <div key={m.label} className="bg-white border border-neutral-100 rounded-2xl px-4 py-4 text-center">
            <div className="text-2xl font-black text-[#123F3A]">{m.n}</div>
            <div className="text-xs text-neutral-500 mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Progress */}
      <div className="bg-white border border-neutral-100 rounded-2xl px-5 py-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold text-[#0D1F1D]">ردود الموردين</span>
          <span className="text-sm text-neutral-500">18 / 92 موردًا ردوا</span>
        </div>
        <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
          <div className="h-full bg-[#123F3A] rounded-full" style={{ width: `${(18 / 92) * 100}%` }} />
        </div>
        <div className="text-xs text-neutral-400 mt-2">متبقي 5 أيام للموعد النهائي</div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-100 mb-6 overflow-x-auto">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px ${
              tab === id
                ? 'border-[#123F3A] text-[#123F3A]'
                : 'border-transparent text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="bg-white border border-neutral-100 rounded-2xl p-5">
            <h3 className="font-bold text-[#0D1F1D] mb-4">ملخص الطلب</h3>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between"><span className="text-neutral-500">المشروع</span><span className="font-semibold">تجديد مبنى إداري</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">الموقع</span><span className="font-semibold">الرياض</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">تاريخ الإرسال</span><span className="font-semibold">14 سبتمبر 2026</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">الموعد النهائي</span><span className="font-semibold">16 سبتمبر 2026</span></div>
            </div>
          </div>
          <button
            onClick={() => navigate('offers')}
            className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
          >
            عرض العروض المستلمة (7)
          </button>
        </div>
      )}

      {tab === 'items' && (
        <div className="space-y-2">
          {BOQ_ITEMS.map(item => (
            <div key={item.id} className="bg-white border border-neutral-100 rounded-xl px-4 py-3.5 flex items-center gap-4">
              <span className="text-xs font-bold text-neutral-400 w-6">{item.id}</span>
              <div className="flex-1">
                <div className="font-semibold text-[#0D1F1D] text-sm">{item.name}</div>
                <div className="text-xs text-neutral-400">{item.qty} {item.unit}</div>
              </div>
              <div className="text-xs text-neutral-500">{item.supplierCount} موردًا</div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                item.status === 'ready' ? 'bg-[#CFF5DC] text-[#1a7a45]' : 'bg-amber-50 text-amber-700'
              }`}>
                {item.status === 'ready' ? 'أُرسل' : 'قيد البحث'}
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === 'offers' && (
        <div className="text-center py-8">
          <button
            onClick={() => navigate('offers')}
            className="px-6 py-3 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
          >
            عرض صندوق العروض
          </button>
        </div>
      )}

      {tab === 'suppliers' && (
        <div className="space-y-2">
          {[
            { name: 'الخزف السعودي', status: 'مكتمل', items: 12 },
            { name: 'سيكا السعودية', status: 'مكتمل', items: 4 },
            { name: 'كابلات الرياض', status: 'جزئي', items: 3 },
            { name: 'حديد سابك', status: 'بانتظار', items: 0 },
            { name: 'فيليبس العربية', status: 'بانتظار', items: 0 },
          ].map(s => (
            <div key={s.name} className="bg-white border border-neutral-100 rounded-xl px-4 py-3.5 flex items-center gap-4">
              <div className="flex-1">
                <div className="font-semibold text-[#0D1F1D] text-sm">{s.name}</div>
                <div className="text-xs text-neutral-400">{s.items > 0 ? `${s.items} بند` : 'لم يرد بعد'}</div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                s.status === 'مكتمل' ? 'bg-[#CFF5DC] text-[#1a7a45]' :
                s.status === 'جزئي' ? 'bg-amber-50 text-amber-700' :
                'bg-neutral-100 text-neutral-500'
              }`}>{s.status}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'log' && (
        <div className="relative">
          <div className="absolute right-6 top-0 bottom-0 w-px bg-neutral-100" />
          <div className="space-y-5">
            {LOG_ENTRIES.map((entry, i) => (
              <div key={i} className="flex gap-4 items-start">
                <div className="relative flex-shrink-0 w-12 flex justify-center">
                  <div className="w-3 h-3 rounded-full bg-[#123F3A] ring-2 ring-white mt-1" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#0D1F1D]">{entry.action}</div>
                  <div className="text-xs text-neutral-400 mt-0.5">{entry.time} · {entry.user}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
