import { useState, useRef } from 'react'
import type { NavProps } from '../types'
import { RECENT_RFQS } from '../data'
import { UploadIcon, ArrowRightIcon } from '../icons'
import ConstructionStatusChip from '@/components/ConstructionStatusChip'
import { env } from '@/lib/env'

const STATUS_CONFIG = {
  active: { label: 'بانتظار العروض', className: 'bg-amber-50 text-amber-700' },
  awarded: { label: 'تمت الترسية', className: 'bg-[#CFF5DC] text-[#1a7a45]' },
  draft: { label: 'مسودة', className: 'bg-neutral-100 text-neutral-500' },
  closed: { label: 'مغلق', className: 'bg-neutral-100 text-neutral-500' },
}

export function HomeView({ navigate }: NavProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    navigate('create-upload')
  }

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-10">
      <div className="mb-6">
        <ConstructionStatusChip />
      </div>

      {/* Hero */}
      <div className="mb-10">
        <h1 className="text-4xl lg:text-5xl font-black text-[#0D1F1D] leading-tight mb-3">
          سوّم كراستك في دقائق
        </h1>
        <p className="text-lg text-neutral-500 leading-relaxed max-w-xl">
          ارفع كراسة الشروط والمواصفات، ونقرأ البنود ونقترح الموردين المناسبين لكل بند.
        </p>
        {env.allowPrototypeChrome ? (
          <p className="mt-3 text-xs font-semibold text-amber-700">
            قائمة الطلبات أدناه واجهة تجريبية فقط — المصدر الإنتاجي هو واجهة Construction API.
          </p>
        ) : null}
      </div>

      {/* Upload zone */}
      <div
        className={`relative rounded-2xl border-2 border-dashed transition-all cursor-pointer mb-10 ${
          dragging
            ? 'border-[#123F3A] bg-[#f0faf7]'
            : 'border-neutral-200 bg-white hover:border-[#123F3A]/40 hover:bg-[#f0faf7]/50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.xlsx,.xls"
          className="hidden"
          onChange={() => navigate('create-upload')}
        />
        <div className="flex flex-col items-center py-16 px-8">
          <div className="w-16 h-16 rounded-2xl bg-[#CFF5DC] flex items-center justify-center mb-5">
            <UploadIcon className="w-8 h-8 text-[#123F3A]" />
          </div>
          <div className="text-xl font-bold text-[#0D1F1D] mb-2">رفع كراسة جديدة</div>
          <p className="text-neutral-400 text-sm mb-6 text-center">
            اسحب الملف هنا أو اضغط للاختيار
          </p>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-600 text-xs font-semibold">PDF</span>
            <span className="px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-600 text-xs font-semibold">Excel</span>
          </div>
          <button
            className="mt-6 px-6 py-3 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
            onClick={(e) => { e.stopPropagation(); navigate('create-upload') }}
          >
            اختر ملفًا
          </button>
        </div>
      </div>

      {/* Recent RFQs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#0D1F1D]">آخر طلبات التسعير</h2>
          <button
            onClick={() => navigate('rfq-list')}
            className="text-sm text-[#123F3A] font-semibold hover:underline flex items-center gap-1"
          >
            عرض الكل <ArrowRightIcon className="w-3.5 h-3.5 rotate-180" />
          </button>
        </div>

        {RECENT_RFQS.length === 0 ? (
          <div className="text-center py-16 text-neutral-400">
            <div className="text-3xl mb-3">📄</div>
            <div className="font-semibold">ابدأ بأول كراسة</div>
          </div>
        ) : (
          <div className="space-y-3">
            {RECENT_RFQS.map((rfq) => {
              const cfg = STATUS_CONFIG[rfq.status]
              return (
                <button
                  key={rfq.id}
                  onClick={() => navigate('rfq-detail')}
                  className="w-full bg-white rounded-2xl border border-neutral-100 px-5 py-4 flex items-center gap-4 hover:border-[#123F3A]/20 hover:shadow-sm transition-all text-right"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.className}`}>
                        {cfg.label}
                      </span>
                      <span className="text-xs text-neutral-400">{rfq.date}</span>
                    </div>
                    <div className="font-bold text-[#0D1F1D] text-base">{rfq.name}</div>
                    <div className="text-xs text-neutral-400 mt-1">{rfq.id}</div>
                  </div>
                  <div className="flex items-center gap-6 text-center flex-shrink-0">
                    <div>
                      <div className="text-lg font-black text-[#0D1F1D]">{rfq.items}</div>
                      <div className="text-xs text-neutral-400">بندًا</div>
                    </div>
                    <div>
                      <div className="text-lg font-black text-[#0D1F1D]">{rfq.suppliers}</div>
                      <div className="text-xs text-neutral-400">موردًا</div>
                    </div>
                    <div>
                      <div className="text-lg font-black text-[#123F3A]">{rfq.offers}</div>
                      <div className="text-xs text-neutral-400">عرضًا</div>
                    </div>
                  </div>
                  <ArrowRightIcon className="w-4 h-4 text-neutral-300 flex-shrink-0 rotate-180" />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
