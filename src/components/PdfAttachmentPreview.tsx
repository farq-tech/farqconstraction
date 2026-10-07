import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** Render locally: iOS WKWebView cannot reliably display a blob PDF iframe. */
export default function PdfAttachmentPreview({ url }: { url: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageCount, setPageCount] = useState(0)
  const [status, setStatus] = useState('جارٍ فتح الملف…')
  useEffect(() => {
    let cancelled = false
    setStatus('جارٍ فتح الملف…')
    const task = pdfjs.getDocument(url)
    const render = async () => {
      try {
        const doc = await task.promise
        if (cancelled || !host.current) return
        setPageCount(doc.numPages)
        host.current.replaceChildren()
        const n = Math.min(pageNumber, doc.numPages)
        {
          const page = await doc.getPage(n)
          if (cancelled || !host.current) return
          const base = page.getViewport({ scale: 1 })
          const width = Math.max(240, host.current.clientWidth)
          const scale = Math.min(2, window.devicePixelRatio || 1) * width / base.width
          const viewport = page.getViewport({ scale })
          const canvas = document.createElement('canvas')
          canvas.width = Math.ceil(viewport.width)
          canvas.height = Math.ceil(viewport.height)
          canvas.style.width = '100%'
          canvas.style.display = 'block'
          canvas.style.marginBottom = '12px'
          canvas.setAttribute('aria-label', `صفحة ${n} من ${doc.numPages}`)
          host.current.appendChild(canvas)
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
          page.cleanup()
          if (!cancelled) setStatus('')
        }
      } catch {
        if (!cancelled) setStatus('تعذر عرض الملف. أعد فتح المرفق للمحاولة مرة أخرى.')
      }
    }
    void render()
    return () => {
      cancelled = true
      host.current?.querySelectorAll('canvas').forEach(canvas => { canvas.width = 0; canvas.height = 0 })
      void task.destroy()
    }
  }, [url, pageNumber])
  return <div className="flex-1 min-h-0 overflow-y-auto bg-neutral-100 p-3">
    {status && <p role="status" className="p-4 text-center text-sm text-neutral-700">{status}</p>}
    {pageCount > 1 && <div className="sticky top-0 flex justify-between items-center bg-white p-2 mb-2">
      <button disabled={pageNumber <= 1} onClick={() => setPageNumber(n => n - 1)} className="p-2 disabled:opacity-40">السابق</button>
      <span>{pageNumber} / {pageCount}</span>
      <button disabled={pageNumber >= pageCount} onClick={() => setPageNumber(n => n + 1)} className="p-2 disabled:opacity-40">التالي</button>
    </div>}
    <div ref={host} />
  </div>
}
