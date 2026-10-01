import {
  brandChipText,
  certificationChipText,
  datasheetLink,
  showAlternative,
  type QuoteLineBrand,
} from '../../lib/brandEquivalence'

/**
 * «ITCC · السعودية» + certification + «بديل» next to a price. Renders nothing
 * when the supplier stated no brand and the offer is not an alternative.
 */
export default function BrandChips({
  brand,
  alternative,
  className = '',
}: {
  brand: QuoteLineBrand | null | undefined
  alternative?: boolean | null
  className?: string
}) {
  const main = brandChipText(brand)
  const cert = certificationChipText(brand)
  const sheet = datasheetLink(brand)
  const alt = showAlternative(alternative)
  if (!main && !cert && !sheet && !alt) return null
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {alt && (
        <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">بديل</span>
      )}
      {main && (
        <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#f0faf7] text-[#123F3A] break-words">
          {main}
        </span>
      )}
      {cert && (
        <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] text-neutral-500 bg-neutral-100 break-words">{cert}</span>
      )}
      {sheet && (
        <a href={sheet} target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold text-[#123F3A] underline">
          ورقة البيانات
        </a>
      )}
    </div>
  )
}
