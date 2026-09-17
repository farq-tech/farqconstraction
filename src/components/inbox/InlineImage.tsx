import { useEffect, useState } from 'react'
import { downloadConstructionInboxFile, type ConstructionInboxThreadFile } from '../../api/constructionClient'

/**
 * A supplier's picture, shown in the conversation.
 *
 * The file route needs the buyer's session, so an <img src> cannot point at
 * it: the bytes are fetched once with the session and shown from an object
 * URL. Kept per file id for the life of the page, because every fetch is an
 * audited download on the server and scrolling must not repeat it.
 */
const cache = new Map<string, Promise<string>>()

function objectUrlFor(fileId: string): Promise<string> {
  let pending = cache.get(fileId)
  if (!pending) {
    pending = downloadConstructionInboxFile(fileId).then((blob) => URL.createObjectURL(blob))
    pending.catch(() => cache.delete(fileId))
    cache.set(fileId, pending)
  }
  return pending
}

export function isShowableImage(file: ConstructionInboxThreadFile): boolean {
  const type = String(file.content_type || '').toLowerCase()
  const name = String(file.filename || '').toLowerCase()
  return file.state === 'STORED' && (type === 'image/png' || type === 'image/jpeg' || /\.(png|jpe?g)$/.test(name))
}

export function InlineImage({
  file,
  onDownload,
}: {
  file: ConstructionInboxThreadFile
  onDownload: (fileId: string, filename?: string) => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    let cancelled = false
    objectUrlFor(file.id)
      .then((value) => !cancelled && setUrl(value))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'تعذّر عرض الصورة'))
    return () => {
      cancelled = true
    }
  }, [file.id])

  if (error) {
    return (
      <button type="button" onClick={() => onDownload(file.id, file.filename)} className="text-[11px] text-amber-700 underline text-start">
        تعذّر عرض الصورة «{file.filename || 'صورة'}»: {error} اضغط لتنزيلها.
      </button>
    )
  }
  if (!url) {
    return <div className="w-56 h-36 rounded-xl bg-black/5 animate-pulse" aria-label="جارٍ تحميل الصورة" />
  }
  return (
    <>
      <button type="button" onClick={() => setZoomed(true)} className="block" title="اضغط للتكبير">
        <img
          src={url}
          alt={file.filename || 'صورة من المورد'}
          className="max-w-full sm:max-w-sm max-h-80 rounded-xl border border-black/5 object-contain bg-white"
        />
      </button>
      {zoomed && (
        <div
          className="fixed inset-0 z-[70] bg-black/80 flex flex-col items-center justify-center p-4"
          onClick={() => setZoomed(false)}
          role="dialog"
          aria-label="عرض الصورة"
        >
          <img src={url} alt={file.filename || 'صورة من المورد'} className="max-w-full max-h-[85vh] object-contain rounded-lg bg-white" />
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDownload(file.id, file.filename)
              }}
              className="px-4 py-2 rounded-xl bg-white text-[#123F3A] text-sm font-bold"
            >
              تنزيل
            </button>
            <button type="button" className="px-4 py-2 rounded-xl bg-white/15 text-white text-sm font-bold">إغلاق</button>
          </div>
        </div>
      )}
    </>
  )
}
