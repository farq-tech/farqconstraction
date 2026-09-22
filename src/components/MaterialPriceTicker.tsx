import { useEffect, useState } from 'react'
import {
  changeTone,
  formatChange,
  formatSar,
  loadMaterialPrices,
  monthLabel,
  type MaterialPriceIndex,
} from '../lib/materialPrices'

const TONE = {
  up: 'text-[#ffb4a8]',
  down: 'text-[#CFF5DC]',
  flat: 'text-white/55',
} as const

/**
 * The site-wide materials bar. A rise is the warm tone because it costs the
 * buyer more; a fall is mint.
 */
export function MaterialPriceTicker({ onOpen }: { onOpen: () => void }) {
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
  const loop = materials.concat(materials)

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="مؤشر أسعار مواد البناء"
      className="group flex w-full items-stretch bg-[#123F3A] text-white h-11 overflow-hidden border-b border-white/10 text-right"
    >
      <span className="relative z-10 flex shrink-0 items-center gap-2 bg-[#123F3A] px-3 sm:px-4 shadow-[-16px_0_12px_4px_#123F3A]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#CFF5DC]" />
        <span className="leading-tight">
          <span className="block text-[11px] font-bold whitespace-nowrap">
            <span className="sm:hidden">أسعار المواد</span>
            <span className="hidden sm:inline">مؤشر أسعار مواد البناء</span>
          </span>
          <span className="block text-[10px] font-semibold text-white/60 whitespace-nowrap">
            {index ? monthLabel(index.updated) : 'فرق'}
          </span>
        </span>
      </span>
      <span className="min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_left,transparent,#000_12px,#000_calc(100%-16px),transparent)]">
        <span className="animate-price-ticker flex h-full items-center group-hover:[animation-play-state:paused]">
          {loop.length === 0 && <span className="px-4 text-xs text-white/50">نجلب الأسعار…</span>}
          {loop.map((item, i) => {
            const tone = changeTone(item.monthly_change_pct)
            return (
              <span
                key={`${item.id}-${i}`}
                aria-hidden="true"
                className="flex shrink-0 items-baseline gap-2 whitespace-nowrap border-s border-white/15 px-4"
              >
                <span className="text-[13px] font-bold">{item.name_ar}</span>
                <span className="text-[13px] font-extrabold tabular-nums">{formatSar(item.price)}</span>
                <span className="text-[11px] font-semibold text-white/55">{item.unit_ar}</span>
                <span className={`text-xs font-extrabold tabular-nums ${TONE[tone]}`}>
                  {formatChange(item.monthly_change_pct)}
                </span>
              </span>
            )
          })}
        </span>
      </span>
    </button>
  )
}

export default MaterialPriceTicker
