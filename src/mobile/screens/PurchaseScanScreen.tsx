import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Nav } from '../MobileApp'
import { shrinkImage } from '../imageShrink'
import { saveDraft, scanPurchaseRequest, type ScannedRequest } from '../purchaseRequests'
import { statusBar } from '../native'

/*
 * A purchase request from another project, photographed (one or more pages),
 * read on the server, reviewed here, then kept as a draft quote request.
 * Same three-screen design as the scanner mockups: camera → «مراجعة البيانات» → draft.
 */

type Phase = 'camera' | 'reading' | 'review'
type Page = { mime: string; base64: string; url: string; name?: string }

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || '').split(',')[1] || '')
    r.onerror = () => reject(new Error('read'))
    r.readAsDataURL(file)
  })
}
type Row = { name: string; qty: string; unit: string; spec: string }

const LIME = '#a3e635'
const BRAND = '#123f3a'
const UNITS = ['حبة', 'م²', 'م³', 'م.ط', 'طن', 'كجم', 'كيس', 'لتر', 'لفة', 'مقطوعية']

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

function Chip({ children, tone = 'mint' }: { children: ReactNode; tone?: 'mint' | 'warn' }) {
  const cls = tone === 'mint' ? 'bg-[#cff5dc] text-[#1a7a45]' : 'bg-amber-50 text-amber-700'
  return <span className={`inline-flex items-center shrink-0 rounded-full px-3 h-[26px] text-[12px] font-bold ${cls}`}>{children}</span>
}

function normalizeUnit(u: string | null): string {
  const v = String(u || '').trim()
  if (/^م\s*2$|^m2$/i.test(v)) return 'م²'
  if (/^م\s*3$|^m3$/i.test(v)) return 'م³'
  if (/^(pc|pcs|each|no|nos|عدد)$/i.test(v)) return 'حبة'
  return v || 'حبة'
}

export default function PurchaseScanScreen({ nav }: { nav: Nav }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [phase, setPhase] = useState<Phase>('camera')
  const [camera, setCamera] = useState<'starting' | 'live' | 'denied' | 'unavailable'>('starting')
  const [torch, setTorch] = useState<boolean | null>(null)
  const [pages, setPages] = useState<Page[]>([])
  const [read, setRead] = useState<ScannedRequest | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [project, setProject] = useState('')
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    statusBar(true)
    return () => statusBar(false)
  }, [])

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

  async function capture() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return fileRef.current?.click()
    const page = await shrinkImage(video)
    setPages((p) => [...p, page].slice(0, 5))
    setError(null)
  }

  async function fromFiles(files: FileList | null) {
    if (!files?.length) return
    const added: Page[] = []
    for (const file of Array.from(files).slice(0, 5)) {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
      const isXlsx = file.type === XLSX || /\.xlsx$/i.test(file.name)
      if (isPdf || isXlsx) {
        if (file.size > 10 * 1024 * 1024) { setError('الملف أكبر من 10 م.ب.'); continue }
        const base64 = await fileToBase64(file).catch(() => '')
        if (base64) added.push({ mime: isPdf ? 'application/pdf' : XLSX, base64, url: '', name: file.name })
        continue
      }
      if (/\.xls$|\.csv$/i.test(file.name)) { setError('احفظ الملف بصيغة xlsx أو PDF ثم أعد المحاولة.'); continue }
      const page = await shrinkImage(file).catch(() => null)
      if (page) added.push(page)
    }
    if (fileRef.current) fileRef.current.value = ''
    if (!added.length) return setError('لم نستطع فتح الصورة. جرّب صورة أخرى.')
    setPages((p) => [...p, ...added].slice(0, 5))
    setError(null)
  }

  async function readPages() {
    if (!pages.length) return
    streamRef.current?.getTracks().forEach((t) => t.stop())
    setPhase('reading')
    setError(null)
    try {
      const out = await scanPurchaseRequest(pages)
      const r = out.request
      setRead(r)
      setProject(r.project || '')
      setReference(r.request_number || '')
      setRows(r.items.map((it) => ({
        name: it.description,
        qty: it.quantity == null ? '' : String(it.quantity),
        unit: normalizeUnit(it.unit),
        spec: it.specification || '',
      })))
      setPhase('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّرت القراءة.')
      setPhase('camera')
    }
  }

  function setRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  function createDraft() {
    const lines = rows
      .filter((r) => r.name.trim())
      .map((r) => ({ name: r.name.trim(), qty: r.qty.trim(), unit: r.unit, spec: r.spec.trim() || undefined }))
    const draft = saveDraft({ project: project.trim(), reference: reference.trim() || null, requester: read?.requester || null, lines })
    nav.back()
    nav.switchTab('requests', { kind: 'new', draftId: draft.id })
  }

  const missingQty = rows.filter((r) => !(Number(String(r.qty).replace(/,/g, '')) > 0)).length

  /* ===== scanner ===== */
  if (phase === 'camera' || phase === 'reading') {
    const last = pages[pages.length - 1]
    return (
      <div className="fixed inset-0 bg-[#010101] text-white overflow-hidden" dir="rtl">
        <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple className="hidden" onChange={(e) => void fromFiles(e.target.files)} />
        {phase === 'camera' ? (
          <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          last && <img src={last.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-[170px] bg-gradient-to-t from-black/95 to-transparent" />

        <div className="absolute inset-x-4 m-safe-top" style={{ top: 8 }}>
          <div className="mt-2 rounded-2xl px-4 h-[60px] flex items-center gap-3 backdrop-blur-xl" style={{ background: 'rgba(20,28,26,0.62)' }}>
            <div className="flex-1 min-w-0">
              <div className="text-[18px] font-bold leading-tight">قراءة طلب شراء</div>
              <div className="text-[11px] text-white/60 truncate">نحوّل بنوده إلى مسودة طلب تسعير</div>
            </div>
            <button onClick={nav.back} className="w-11 h-11 rounded-full bg-white/[0.08] flex items-center justify-center text-white/60" aria-label="إغلاق">
              <Icon d={CLOSE_ICON} className="w-5 h-5" />
            </button>
          </div>
          {camera !== 'denied' && (
            <div className="mt-3 mx-3 rounded-[14px] h-[41px] px-3 flex items-center gap-2 backdrop-blur-xl" style={{ background: 'rgba(15,26,20,0.7)' }}>
              <span className="flex-1 text-[13px] font-medium">
                {phase === 'reading'
                  ? `نقرأ ${pages.length > 1 ? `${pages.length} صفحات` : 'الصفحة'}، لحظات…`
                  : pages.length
                    ? 'أضف صفحة أخرى أو اضغط «اقرأ البنود»'
                    : 'صوّر طلب الشراء، أو اختر صورة أو PDF أو Excel'}
              </span>
              <Icon d={INFO_ICON} className="w-[18px] h-[18px]" />
            </div>
          )}
        </div>

        <div className="absolute inset-x-[22px] top-[calc(env(safe-area-inset-top)+170px)] bottom-[calc(env(safe-area-inset-bottom)+300px)]">
          {[
            'top-0 right-0 border-t-4 border-r-4 rounded-tr-[14px]',
            'top-0 left-0 border-t-4 border-l-4 rounded-tl-[14px]',
            'bottom-0 right-0 border-b-4 border-r-4 rounded-br-[14px]',
            'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-[14px]',
          ].map((c) => (
            <span key={c} className={`absolute w-[47px] h-[47px] ${c}`} style={{ borderColor: LIME }} />
          ))}
          {(camera === 'live' || phase === 'reading') && (
            <span className="absolute inset-x-2 h-[2px] m-scan-line" style={{ background: LIME, opacity: 0.75, boxShadow: `0 0 12px ${LIME}` }} />
          )}
        </div>

        {phase === 'reading' && (
          <div className="absolute inset-x-12 bottom-[calc(env(safe-area-inset-bottom)+150px)] rounded-2xl px-4 py-3 text-center backdrop-blur-md" style={{ background: 'rgba(15,30,26,0.9)' }}>
            <div className="text-[18px] font-bold">نستخرج البنود والكميات</div>
            <div className="text-[12px] text-[#cff5dc]/80 mt-0.5">ثم تراجعها قبل إنشاء المسودة</div>
          </div>
        )}

        {error && phase === 'camera' && (
          <div className="absolute inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+200px)] rounded-2xl bg-[#fffbeb] border border-[#fde68a] px-3 py-2.5 text-[#78350f] flex items-center gap-2">
            <Icon d={INFO_ICON} className="w-[18px] h-[18px] shrink-0" />
            <span className="text-[13px] font-semibold">{error}</span>
          </div>
        )}

        {(camera === 'denied' || camera === 'unavailable') && phase === 'camera' && !error && !pages.length && (
          <div className="absolute inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+125px)] rounded-2xl bg-[#fffbeb] border border-[#fde68a] p-2.5">
            <div className="rounded-[14px] bg-[#fffbeb] border border-[#fef3c7] px-3 h-[39px] flex items-center gap-2 text-[#78350f]">
              <Icon d={INFO_ICON} className="w-[18px] h-[18px]" />
              <span className="flex-1 text-[12.5px]">{camera === 'denied' ? 'تم رفض إذن الكاميرا — يمكنك تفعيله من الإعدادات' : 'الكاميرا غير متاحة الآن'}</span>
            </div>
            <div className="flex items-center justify-between mt-2.5 px-1">
              <button onClick={() => fileRef.current?.click()} className="text-[13px] font-semibold text-[#78350f]">أو اختر صورة أو ملف PDF أو Excel</button>
              {camera === 'denied' && (
                <button onClick={() => { window.location.href = 'app-settings:' }} className="h-[39px] px-3 rounded-xl bg-white border border-[#e5e5e5] text-[13px] font-bold" style={{ color: BRAND }}>
                  فتح الإعدادات
                </button>
              )}
            </div>
          </div>
        )}

        {phase === 'camera' && (
          <div className="absolute inset-x-0 bottom-0 m-safe-bottom">
            {pages.length > 0 && (
              <div className="px-4 pb-3 flex items-center gap-2">
                <div className="flex gap-2 flex-1 overflow-x-auto m-scroll-x">
                  {pages.map((p, i) => (
                    <button key={i} onClick={() => setPages((ps) => ps.filter((_, j) => j !== i))} className="relative shrink-0 w-11 h-14 rounded-md overflow-hidden border-2" style={{ borderColor: LIME }} aria-label="حذف الصفحة">
                      {p.url ? (
                        <img src={p.url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full bg-white text-[#123f3a] text-[10px] font-black flex items-center justify-center">{p.mime === 'application/pdf' ? 'PDF' : 'XLS'}</span>
                      )}
                      <span className="absolute top-0 left-0 w-4 h-4 bg-black/70 text-[10px] leading-4 text-center">×</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => void readPages()} className="h-11 px-4 rounded-full font-bold text-[14px] text-[#0d1f1d] m-press" style={{ background: LIME }}>
                  اقرأ البنود ({pages.length})
                </button>
              </div>
            )}
            <div className="h-[110px] flex items-center justify-center gap-[54px]">
              {torch != null ? (
                <button onClick={() => void toggleTorch()} className={`w-10 h-10 rounded-full flex items-center justify-center ${torch ? 'bg-white text-black' : 'bg-[#212121] text-white'}`} aria-label="الفلاش">
                  <Icon d={BOLT_ICON} className="w-5 h-5" />
                </button>
              ) : (
                <span className="w-10 h-10" />
              )}
              <button
                onClick={() => (camera === 'live' ? void capture() : fileRef.current?.click())}
                disabled={pages.length >= 5}
                className="relative w-20 h-20 rounded-full border-[3px] border-white flex items-center justify-center m-press disabled:opacity-40"
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
      </div>
    )
  }

  /* ===== review ===== */
  return (
    <div className="min-h-[100dvh] bg-[#fafaf8] flex flex-col" dir="rtl">
      <header className="sticky top-0 z-30 text-white m-safe-top" style={{ background: BRAND }}>
        <div className="h-[70px] px-4 flex items-center gap-3">
          <button onClick={() => setPhase('camera')} className="w-9 h-9 flex items-center justify-center" aria-label="رجوع">
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[18px] font-bold leading-tight">مراجعة البيانات</div>
            <div className="text-[12px] text-white/50">تحقق من البنود قبل إنشاء المسودة</div>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 pt-3.5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] m-fade">
        <div className="rounded-2xl bg-white border border-[#e5e5e5] p-2.5 flex items-center gap-3">
          <div className="flex-1 min-w-0 pr-1.5">
            <Chip tone={read?.is_purchase_request ? 'mint' : 'warn'}>{read?.is_purchase_request ? 'استخراج مكتمل' : 'تحقق من الصورة'}</Chip>
            <div className="mt-2 text-[15px] font-bold text-[#0d1f1d] truncate">طلب شراء{read?.request_date ? ` — ${read.request_date}` : ''}</div>
            <div className="mt-1 text-[11px] text-[#7b7b7b] truncate">
              {[pages[0]?.name || `${pages.length} ${pages.length > 1 ? 'صفحات' : 'صفحة'}`, `${rows.length} بند`, read?.requester].filter(Boolean).join(' · ')}
            </div>
          </div>
          {pages[0] && (
            <div className="relative w-[92px] h-[92px] shrink-0 rounded-xl overflow-hidden bg-neutral-200">
              {pages[0].url ? (
                <img src={pages[0].url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="w-full h-full bg-[#f0faf7] text-[#123f3a] text-[18px] font-black flex items-center justify-center">{pages[0].mime === 'application/pdf' ? 'PDF' : 'XLSX'}</span>
              )}
              <span className="absolute bottom-1 right-1 w-3.5 h-3.5 border-b-2 border-r-2" style={{ borderColor: LIME }} />
              <span className="absolute bottom-1 left-1 w-3.5 h-3.5 border-b-2 border-l-2" style={{ borderColor: LIME }} />
            </div>
          )}
        </div>

        {read && !read.is_purchase_request && (
          <div className="mt-3 rounded-2xl bg-[#fffbeb] border border-[#fde68a] text-[#78350f] px-4 py-3 text-[13px]">
            لم نجد بنودًا واضحة. أعد التصوير بإضاءة جيدة والصفحة كاملة داخل الإطار، أو أضف البنود في الخطوة التالية.
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <label className="rounded-[14px] bg-white border border-[#e5e5e5] px-3.5 py-3 col-span-2">
            <span className="block text-[11px] text-[#737373]">المشروع</span>
            <input value={project} onChange={(e) => setProject(e.target.value)} placeholder="اسم المشروع" className="w-full bg-transparent text-[15px] font-bold text-[#0d1f1d] outline-none" />
          </label>
          <label className="rounded-[14px] bg-white border border-[#e5e5e5] px-3.5 py-3 col-span-2">
            <span className="block text-[11px] text-[#737373]">رقم طلب الشراء</span>
            <input value={reference} onChange={(e) => setReference(e.target.value)} dir="ltr" placeholder="—" className="w-full text-right bg-transparent text-[15px] font-bold text-[#0d1f1d] outline-none" />
          </label>
        </div>

        <div className="mt-5 flex items-baseline justify-between">
          <h2 className="text-[20px] font-bold text-[#0d1f1d]">البيانات المستخرجة</h2>
          <span className="text-[12px] text-[#737373]">{rows.length} بند</span>
        </div>
        <p className="text-[12px] text-[#737373] mt-0.5">اضغط على أي حقل لتعديله</p>

        <div className="mt-3 space-y-3">
          {rows.map((r, i) => {
            const bad = !(Number(String(r.qty).replace(/,/g, '')) > 0)
            return (
              <div key={i} className={`rounded-2xl bg-white border p-3 ${bad ? 'border-amber-200' : 'border-[#f5f5f5]'}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] text-[#737373]">الصنف {i + 1}</span>
                  <button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="text-[12px] font-semibold text-red-600">حذف</button>
                </div>
                <textarea
                  value={r.name}
                  onChange={(e) => setRow(i, { name: e.target.value })}
                  rows={2}
                  dir="auto"
                  className="w-full rounded-xl bg-white border border-[#e5e5e5] focus:border-[#123f3a] px-3.5 py-2.5 text-[15px] font-medium text-[#0d1f1d] outline-none resize-none leading-snug"
                />
                <div className="mt-2.5 flex gap-2">
                  <label className="flex-1">
                    <span className="block text-[12px] text-[#737373] mb-1.5">الكمية</span>
                    <input
                      value={r.qty}
                      onChange={(e) => setRow(i, { qty: e.target.value })}
                      onFocus={(e) => e.currentTarget.select()}
                      inputMode="decimal"
                      className={`w-full h-12 rounded-xl border px-3 text-[15px] font-bold tabular-nums outline-none focus:border-[#123f3a] ${bad ? 'border-amber-300' : 'border-[#e5e5e5]'}`}
                    />
                  </label>
                  <label className="w-[120px]">
                    <span className="block text-[12px] text-[#737373] mb-1.5">الوحدة</span>
                    <select value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value })} className="w-full h-12 rounded-xl border border-[#e5e5e5] bg-white px-2 text-[15px] outline-none">
                      {[...new Set([r.unit, ...UNITS])].map((u) => <option key={u}>{u}</option>)}
                    </select>
                  </label>
                </div>
                {r.spec && <div className="mt-2 text-[12px] text-[#737373] leading-snug">ملاحظة: {r.spec}</div>}
                {bad && <div className="mt-1.5 text-[12px] font-semibold text-amber-700">اكتب الكمية</div>}
              </div>
            )
          })}
        </div>
        <button
          onClick={() => setRows((rs) => [...rs, { name: '', qty: '', unit: 'حبة', spec: '' }])}
          className="mt-3 w-full h-11 rounded-xl bg-[#f0faf7] font-bold text-[14px]"
          style={{ color: BRAND }}
        >
          + أضف بندًا
        </button>
      </main>

      <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#f5f5f5] px-4 pt-2 m-safe-bottom">
        <div className="pb-2.5">
          {missingQty > 0 && rows.length > 0 && <div className="text-center text-[12px] text-amber-700 mb-1.5">{missingQty} بنود بلا كمية، يمكنك إكمالها في المسودة</div>}
          <button onClick={createDraft} disabled={!rows.some((r) => r.name.trim())} className="w-full h-[54px] rounded-xl text-white text-[15px] font-bold disabled:opacity-40 m-press" style={{ background: BRAND }}>
            إنشاء مسودة طلب تسعير ({rows.filter((r) => r.name.trim()).length} بند)
          </button>
        </div>
      </div>
    </div>
  )
}
