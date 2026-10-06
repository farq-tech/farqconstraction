import { useEffect, useRef, useState } from 'react'
import { searchConstructionProducts } from '../api/constructionClient'
import { safeImageUrl } from '../lib/rfqCart'
import { cleanSpecCard, type SpecCard } from '../lib/specCard'

import { findReferencePhoto } from '../lib/referencePhotoSearch'

export default function BoqProductPhoto({ name, value, onCommit }: { name: string; value?: SpecCard; onCommit: (next: SpecCard | undefined) => void }) {
  const started = useRef(false)
  const edited = useRef(false)
  const current = useRef({ value, onCommit }); current.current = { value, onCommit }
  const [status, setStatus] = useState('')
  const [source, setSource] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState<string | null>(null)
  const image = safeImageUrl(value?.reference_photo_url)
  useEffect(() => {
    let active = true
    if (started.current || value?.reference_photos_reviewed || image || !name.trim()) return
    started.current = true
    setStatus('جارٍ البحث عن صورة توضيحية…')
    findReferencePhoto(name, () => active && !edited.current).then(result => {
      if (!active || edited.current) return
      const card = result.cards.find(c => safeImageUrl(c.image_url))
      if (!card) { setStatus(result.message_ar || 'لم نعثر على صورة مناسبة؛ يمكنك إضافة رابط صورة.'); return }
      // Only the photo is proposed: never replace the booklet's identity or specifications.
      if (!current.current.value?.reference_photo_url) current.current.onCommit(cleanSpecCard({ ...current.current.value, reference_photos_reviewed: true, reference_photo_url: safeImageUrl(card.image_url) }))
      setSource(card.source?.url || null)
      setStatus('صورة توضيحية مقترحة من الإنترنت؛ راجع مطابقتها للبند.')
    }).catch(() => { if (active) setStatus('تعذر البحث عن الصورة؛ يمكنك إضافة رابط صورة.') })
    return () => { active = false; started.current = false }
  }, [name])
  const replace = (next: string) => { edited.current = true; started.current = true; current.current.onCommit(cleanSpecCard({ ...current.current.value, reference_photos_reviewed: true, reference_photo_url: next, reference_photo_urls: next ? current.current.value?.reference_photo_urls : [] })); setSource(null); setStatus(next ? 'صورة مرجعية أضافها العميل' : 'حُذفت الصورة'); setUrl('') }
  const photos = [...new Set([image, ...(value?.reference_photo_urls || []).map(safeImageUrl)].filter((u): u is string => Boolean(u)))]
  const changePhotos = (next: string[]) => { edited.current = true; started.current = true; current.current.onCommit(cleanSpecCard({ ...current.current.value, reference_photos_reviewed: true, reference_photo_url: next[0], reference_photo_urls: next.slice(1) })); setUrl(''); setStatus(next.length ? 'صور مرجعية للبند؛ راجع المطابقة.' : 'حُذفت الصور') }
  return <section className="mx-5 my-3 rounded-xl border border-neutral-100 p-3" aria-label="صورة البند">
    <div className="flex gap-2 overflow-x-auto">{photos.map(photo => <figure key={photo} className="shrink-0 w-32">{photo !== failed && <img src={photo} alt={`صورة توضيحية لـ${name}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(photo)} className="h-32 w-full object-contain rounded-lg bg-white" />}<button type="button" onClick={() => changePhotos(photos.filter(p => p !== photo))} className="text-xs text-red-700">حذف الصورة</button></figure>)}</div>
    <p className="text-xs text-neutral-500 my-2">{image === failed ? 'تعذر عرض الصورة؛ استبدل الرابط.' : status || 'صورة مرجعية؛ المواصفات المكتوبة هي المعتمدة.'}</p>
    {source && safeImageUrl(source) && <a href={source} target="_blank" rel="noopener noreferrer" className="text-xs underline">مصدر الصورة</a>}
    <div className="flex gap-2 mt-2"><input aria-label="رابط صورة أخرى" type="url" dir="ltr" placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} className="min-w-0 flex-1 rounded-lg border px-2 py-1 text-xs" /><button type="button" disabled={!safeImageUrl(url)} onClick={() => replace(url)} className="text-xs disabled:opacity-40">{image ? 'استبدال الصورة الرئيسية' : 'إضافة صورة'}</button>{image && <button type="button" disabled={!safeImageUrl(url) || photos.length >= 5} onClick={() => changePhotos([...photos, safeImageUrl(url)!])} className="text-xs disabled:opacity-40">إضافة أخرى</button>}{image && <button type="button" onClick={() => replace('')} className="text-xs text-red-700">حذف</button>}</div>
  </section>
}
