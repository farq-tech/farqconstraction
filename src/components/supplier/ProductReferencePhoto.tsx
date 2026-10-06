import { useState } from 'react'
import { safeImageUrl } from '../../lib/rfqCart'

export function ProductReferencePhoto({ url, name }: { url?: string | null; name: string }) {
  const src = safeImageUrl(url)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  if (!src || src === failedSrc) return <div className="my-2 rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-500">صورة البند غير متاحة</div>
  return <figure className="my-3 rounded-xl border border-neutral-100 bg-white p-2">
    <a href={src} target="_blank" rel="noopener noreferrer" aria-label={`تكبير صورة ${name}`}>
      <img src={src} alt={`صورة مرجعية: ${name}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedSrc(src)} className="h-36 w-full rounded-lg object-contain" />
    </a>
    <figcaption className="mt-1 text-center text-[11px] text-neutral-500">صورة مرجعية للبند — المواصفات المكتوبة هي المعتمدة</figcaption>
  </figure>
}
