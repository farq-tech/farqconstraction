import { useEffect, useMemo, useState } from 'react'
import { MATERIAL_GROUPS, formatSar, loadMaterialPrices, monthLabel, type MaterialPriceIndex } from '../../lib/materialPrices'
import type { Nav } from '../MobileApp'
import { Chips, Screen, Skeleton } from '../ui'

function Change({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[12px] text-neutral-400">—</span>
  const up = value > 0
  const down = value < 0
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[12px] font-bold tabular-nums ${up ? 'bg-orange-50 text-[#C2410C]' : down ? 'bg-[#CFF5DC] text-[#1a7a45]' : 'bg-neutral-100 text-neutral-500'}`}>
      {up ? '▲' : down ? '▼' : ''} {Math.abs(value).toFixed(1)}%
    </span>
  )
}

export default function PricesScreen({ nav }: { nav: Nav }) {
  const [index, setIndex] = useState<MaterialPriceIndex | null>(null)
  const [group, setGroup] = useState<string>('all')
  useEffect(() => {
    loadMaterialPrices().then(setIndex).catch(() => {})
  }, [])

  const groups = useMemo(() => {
    const present = new Set((index?.materials || []).map((m) => m.category))
    return MATERIAL_GROUPS.filter(([key]) => present.has(key))
  }, [index])
  const rows = (index?.materials || []).filter((m) => group === 'all' || m.category === group)

  return (
    <Screen title="أسعار المواد" onBack={nav.back} large subtitle={index ? `متوسط السوق · ${monthLabel(index.updated)}` : undefined}>
      <Chips<string> options={[['all', 'الكل'], ...groups]} value={group} onChange={setGroup} />
      <div className="mt-4">
        {!index ? (
          <Skeleton rows={8} height={60} />
        ) : (
          <div className="bg-white rounded-2xl overflow-hidden divide-y divide-neutral-100 shadow-[0_1px_2px_rgba(13,31,29,0.06)]">
            {rows.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px] leading-snug">{m.name_ar}</div>
                  <div className="text-[12px] text-neutral-400">{m.unit_ar}</div>
                </div>
                <div className="text-left">
                  <div className="font-black text-[15px] tabular-nums">{formatSar(m.price)}</div>
                  <div className="mt-0.5 flex justify-end gap-1">
                    <Change value={m.monthly_change_pct} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-center text-[12px] text-neutral-400 mt-4">التغيّر مقارنة بالشهر السابق</p>
      </div>
    </Screen>
  )
}
