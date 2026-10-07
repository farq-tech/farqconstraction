import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** Render locally: iOS WKWebView cannot reliably display a blob PDF iframe. */
export default function PdfAttachmentPreview({ url }: { url: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('جارٍ فتح الملف…')
  useEffect(() => {
    let cancelled = false
    const task = pdfjs.getDocument(url)
    const render = async () => {
      try {
        const doc = await task.promise
        if (cancelled || !host.current) return
        host.current.replaceChildren()
        for (let n = 1; n <= doc.numPages && !cancelled; n++) {
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
    return () => { cancelled = true; void task.destroy() }
  }, [url])
  return <div className="flex-1 min-h-0 overflow-y-auto bg-neutral-100 p-3">
    {status && <p role="status" className="p-4 text-center text-sm text-neutral-700">{status}</p>}
    <div ref={host} />
  </div>
}
