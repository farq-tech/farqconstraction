import { useEffect, useState } from 'react'
import {
  getSupplierPriceMemory,
  getPrewarmCapabilities,
  type SupplierPriceMemoryResult,
} from '../../api/constructionClient'
import { formatMoney } from '../../lib/requestFile'

export default function SupplierPriceMemory({ rfqId }: { rfqId: string }) {
  const [data, setData] = useState<SupplierPriceMemoryResult | null>(null)
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    setData(null)
    setError(false)
    getPrewarmCapabilities()
      .then((capabilities) =>
        capabilities.price_memory_enabled && capabilities.can_release
          ? getSupplierPriceMemory(rfqId)
          : { enabled: false, lines: [] },
      )
      .then((value) => {
        if (active) setData(value)
      })
      .catch(() => {
        if (active) setError(true)
      })
    return () => {
      active = false
    }
  }, [rfqId, revision])
  if (error)
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        تعذر تحديث سجل أسعار الموردين.{' '}
        <button
          className="font-bold underline"
          onClick={() => setRevision((r) => r + 1)}
        >
          إعادة المحاولة
        </button>
      </div>
    )
  if (!data?.enabled || !data.lines.some((line) => line.prices.length))
    return null
  return (
    <details className="rounded-2xl border border-neutral-100 bg-white p-4">
      <summary className="cursor-pointer text-sm font-bold text-[#123F3A]">
        سجل أسعار الموردين
      </summary>
      <p className="mt-2 text-xs text-neutral-500">
        الأسعار التي تحتاج تأكيدًا تبقى للمراجعة، ولا تدخل ضمن العروض الحالية.
      </p>
      <button
        className="mt-2 text-xs font-bold text-[#123F3A] underline"
        onClick={() => setRevision((r) => r + 1)}
      >
        تحديث السجل
      </button>
      {data.lines
        .filter((line) => line.prices.length)
        .map((line) => (
          <div key={line.line_id} className="mt-4">
            <div className="mb-2 text-xs font-bold text-neutral-700">
              {line.name}
            </div>
            <div className="space-y-2">
              {line.prices.map((price, index) => (
                <div
                  key={`${price.supplier_id}-${price.quoted_at}-${index}`}
                  className="rounded-xl bg-neutral-50 p-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-[#0D1F1D]">
                      {price.supplier_name}
                    </span>
                    <span className="font-bold tabular-nums">
                      {formatMoney(price.unit_price, price.currency)} /{' '}
                      {line.uom}
                    </span>
                  </div>
                  <div className="mt-1 text-neutral-500">
                    {price.prices_include_tax === true
                      ? 'شامل الضريبة'
                      : price.prices_include_tax === false
                        ? 'غير شامل الضريبة'
                        : 'الضريبة غير محددة'}{' '}
                    ·{' '}
                    {price.delivery_basis === 'EX_WAREHOUSE'
                      ? 'استلام من المستودع'
                      : 'التوصيل حسب شروط المورد'}
                  </div>
                  <div className="mt-2 flex flex-wrap justify-between gap-2">
                    <time
                      dateTime={price.quoted_at}
                      className="text-neutral-500"
                    >
                      تسعير المورد:{' '}
                      {new Date(price.quoted_at).toLocaleString('ar-SA')}
                    </time>
                    <span
                      className={
                        price.auto_offer_eligible
                          ? 'font-bold text-emerald-700'
                          : 'font-bold text-amber-700'
                      }
                    >
                      {price.auto_offer_eligible
                        ? 'صالح لشروط هذا البند'
                        : 'سعر سابق · يحتاج تأكيدًا'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
    </details>
  )
}
