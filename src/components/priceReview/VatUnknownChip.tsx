import { vatNotStated } from '../../lib/priceReview'

/** «الضريبة غير مذكورة» — only when the supplier did not state the VAT basis. */
export default function VatUnknownChip({ value, className = '' }: { value: boolean | null | undefined; className?: string }) {
  if (!vatNotStated(value)) return null
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-100 text-neutral-500 ${className}`}>
      الضريبة غير مذكورة
    </span>
  )
}
