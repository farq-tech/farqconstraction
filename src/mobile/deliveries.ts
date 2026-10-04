/**
 * Delivery check API for the iPhone app: read a photographed delivery note,
 * match it to its request, then store what the buyer confirmed.
 * Server: POST/GET /api/construction/deliveries[/scan] (farq api).
 */
import { apiBase } from '../api/apiBase'
import { constructionHeaders } from '../api/constructionAuth'
import { farqSession } from '../api/farqSession'

export type DeliveryStatus = 'COMPLETE' | 'PARTIAL' | 'OVER' | 'NOT_IN_REQUEST' | 'UNIT_MISMATCH' | 'NO_QUANTITY' | 'MATCHED'

export type DeliveryRead = {
  is_delivery_note: boolean
  supplier_name: string | null
  note_number: string | null
  note_date: string | null
  reference: string | null
  lines: Array<{ description: string; quantity: number | null; unit: string | null }>
}

export type RequestLine = { id: string; line_key?: string; name: string; quantity: number | null; uom: string | null }

export type DeliveryMatch = {
  rfq_id: string
  title: string
  created_at: string
  matched_by: 'REFERENCE' | 'SUPPLIER_AND_ITEMS' | 'ITEMS'
  supplier: { id: string; name: string } | null
  score: number
  rows: Array<{ delivered: DeliveryRead['lines'][number]; line: RequestLine | null; status: DeliveryStatus; score: number }>
  missing: RequestLine[]
}

export type DeliveryScan = {
  read: DeliveryRead
  model?: string
  read_ms?: number
  match: DeliveryMatch | null
  suggestion?: DeliveryMatch | null
  alternatives: Array<Omit<DeliveryMatch, 'rows' | 'missing'>>
}

export type SavedDelivery = {
  id: string
  rfq_id: string | null
  supplier_name: string | null
  note_number: string | null
  note_date: string | null
  created_at: string
  lines: Array<{ description: string; delivered_quantity: number | null; unit: string | null; rfq_line_id: string | null; ordered_quantity: number | null; status: DeliveryStatus }>
}

async function call<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const res = await fetch(`${apiBase()}/api/construction/${path}`, {
    ...init,
    headers: constructionHeaders(init.body ? { 'Content-Type': 'application/json' } : {}),
  })
  if (res.status === 401 && !retried) {
    const outcome = await farqSession.refreshForRequest(farqSession.getAccessToken()).catch(() => null)
    if (outcome?.status === 'refreshed') return call<T>(path, init, true)
  }
  const body = await res.json().catch(() => null)
  if (!res.ok || body?.ok === false || body?.success === false) {
    const code = body?.errors?.[0]?.code || `HTTP_${res.status}`
    throw new Error(
      code === 'DELIVERY_READ_FAILED'
        ? 'تعذّرت قراءة الصورة. صوّر السند كاملًا وبإضاءة جيدة ثم أعد المحاولة.'
        : code === 'INVALID_IMAGE'
          ? 'الصورة غير صالحة. جرّب صورة أخرى.'
          : res.status === 0 || code === 'HTTP_502' || code === 'HTTP_503'
            ? 'تعذّر الاتصال بالخادم. أعد المحاولة.'
            : 'حدث خطأ غير متوقع. أعد المحاولة.',
    )
  }
  return (body?.data ?? body) as T
}

export function scanDelivery(image: { mime: string; base64: string }, rfqId?: string | null) {
  return call<DeliveryScan>('deliveries/scan', {
    method: 'POST',
    body: JSON.stringify({ mime: image.mime, image_base64: image.base64, ...(rfqId ? { rfq_id: rfqId } : {}) }),
  })
}

export function saveDelivery(input: {
  rfqId: string | null
  read: DeliveryRead
  model?: string
  image?: { mime: string; base64: string } | null
  lines: SavedDelivery['lines']
}) {
  return call<{ id: string; created_at: string }>('deliveries', {
    method: 'POST',
    body: JSON.stringify({
      rfq_id: input.rfqId,
      read: input.read,
      model: input.model,
      lines: input.lines,
      ...(input.image ? { mime: input.image.mime, image_base64: input.image.base64 } : {}),
    }),
  })
}

export function listDeliveries(rfqId?: string | null) {
  return call<{ deliveries: SavedDelivery[] }>(`deliveries${rfqId ? `?rfq_id=${encodeURIComponent(rfqId)}` : ''}`)
}

/** A phone photo shrunk to a size the reader needs (longest side 1600 px, JPEG). */
export async function shrinkImage(source: Blob | HTMLVideoElement): Promise<{ mime: string; base64: string; url: string }> {
  let width: number
  let height: number
  let draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
  if (source instanceof HTMLVideoElement) {
    width = source.videoWidth
    height = source.videoHeight
    draw = (ctx, w, h) => ctx.drawImage(source, 0, 0, w, h)
  } else {
    // createImageBitmap first; an <img> decode when it refuses the file.
    const bitmap = await createImageBitmap(source).catch(() => null)
    if (bitmap) {
      width = bitmap.width
      height = bitmap.height
      draw = (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h)
    } else {
      const src = URL.createObjectURL(source)
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('لم نستطع فتح الصورة. جرّب صورة أخرى.'))
        el.src = src
      }).finally(() => window.setTimeout(() => URL.revokeObjectURL(src), 5000))
      width = img.naturalWidth
      height = img.naturalHeight
      draw = (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h)
    }
  }
  const scale = Math.min(1, 1600 / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')!
  draw(ctx, canvas.width, canvas.height)
  const url = canvas.toDataURL('image/jpeg', 0.8)
  return { mime: 'image/jpeg', base64: url.split(',')[1] || '', url }
}

export const STATUS_AR: Record<DeliveryStatus, { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }> = {
  COMPLETE: { label: 'مكتمل', tone: 'good' },
  PARTIAL: { label: 'ناقص', tone: 'warn' },
  OVER: { label: 'زائد', tone: 'warn' },
  UNIT_MISMATCH: { label: 'وحدة مختلفة', tone: 'bad' },
  NOT_IN_REQUEST: { label: 'ليس في الطلب', tone: 'bad' },
  NO_QUANTITY: { label: 'بلا كمية', tone: 'neutral' },
  MATCHED: { label: 'مطابق', tone: 'good' },
}

export function statusFor(delivered: number | null, ordered: number | null, current: DeliveryStatus): DeliveryStatus {
  if (current === 'NOT_IN_REQUEST' || current === 'UNIT_MISMATCH') return current
  if (delivered == null || !(delivered > 0)) return 'NO_QUANTITY'
  if (ordered == null) return 'MATCHED'
  if (Math.abs(delivered - ordered) < 1e-6) return 'COMPLETE'
  return delivered < ordered ? 'PARTIAL' : 'OVER'
}
