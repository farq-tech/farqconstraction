import { useEffect, useState } from 'react'
import type { NavProps } from '../types'
import {
  MATERIAL_GROUPS,
  changeTone,
  formatChange,
  formatSar,
  loadMaterialPrices,
  monthLabel,
  type MaterialPriceIndex,
} from '../lib/materialPrices'

const TONE = {
  up: 'text-red-700',
  down: 'text-[#1a7a45]',
  flat: 'text-neutral-400',
} as const

function Change({ label, value }: { label: string; value: number | null }) {
  return (
    <span className={`tabular-nums ${TONE[changeTone(value)]}`}>
      <span className="font-semibold text-neutral-400">{label} </span>
      {formatChange(value)}
    </span>
  )
}

/** Farq's construction-materials index: every material, its unit, and the latest average. */
export function MaterialPricesView(_props: NavProps) {
  const [index, setIndex] = useState<MaterialPriceIndex | null>(null)

  useEffect(() => {
    let cancelled = false
    loadMaterialPrices().then((next) => {
      if (!cancelled) setIndex(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const materials = index?.materials ?? []

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">
      <h1 className="text-2xl lg:text-3xl font-black text-[#0D1F1D]">مؤشر أسعار مواد البناء</h1>
      <p className="text-sm text-neutral-500 mt-1">
        {index ? `${materials.length} مادة · ${monthLabel(index.updated)}` : 'نجلب الأسعار…'}
      </p>

      <div className="mt-6 space-y-5">
        {MATERIAL_GROUPS.map(([key, label]) => {
          const rows = materials.filter((item) => item.category === key)
          if (!rows.length) return null
          return (
            <section key={key}>
              <h2 className="text-sm font-extrabold text-[#123F3A] mb-2">{label}</h2>
              <div className="bg-white border border-neutral-100 rounded-2xl overflow-hidden">
                {rows.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-4 py-3 border-t border-neutral-100 first:border-t-0"
                  >
                    <div className="font-extrabold text-sm text-[#0D1F1D]">{item.name_ar}</div>
                    <div className="font-extrabold text-sm tabular-nums text-[#0D1F1D]">{formatSar(item.price)}</div>
                    <div className="text-xs font-semibold text-neutral-500">{item.unit_ar}</div>
                    <div className="flex justify-end gap-3 text-[11px] font-extrabold">
                      <Change label="شهري" value={item.monthly_change_pct} />
                      <Change label="سنوي" value={item.annual_change_pct} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <p className="mt-5 text-xs leading-6 text-neutral-500">
        الارتفاع بالأحمر والانخفاض بالأخضر، لأن ارتفاع السعر يزيد تكلفة الشراء. «شهري» عن الشهر السابق، و«سنوي» عن نفس الشهر من العام الماضي.
      </p>
    </div>
  )
}

export default MaterialPricesView
