import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatRfqReference, formatRfqTitle, listBuyerRfqs, type ConstructionRfqSummary } from '../../api/constructionClient'
import type { Nav } from '../MobileApp'
import {
  STATUS_AR,
  saveDelivery,
  scanDelivery,
  shrinkImage,
  statusFor,
  type DeliveryMatch,
  type DeliveryScan,
  type DeliveryStatus,
} from '../deliveries'
import { statusBar } from '../native'
import { Sheet } from '../ui'

/*
 * Delivery check in three screens, as the design draws them:
 * 1. the scanner (full-screen camera, lime frame),
 * 2. «مراجعة البيانات» — what was read, editable, and the request it matched,
 * 3. «تم ربط إيصال التوريد» — the confirmation.
 */

type Phase = 'camera' | 'reading' | 'review' | 'saving' | 'done'
type Shot = { mime: string; base64: string; url: string; bytes: number }
type EditRow = {
  description: string
  unit: string | null
  qty: string
  ordered: number | null
  orderedUnit: string | null
  lineId: string | null
  lineName: string | null
  status: DeliveryStatus
}

const LIME = '#a3e635'
const BRAND = '#123f3a'

function rowsFrom(match: DeliveryMatch | null, scan: DeliveryScan): EditRow[] {
  if (match) {
    return match.rows.map((r) => ({
      description: r.delivered.description,
      unit: r.delivered.unit,
      qty: r.delivered.quantity == null ? '' : String(r.delivered.quantity),
      ordered: r.line?.quantity ?? null,
      orderedUnit: r.line?.uom ?? null,
      lineId: r.line?.id ?? null,
      lineName: r.line?.name ?? null,
      status: r.status,
    }))
  }
  return scan.read.lines.map((l) => ({
    description: l.description,
    unit: l.unit,
    qty: l.quantity == null ? '' : String(l.quantity),
    ordered: null,
    orderedUnit: null,
    lineId: null,
    lineName: null,
    status: 'MATCHED' as DeliveryStatus,
  }))
}

function num(v: string): number | null {
  const n = Number(String(v).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[,،\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** «م2» → «م²», kept in its own direction so RTL never prints «2م». */
function Unit({ value, className = '' }: { value: string | null; className?: string }) {
  if (!value) return null
  const v = value.replace(/م\s*2$/, 'م²').replace(/م\s*3$/, 'م³').replace(/^m2$/i, 'م²').replace(/^m3$/i, 'م³')
  return <bdi dir="rtl" className={className}>{v}</bdi>
}

function dateLabel(iso: string | null): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return iso
  return new Date(t).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric' })
}

/* ---------- small pieces of the design ---------- */

function DarkHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return (
    <header className="sticky top-0 z-30 text-white m-safe-top" style={{ background: BRAND }}>
      <div className="h-[70px] px-4 flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 flex items-center justify-center" aria-label="رجوع">
          <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-[18px] font-bold leading-tight truncate">{title}</div>
          <div className="text-[12px] text-white/50 truncate">{subtitle}</div>
        </div>
      </div>
    </header>
  )
}

function Chip({ children, tone = 'mint' }: { children: ReactNode; tone?: 'mint' | 'warn' | 'bad' | 'teal' }) {
  const cls = {
    mint: 'bg-[#cff5dc] text-[#1a7a45]',
    teal: 'bg-[#e0efec] text-[#123f3a]',
    warn: 'bg-amber-50 text-amber-700',
    bad: 'bg-red-50 text-red-700',
  }[tone]
  return <span className={`inline-flex items-center shrink-0 rounded-full px-3 h-[26px] text-[12px] font-bold ${cls}`}>{children}</span>
}

function Icon({ d, className = 'w-6 h-6' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}
const IMAGE_ICON = 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0'
const BOLT_ICON = 'M13 2 4 14h7l-1 8 9-12h-7z'
const INFO_ICON = 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01'
const CLOSE_ICON = 'M6 6l12 12M18 6 6 18'

/* ---------- the screen ---------- */

export default function DeliveryScanScreen({ nav, rfqId: presetRfq = null }: { nav: Nav; rfqId?: string | null }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [phase, setPhase] = useState<Phase>('camera')
  const [camera, setCamera] = useState<'starting' | 'live' | 'denied' | 'unavailable'>('starting')
  const [torch, setTorch] = useState<boolean | null>(null)
  const [shot, setShot] = useState<Shot | null>(null)
  const [scan, setScan] = useState<DeliveryScan | null>(null)
  const [match, setMatch] = useState<DeliveryMatch | null>(null)
  const [rows, setRows] = useState<EditRow[]>([])
  const [noteNumber, setNoteNumber] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [picker, setPicker] = useState(false)
  const [requests, setRequests] = useState<ConstructionRfqSummary[] | null>(null)
  const [preferredRfq, setPreferredRfq] = useState<string | null>(presetRfq)

  // Light status-bar text on the camera and the dark header; dark on the confirmation.
  useEffect(() => {
    statusBar(phase !== 'done')
  }, [phase])
  useEffect(() => () => statusBar(false), [])

  // Live camera; the album when the camera is refused or missing.
  useEffect(() => {
    if (phase !== 'camera') return
    let cancelled = false
    setCamera('starting')
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) return setCamera('unavailable')
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
        if (cancelled) return stream.getTracks().forEach((t) => t.stop())
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        const caps = (stream.getVideoTracks()[0]?.getCapabilities?.() || {}) as { torch?: boolean }
        setTorch(caps.torch ? false : null)
        setCamera('live')
      } catch (e) {
        if (!cancelled) setCamera((e as { name?: string })?.name === 'NotAllowedError' ? 'denied' : 'unavailable')
      }
    }
    void start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [phase])

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track || torch == null) return
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] })
      setTorch(!torch)
    } catch {
      setTorch(null)
    }
  }

  async function readShot(image: Shot, rfqId: string | null = preferredRfq) {
    setShot(image)
    setPhase('reading')
    setError(null)
    try {
      const out = await scanDelivery(image, rfqId)
      setScan(out)
      setMatch(out.match || null)
      setRows(rowsFrom(out.match || null, out))
      setNoteNumber(out.read.note_number || '')
      setPhase('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّرت القراءة.')
      setPhase('camera')
    }
  }

  async function capture() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return fileRef.current?.click()
    const image = await shrinkImage(video)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    await readShot({ ...image, bytes: Math.round(image.base64.length * 0.75) })
  }

  async function fromFile(file?: File) {
    if (!file) return
    if (fileRef.current) fileRef.current.value = ''
    const image = await shrinkImage(file).catch((e) => {
      setError(e instanceof Error ? e.message : 'لم نستطع فتح الصورة.')
      return null
    })
    if (!image) return
    streamRef.current?.getTracks().forEach((t) => t.stop())
    await readShot({ ...image, bytes: file.size })
  }

  async function openPicker() {
    setPicker(true)
    if (!requests) {
      const out = await listBuyerRfqs().catch(() => null)
      setRequests((out?.rfqs || []).filter((r) => !String(r.status).includes('DRAFT')))
    }
  }

  async function chooseRequest(id: string) {
    setPicker(false)
    setPreferredRfq(id)
    if (shot && phase === 'review') await readShot(shot, id)
  }

  function setRow(i: number, patch: Partial<EditRow>) {
    setRows((prev) =>
      prev.map((r, j) => {
        if (j !== i) return r
        const next = { ...r, ...patch }
        return { ...next, status: statusFor(num(next.qty), next.ordered, r.status) }
      }),
    )
  }

  async function confirm() {
    if (!scan) return
    setPhase('saving')
    setError(null)
    try {
      await saveDelivery({
        rfqId: match?.rfq_id || null,
        read: { ...scan.read, note_number: noteNumber.trim() || null },
        model: scan.model,
        image: shot ? { mime: shot.mime, base64: shot.base64 } : null,
        lines: rows.map((r) => ({
          description: r.description.trim(),
          delivered_quantity: num(r.qty),
          unit: r.unit,
          rfq_line_id: r.lineId,
          ordered_quantity: r.ordered,
          status: r.status,
        })),
      })
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر الحفظ.')
      setPhase('review')
    }
  }

  function retake() {
    setShot(null)
    setScan(null)
    setMatch(null)
    setRows([])
    setError(null)
    setPhase('camera')
  }

  const reference = match ? formatRfqReference(match.rfq_id) : ''
  const matchedCount = rows.filter((r) => r.lineId).length
  const confidence = rows.length ? Math.round((matchedCount / rows.length) * 100) : 0
  const issues = rows.filter((r) => !['COMPLETE', 'MATCHED'].includes(r.status)).length

  /* ===== 1. scanner ===== */
  if (phase === 'camera' || phase === 'reading') {
    const live = camera === 'live' && phase === 'camera'
    return (
      <div className="fixed inset-0 bg-[#010101] text-white overflow-hidden" dir="rtl">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void fromFile(e.target.files?.[0])} />

        {phase === 'camera' ? (
          <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          shot && <img src={shot.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-[120px] bg-gradient-to-t from-black/90 to-transparent" />

        {/* header panel + banner */}
        <div className="absolute inset-x-4 m-safe-top" style={{ top: 8 }}>
          <div className="mt-2 rounded-2xl px-4 h-[60px] flex items-center gap-3 backdrop-blur-xl" style={{ background: 'rgba(20,28,26,0.62)' }}>
            <div className="flex-1 min-w-0">
              <div className="text-[18px] font-bold leading-tight">تحقق من التوريد</div>
              <div className="text-[11px] text-white/60 truncate">
                {preferredRfq ? <>للطلب <bdi dir="ltr">#{formatRfqReference(preferredRfq)}</bdi></> : 'نقرأ الإيصال ونطابقه مع طلباتك تلقائيًا'}
              </div>
            </div>
            <button onClick={nav.back} className="w-11 h-11 rounded-full bg-white/[0.08] flex items-center justify-center text-white/60" aria-label="إغلاق">
              <Icon d={CLOSE_ICON} className="w-5 h-5" />
            </button>
          </div>
          {camera !== 'denied' && (
            <div className="mt-3 mx-3 rounded-[14px] h-[41px] px-3 flex items-center gap-2 backdrop-blur-xl" style={{ background: 'rgba(15,26,20,0.7)' }}>
              <span className="flex-1 text-[13px] font-medium">
                {phase === 'reading' ? 'نقرأ الإيصال، لحظات…' : 'ضع إيصال التوريد داخل الإطار ثم التقط الصورة'}
              </span>
              <Icon d={INFO_ICON} className="w-[18px] h-[18px]" />
            </div>
          )}
        </div>

        {/* frame */}
        <div className="absolute inset-x-[22px] top-[calc(env(safe-area-inset-top)+170px)] bottom-[calc(env(safe-area-inset-bottom)+300px)]">
          {[
            'top-0 right-0 border-t-4 border-r-4 rounded-tr-[14px]',
            'top-0 left-0 border-t-4 border-l-4 rounded-tl-[14px]',
            'bottom-0 right-0 border-b-4 border-r-4 rounded-br-[14px]',
            'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-[14px]',
          ].map((c) => (
            <span key={c} className={`absolute w-[47px] h-[47px] ${c}`} style={{ borderColor: LIME }} />
          ))}
          {(live || phase === 'reading') && <span className="absolute inset-x-2 h-[2px] m-scan-line" style={{ background: LIME, opacity: 0.75, boxShadow: `0 0 12px ${LIME}` }} />}
        </div>

        {/* reading card */}
        {phase === 'reading' && (
          <div className="absolute inset-x-12 bottom-[calc(env(safe-area-inset-bottom)+150px)] rounded-2xl px-4 py-3 text-center backdrop-blur-md" style={{ background: 'rgba(15,30,26,0.9)' }}>
            <div className="text-[18px] font-bold">نقرأ الأصناف والكميات</div>
            <div className="text-[12px] text-[#cff5dc]/80 mt-0.5">ثم نطابقها مع طلب التسعير</div>
          </div>
        )}

        {/* error after a failed read */}
        {error && phase === 'camera' && (
          <div className="absolute inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+130px)] rounded-2xl bg-[#fffbeb] border border-[#fde68a] px-3 py-2.5 text-[#78350f] flex items-center gap-2">
            <Icon d={INFO_ICON} className="w-[18px] h-[18px] shrink-0" />
            <span className="text-[13px] font-semibold">{error}</span>
          </div>
        )}

        {/* permission denied / no camera */}
        {(camera === 'denied' || camera === 'unavailable') && phase === 'camera' && !error && (
          <div className="absolute inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+125px)] rounded-2xl bg-[#fffbeb] border border-[#fde68a] p-2.5">
            <div className="rounded-[14px] bg-[#fffbeb] border border-[#fef3c7] px-3 h-[39px] flex items-center gap-2 text-[#78350f]">
              <Icon d={INFO_ICON} className="w-[18px] h-[18px]" />
              <span className="flex-1 text-[12.5px]">
                {camera === 'denied' ? 'تم رفض إذن الكاميرا — يمكنك تفعيله من الإعدادات' : 'الكاميرا غير متاحة الآن'}
              </span>
            </div>
            <div className="flex items-center justify-between mt-2.5 px-1">
              <button onClick={() => fileRef.current?.click()} className="text-[13px] font-semibold text-[#78350f]">أو اختر صورة من الألبوم</button>
              {camera === 'denied' && (
                <button onClick={() => { window.location.href = 'app-settings:' }} className="h-[39px] px-3 rounded-xl bg-white border border-[#e5e5e5] text-[13px] font-bold" style={{ color: BRAND }}>
                  فتح الإعدادات
                </button>
              )}
            </div>
          </div>
        )}

        {/* controls */}
        {phase === 'camera' && (
          <div className="absolute inset-x-0 bottom-0 m-safe-bottom">
            <div className="h-[110px] flex items-center justify-center gap-[54px]">
              {torch != null ? (
                <button onClick={() => void toggleTorch()} className={`w-10 h-10 rounded-full flex items-center justify-center ${torch ? 'bg-white text-black' : 'bg-[#212121] text-white'}`} aria-label="الفلاش">
                  <Icon d={BOLT_ICON} className="w-5 h-5" />
                </button>
              ) : (
                <button onClick={() => void openPicker()} className="w-10 h-10 rounded-full bg-[#212121] flex items-center justify-center text-[11px] font-bold" aria-label="اختيار الطلب">
                  طلب
                </button>
              )}
              <button
                onClick={() => (camera === 'live' ? void capture() : fileRef.current?.click())}
                className="relative w-20 h-20 rounded-full border-[3px] border-white flex items-center justify-center m-press"
                aria-label="التقاط"
              >
                <span className="absolute inset-[4px] rounded-full border-4" style={{ borderColor: LIME }} />
                <span className="w-[56px] h-[56px] rounded-full bg-white" />
              </button>
              <button onClick={() => fileRef.current?.click()} className="w-10 h-10 rounded-full bg-[#212121] flex items-center justify-center" aria-label="من الصور">
                <Icon d={IMAGE_ICON} className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        <Sheet open={picker} onClose={() => setPicker(false)} title="اختر الطلب">
          <RequestPicker requests={requests} onPick={(id) => void chooseRequest(id)} />
        </Sheet>
      </div>
    )
  }

  /* ===== 3. confirmation ===== */
  if (phase === 'done') {
    const shown = rows.slice(0, 3)
    return (
      <div className="min-h-[100dvh] bg-[#fafaf8] px-4 m-safe-top m-safe-bottom flex flex-col" dir="rtl">
        <div className="flex flex-col items-center text-center pt-12">
          <div className="w-24 h-24 rounded-full bg-[#cff5dc] flex items-center justify-center">
            <span className="w-[52px] h-[52px] rounded-full flex items-center justify-center" style={{ background: BRAND }}>
              <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </span>
          </div>
          <div className="mt-5"><Chip>{match ? 'تطابق تلقائي' : 'سُجّل الاستلام'}</Chip></div>
          <h1 className="mt-4 text-[24px] font-bold text-[#0d1f1d]">{match ? 'تم ربط إيصال التوريد' : 'حُفظ إيصال التوريد'}</h1>
          <p className="mt-2 text-[14px] text-[#737373] leading-[22px] max-w-[340px]">
            {match ? 'حُفظت الأصناف والكميات وأُرفق الإيصال بسجل طلب التسعير بنجاح.' : 'حُفظت الأصناف والكميات مع صورة الإيصال.'}
          </p>
        </div>

        <div className="mt-6 rounded-2xl bg-white border border-[#f5f5f5] shadow-[0_4px_16px_rgba(0,0,0,0.04)] p-4">
          {match && (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] text-[#7b7b7b]">طلب التسعير المرتبط</div>
                  <div className="text-[18px] font-bold text-[#0d1f1d]"><bdi dir="ltr">{reference}</bdi></div>
                </div>
                <button onClick={() => nav.switchTab('requests', { kind: 'request', id: match.rfq_id })} className="text-[13px] font-semibold shrink-0" style={{ color: BRAND }}>
                  عرض التفاصيل ←
                </button>
              </div>
              <div className="h-px bg-[#f5f5f5] my-3" />
            </>
          )}
          <div className="space-y-3">
            {shown.map((r, i) => (
              <div key={i} className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  {i === 0 && <div className="text-[11px] text-[#7b7b7b]">الصنف</div>}
                  <div className="text-[16px] font-bold text-[#0d1f1d] truncate">{r.description}</div>
                </div>
                <div className="text-left shrink-0">
                  {i === 0 && <div className="text-[11px] text-[#7b7b7b]">الكمية</div>}
                  <div className="text-[16px] font-bold whitespace-nowrap" style={{ color: BRAND }}>{r.qty || '—'} <Unit value={r.unit} /></div>
                </div>
              </div>
            ))}
            {rows.length > shown.length && <div className="text-[12px] text-[#737373] text-right">و<bdi>{rows.length - shown.length}</bdi> بنود أخرى في سجل الطلب</div>}
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-[#f0faf7] p-4">
          <div className="text-[14px] font-bold" style={{ color: BRAND }}>ما التالي؟</div>
          <p className="mt-1 text-[13px] text-[#525252] leading-[22px]">
            {issues
              ? `${issues} من البنود تحتاج متابعة (ناقص أو مختلف). تجدها في سجل التوريد داخل تفاصيل الطلب.`
              : 'يظهر الاستلام في سجل التوريد داخل تفاصيل الطلب، ويمكنك متابعة بقية البنود من هناك.'}
          </p>
        </div>

        <div className="mt-auto pt-6 pb-6 space-y-2.5">
          {match && (
            <button onClick={() => nav.switchTab('requests', { kind: 'request', id: match.rfq_id })} className="w-full h-[54px] rounded-xl text-white text-[15px] font-bold m-press" style={{ background: BRAND }}>
              عرض <bdi dir="ltr">{reference}</bdi>
            </button>
          )}
          <button onClick={() => nav.switchTab('home')} className="w-full h-[56px] rounded-xl bg-white border border-[#e5e5e5] text-[#525252] text-[15px] font-medium">العودة للرئيسية</button>
          <button onClick={retake} className="w-full h-11 text-[14px] font-semibold" style={{ color: BRAND }}>تحقق من إيصال آخر</button>
        </div>
      </div>
    )
  }

  /* ===== 2. review ===== */
  const read = scan?.read
  const candidate = !match ? scan?.suggestion || null : null
  return (
    <div className="min-h-[100dvh] bg-[#fafaf8] flex flex-col" dir="rtl">
      <DarkHeader title="مراجعة البيانات" subtitle="تحقق من القيم قبل المطابقة" onBack={retake} />

      <main className="flex-1 px-4 pt-3.5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] m-fade">
        {/* receipt card */}
        <div className="rounded-2xl bg-white border border-[#e5e5e5] p-2.5 flex items-center gap-3">
          <div className="flex-1 min-w-0 pr-1.5">
            <Chip tone={read?.is_delivery_note ? 'mint' : 'warn'}>{read?.is_delivery_note ? 'استخراج مكتمل' : 'تحقق من الصورة'}</Chip>
            <div className="mt-2 text-[15px] font-bold text-[#0d1f1d] truncate">إيصال توريد — {dateLabel(read?.note_date || null)}</div>
            <div className="mt-1 text-[11px] text-[#7b7b7b] truncate">
              {['صورة', shot && shot.bytes > 50_000 ? `${(shot.bytes / 1024 / 1024).toFixed(1)} م.ب` : null, read?.supplier_name || 'مورد غير مقروء'].filter(Boolean).join(' · ')}
            </div>
          </div>
          {shot && (
            <div className="relative w-[92px] h-[92px] shrink-0 rounded-xl overflow-hidden bg-neutral-200">
              <img src={shot.url} alt="" className="w-full h-full object-cover" />
              <span className="absolute bottom-1 right-1 w-3.5 h-3.5 border-b-2 border-r-2" style={{ borderColor: LIME }} />
              <span className="absolute bottom-1 left-1 w-3.5 h-3.5 border-b-2 border-l-2" style={{ borderColor: LIME }} />
            </div>
          )}
        </div>

        {error && <div className="mt-3 rounded-2xl bg-red-50 text-red-700 px-4 py-3 text-[14px] font-semibold">{error}</div>}
        {read && !read.is_delivery_note && (
          <div className="mt-3 rounded-2xl bg-[#fffbeb] border border-[#fde68a] text-[#78350f] px-4 py-3 text-[13px]">
            الصورة لا تبدو إيصال توريد واضحًا. أعد التصوير بإضاءة جيدة والإيصال كاملًا داخل الإطار.
          </div>
        )}

        {/* extracted data */}
        <h2 className="mt-5 text-[20px] font-bold text-[#0d1f1d]">البيانات المستخرجة</h2>
        <p className="text-[12px] text-[#737373] mt-0.5">اضغط على أي حقل لتعديله</p>

        <div className="mt-3 space-y-3">
          {rows.map((r, i) => {
            const st = STATUS_AR[r.status]
            const tone = st.tone === 'good' ? 'mint' : st.tone === 'warn' ? 'warn' : st.tone === 'bad' ? 'bad' : 'teal'
            return (
              <div key={i} className="rounded-2xl bg-white border border-[#f5f5f5] p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] text-[#737373]">الصنف{rows.length > 1 ? ` ${i + 1}` : ''}</span>
                  {match && <Chip tone={tone}>{st.label}</Chip>}
                </div>
                <input
                  value={r.description}
                  onChange={(e) => setRow(i, { description: e.target.value })}
                  className="w-full h-12 rounded-xl bg-white border border-[#e5e5e5] focus:border-[#123f3a] focus:border-[1.5px] px-4 text-[15px] font-medium text-[#0d1f1d] outline-none"
                />
                <div className="mt-2.5 flex items-end gap-3">
                  <label className="flex-1">
                    <span className="block text-[12px] text-[#737373] mb-1.5">الكمية المستلمة</span>
                    <div className="flex items-center h-12 rounded-xl border border-[#e5e5e5] focus-within:border-[#123f3a] focus-within:border-[1.5px] px-3 gap-2">
                      <input
                        value={r.qty}
                        onChange={(e) => setRow(i, { qty: e.target.value })}
                        onFocus={(e) => e.currentTarget.select()}
                        inputMode="decimal"
                        className="flex-1 min-w-0 bg-transparent text-[15px] font-bold text-[#0d1f1d] outline-none tabular-nums"
                      />
                      <Unit value={r.unit} className="text-[13px] text-[#737373]" />
                    </div>
                  </label>
                  {r.ordered != null && (
                    <div className="w-[96px] text-left pb-2.5">
                      <div className="text-[11px] text-[#737373]">المطلوب</div>
                      <div className="text-[15px] font-bold" style={{ color: BRAND }}>
                        {r.ordered} <Unit value={r.orderedUnit} className="text-[12px] font-normal text-[#858585]" />
                      </div>
                    </div>
                  )}
                </div>
                {r.status === 'PARTIAL' && r.ordered != null && num(r.qty) != null && (
                  <div className="mt-2 text-[12px] font-semibold text-amber-700">متبقٍّ {Math.round((r.ordered - (num(r.qty) || 0)) * 100) / 100} <Unit value={r.orderedUnit} /></div>
                )}
                {r.lineName && <div className="mt-1.5 text-[11px] text-[#a3a3a3] line-clamp-1">في الطلب: {r.lineName}</div>}
              </div>
            )
          })}
        </div>

        {/* note number + date */}
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <label className="rounded-[14px] bg-white border border-[#e5e5e5] px-3.5 py-3">
            <span className="block text-[11px] text-[#737373]">رقم الإيصال</span>
            <input value={noteNumber} onChange={(e) => setNoteNumber(e.target.value)} dir="ltr" className="w-full text-right bg-transparent text-[15px] font-bold text-[#0d1f1d] outline-none" placeholder="—" />
          </label>
          <div className="rounded-[14px] bg-white border border-[#e5e5e5] px-3.5 py-3">
            <span className="block text-[11px] text-[#737373]">تاريخ التوريد</span>
            <span className="block text-[15px] font-bold text-[#0d1f1d]">{dateLabel(read?.note_date || null)}</span>
          </div>
        </div>

        {/* auto-match */}
        {match ? (
          <div className="mt-3 rounded-2xl bg-[#f1fbf5] border border-[#cff5dc] p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[16px] font-bold text-[#1a7a45]">{match.matched_by === 'REFERENCE' ? 'تطابق تلقائي برقم الطلب' : 'تطابق تلقائي'}</div>
                <div className="text-[13px] font-semibold" style={{ color: BRAND }}><bdi dir="ltr">{reference}</bdi></div>
                <div className="text-[11px] text-[#737373] truncate">{match.title}</div>
              </div>
              <Chip>ثقة {confidence}٪</Chip>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-[#e0efec] overflow-hidden" dir="ltr">
              <div className="h-full rounded-full bg-[#1a7a45]" style={{ width: `${confidence}%` }} />
            </div>
            <p className="mt-2.5 text-[12px] text-[#525252]">
              {matchedCount} من {rows.length} بنود متطابقة مع الطلب{match.missing.length ? ` · ${match.missing.length} بنود في الطلب لم تُورَّد بعد` : ''}.
            </p>
            <button onClick={() => void openPicker()} className="mt-2 text-[12px] font-bold" style={{ color: BRAND }}>ليس هذا الطلب؟ اختر غيره</button>
          </div>
        ) : read?.is_delivery_note ? (
          <div className="mt-3 rounded-2xl bg-white border border-[#e5e5e5] p-3.5">
            <div className="text-[16px] font-bold text-[#0d1f1d]">لم نربط الإيصال بطلب تلقائيًا</div>
            <p className="text-[12px] text-[#737373] mt-0.5">اختر الطلب الذي يخص هذا التوريد.</p>
            {candidate && (
              <button onClick={() => void chooseRequest(candidate.rfq_id)} className="mt-3 w-full text-right rounded-xl bg-[#f0faf7] px-4 py-3">
                <div className="text-[12px] font-bold" style={{ color: BRAND }}>الأقرب</div>
                <div className="text-[14px] font-semibold line-clamp-2">{candidate.title}</div>
              </button>
            )}
            <button onClick={() => void openPicker()} className="mt-2 w-full h-11 rounded-xl text-white font-bold" style={{ background: BRAND }}>اختر من طلباتي</button>
          </div>
        ) : null}
      </main>

      {/* sticky action */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#f5f5f5] px-4 pt-2 m-safe-bottom">
        <div className="pb-2.5">
          <button
            onClick={() => void confirm()}
            disabled={phase === 'saving' || !rows.length}
            className="w-full h-[54px] rounded-xl text-white text-[15px] font-bold disabled:opacity-40 m-press"
            style={{ background: BRAND }}
          >
            {phase === 'saving' ? 'جارٍ الحفظ…' : match ? <>تأكيد وربط بـ <bdi dir="ltr">{reference}</bdi></> : 'تأكيد الاستلام بدون ربط'}
          </button>
        </div>
      </div>

      <Sheet open={picker} onClose={() => setPicker(false)} title="اختر الطلب">
        <RequestPicker requests={requests} onPick={(id) => void chooseRequest(id)} />
      </Sheet>
    </div>
  )
}

function RequestPicker({ requests, onPick }: { requests: ConstructionRfqSummary[] | null; onPick: (id: string) => void }) {
  if (!requests) return <div className="py-8 text-center text-[14px] text-neutral-400">نجلب طلباتك…</div>
  if (!requests.length) return <div className="py-8 text-center text-[14px] text-neutral-500">لا طلبات مرسلة بعد.</div>
  return (
    <div className="divide-y divide-neutral-100 pb-2">
      {requests.map((r) => (
        <button key={r.id} onClick={() => onPick(r.id)} className="w-full text-right py-3">
          <div className="font-semibold text-[15px] line-clamp-2">{formatRfqTitle(r)}</div>
          <div className="text-[12px] text-neutral-400 mt-0.5"><bdi dir="ltr">{formatRfqReference(r.id, r.engineering_department || null)}</bdi> · {r.line_count} بند</div>
        </button>
      ))}
    </div>
  )
}
