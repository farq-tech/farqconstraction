import { formatEventTime } from '../../lib/requestFile'
export default function SupplierPriceValidity({
  validUntil,
}: {
  validUntil?: string
}) {
  const time = formatEventTime(validUntil || null)
  if (!time) return null
  return (
    <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
      سعر المورد المعتمد · يسري حتى {time}
    </div>
  )
}
