import { useEffect, useRef, useState } from 'react'
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
import { Pill, PrimaryButton, Sheet } from '../ui'

type Phase = 'camera' | 'reading' | 'result' | 'saving' | 'saved'
type Shot = { mime: string; base64: string; url: string }
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

const LIME = '#9BC53D'

function rowsFrom(match: DeliveryMatch): EditRow[] {
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

function num(v: string): number | null {
  const n = Number(String(v).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[,،\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

export default function DeliveryScanScreen({ nav, rfqId: presetRfq = null }: { nav: Nav; rfqId?: string | null }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [phase, setPhase] = useState<Phase>('camera')
  const [cameraOk, setCameraOk] = useState<boolean | null>(null)
  const [shot, setShot] = useState<Shot | null>(null)
  const [scan, setScan] = useState<DeliveryScan | null>(null)
  const [match, setMatch] = useState<DeliveryMatch | null>(null)
  const [rows, setRows] = useState<EditRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [picker, setPicker] = useState(false)
  const [requests, setRequests] = useState<ConstructionRfqSummary[] | null>(null)
  const [showMissing, setShowMissing] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [preferredRfq, setPreferredRfq] = useState<string | null>(presetRfq)

  useEffect(() => {
    statusBar(true)
    return () => statusBar(false)
  }, [])

  // The live camera; a photo picker when the camera is not available.
  useEffect(() => {
    if (phase !== 'camera') return
    let cancelled = false
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera')
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
        setCameraOk(true)
      } catch {
        if (!cancelled) setCameraOk(false)
      }
    }
    void start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [phase])

  async function readShot(image: Shot, rfqId: string | null = preferredRfq) {
    setShot(image)
    setPhase('reading')
    setError(null)
    try {
      const out = await scanDelivery(image, rfqId)
      setScan(out)
      const chosen = out.match || null
      setMatch(chosen)
      setRows(chosen ? rowsFrom(chosen) : [])
      setPhase('result')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّرت القراءة.')
      setPhase('result')
    }
  }

  async function capture() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return fileRef.current?.click()
    const image = await shrinkImage(video)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    await readShot(image)
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
    await readShot(image)
  }

  function useCandidate(m: DeliveryMatch) {
    setMatch(m)
    setRows(rowsFrom(m))
  }

  async function chooseRequest(id: string) {
    setPicker(false)
    if (shot) await readShot(shot, id)
  }

  async function openPicker() {
    setPicker(true)
    if (!requests) {
      const out = await listBuyerRfqs().catch(() => null)
      setRequests((out?.rfqs || []).filter((r) => !String(r.status).includes('DRAFT')))
    }
  }

  function setQty(i: number, value: string) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, qty: value, status: statusFor(num(value), r.ordered, r.status) } : r)))
  }

  async function confirm() {
    if (!scan) return
    setPhase('saving')
    setError(null)
    try {
      const saved = await saveDelivery({
        rfqId: match?.rfq_id || null,
        read: scan.read,
        model: scan.model,
        image: shot ? { mime: shot.mime, base64: shot.base64 } : null,
        lines: rows.map((r) => ({
          description: r.description,
          delivered_quantity: num(r.qty),
          unit: r.unit,
          rfq_line_id: r.lineId,
          ordered_quantity: r.ordered,
          status: r.status,
        })),
      })
      setSavedId(saved.id)
      setPhase('saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر الحفظ.')
      setPhase('result')
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
  const complete = rows.filter((r) => r.status === 'COMPLETE' || r.status === 'MATCHED').length
  const issues = rows.filter((r) => !['COMPLETE', 'MATCHED'].includes(r.status)).length

  /* ---------- camera + reading ---------- */
  if (phase === 'camera' || phase === 'reading') {
    return (
      <div className="fixed inset-0 bg-black text-white overflow-hidden" dir="rtl">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void fromFile(e.target.files?.[0])} />
        {phase === 'camera' ? (
          <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          shot && <img src={shot.url} alt="" className="absolute inset-0 w-full h-full object-cover blur-[2px] scale-105" />
        )}
        <div className="absolute inset-0 bg-black/35" />

        <header className="absolute top-0 inset-x-0 m-safe-top">
          <div className="h-16 px-4 flex items-center justify-between">
            <button onClick={nav.back} className="w-11 h-11 rounded-full bg-white/15 backdrop-blur flex items-center justify-center text-[22px]" aria-label="إغلاق">
              ×
            </button>
            <div className="font-bold text-[18px]">تحقق من التوريد</div>
            <span className="w-11" />
          </div>
        </header>

        {/* frame */}
        <div className="absolute inset-x-6 top-[18%] bottom-[30%]">
          {[
            'top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl',
            'top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl',
            'bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl',
            'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl',
          ].map((c) => (
            <span key={c} className={`absolute w-12 h-12 ${c}`} style={{ borderColor: LIME }} />
          ))}
          <span className="absolute inset-x-0 h-[3px] m-scan-line" style={{ background: LIME, boxShadow: `0 0 16px ${LIME}` }} />
        </div>

        {preferredRfq && phase === 'camera' && (
          <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+4.5rem)] flex justify-center">
            <span className="rounded-full px-3 py-1 text-[12px] font-bold text-[#123F3A]" style={{ background: LIME }}>
              للطلب <bdi dir="ltr">#{formatRfqReference(preferredRfq)}</bdi>
            </span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-[23%] text-center text-[15px] font-semibold px-8">
          {phase === 'reading'
            ? 'نقرأ الإيصال ونطابقه مع طلباتك…'
            : cameraOk === false
              ? 'صوّر إيصال التوريد أو اختره من الصور'
              : 'ضع إيصال التوريد داخل الإطار ثم التقط الصورة'}
        </div>

        {phase === 'camera' && (
          <div className="absolute inset-x-0 bottom-0 m-safe-bottom">
            <div className="flex items-center justify-center gap-12 pb-10">
              <button onClick={() => fileRef.current?.click()} className="w-14 h-14 rounded-full bg-white/15 backdrop-blur flex items-center justify-center" aria-label="من الصور">
                <svg viewBox="0 0 24 24" className="w-7 h-7" fill="currentColor"><path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 12h14l-4.5-6-3.5 4.5-2.5-3L5 17Zm3-7.5A1.5 1.5 0 1 0 8 6.5a1.5 1.5 0 0 0 0 3Z" /></svg>
              </button>
              <button
                onClick={() => (cameraOk ? void capture() : fileRef.current?.click())}
                className="w-[84px] h-[84px] rounded-full border-[5px] border-white flex items-center justify-center m-press"
                aria-label="التقاط"
              >
                <span className="w-[66px] h-[66px] rounded-full bg-white" />
              </button>
              <button onClick={() => void openPicker()} className="w-14 h-14 rounded-full bg-white/15 backdrop-blur flex items-center justify-center text-[13px] font-bold" aria-label="اختيار الطلب">
                طلب
              </button>
            </div>
          </div>
        )}

        {phase === 'reading' && (
          <div className="absolute inset-x-4 bottom-0 m-safe-bottom">
            <div className="mb-8 rounded-3xl bg-[#173a33]/95 px-5 py-4 flex items-center gap-4">
              <span className="w-12 h-12 rounded-full border-4 border-white/20 animate-spin" style={{ borderTopColor: LIME }} />
              <div>
                <div className="font-bold text-[15px]" style={{ color: LIME }}>قراءة تلقائية</div>
                <div className="text-[14px] text-white/85">نستخرج المورد والبنود والكميات</div>
              </div>
            </div>
          </div>
        )}

        <Sheet open={picker} onClose={() => setPicker(false)} title="اختر الطلب">
          <RequestPicker requests={requests} onPick={(id) => { setPicker(false); setPreferredRfq(id) }} />
        </Sheet>
      </div>
    )
  }

  /* ---------- saved ---------- */
  if (phase === 'saved') {
    return (
      <div className="min-h-[100dvh] bg-[#f2f3ef] flex flex-col items-center justify-center px-6 text-center m-safe-top m-safe-bottom" dir="rtl">
        <div className="w-20 h-20 rounded-full flex items-center justify-center text-[40px] text-[#123F3A]" style={{ background: LIME }}>✓</div>
        <div className="mt-5 text-[22px] font-black">سُجّل الاستلام</div>
        <p className="mt-2 text-[15px] text-neutral-600">
          {complete} بند مكتمل{issues ? ` · ${issues} بحاجة متابعة` : ''}
          {match ? ` · الطلب ${reference}` : ''}
        </p>
        <div className="mt-8 w-full space-y-2">
          {match && (
            <PrimaryButton className="w-full" onClick={() => nav.switchTab('requests', { kind: 'request', id: match.rfq_id })}>
              افتح الطلب
            </PrimaryButton>
          )}
          <button onClick={retake} className="w-full h-12 font-bold text-[#123F3A]">تحقق من إيصال آخر</button>
          <button onClick={nav.back} className="w-full h-12 font-semibold text-neutral-500">إغلاق</button>
        </div>
        <span className="hidden">{savedId}</span>
      </div>
    )
  }

  /* ---------- result ---------- */
  const read = scan?.read
  const candidate = !match ? scan?.suggestion || null : null
  return (
    <div className="min-h-[100dvh] bg-[#f2f3ef] flex flex-col" dir="rtl">
      <header className="sticky top-0 z-30 bg-[#123F3A] text-white m-safe-top">
        <div className="h-14 px-3 flex items-center gap-2">
          <button onClick={retake} className="h-10 px-2 font-semibold text-[15px]">إعادة التصوير</button>
          <div className="flex-1 text-center font-bold text-[16px]">نتيجة التحقق</div>
          <button onClick={nav.back} className="h-10 px-2 text-[22px]" aria-label="إغلاق">×</button>
        </div>
      </header>

      <main className="flex-1 px-4 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))] m-fade">
        {error && (
          <div className="rounded-2xl bg-red-50 text-red-700 px-4 py-3 text-[14px] font-semibold mb-3">
            {error}
            <button onClick={retake} className="block mt-2 text-[#123F3A] font-bold">إعادة التصوير</button>
          </div>
        )}

        {read && !read.is_delivery_note && (
          <div className="rounded-2xl bg-amber-50 text-amber-800 px-4 py-3 text-[14px] mb-3">
            الصورة لا تبدو سند تسليم واضحًا. صوّر السند كاملًا وبإضاءة جيدة.
          </div>
        )}

        {match && (
          <div className="rounded-3xl bg-[#173a33] text-white px-5 py-4 flex items-center gap-4">
            <span className="w-12 h-12 shrink-0 rounded-full flex items-center justify-center text-[22px] text-[#123F3A] font-black" style={{ background: LIME }}>✓</span>
            <div className="min-w-0">
              <div className="font-bold text-[15px]" style={{ color: LIME }}>
                {match.matched_by === 'REFERENCE' ? 'تطابق تلقائي برقم الطلب' : 'تطابق تلقائي بالمورد والبنود'}
              </div>
              <div className="text-[15px] font-semibold">
                تم ربط الإيصال بالطلب <bdi dir="ltr">#{reference}</bdi>
              </div>
              <div className="text-[12px] text-white/65 truncate mt-0.5">{match.title}</div>
            </div>
          </div>
        )}

        {read && read.is_delivery_note && !match && (
          <div className="rounded-2xl bg-white px-4 py-4 shadow-[0_1px_2px_rgba(13,31,29,0.06)]">
            <div className="font-bold text-[16px]">لم نربط الإيصال بطلب تلقائيًا</div>
            <p className="text-[13px] text-neutral-500 mt-1">اختر الطلب الذي يخص هذا التوريد.</p>
            {candidate && (
              <button onClick={() => useCandidate(candidate)} className="mt-3 w-full text-right rounded-xl bg-[#e0efec] px-4 py-3">
                <div className="text-[12px] text-[#123F3A] font-bold">الأقرب</div>
                <div className="text-[14px] font-semibold line-clamp-2">{candidate.title}</div>
              </button>
            )}
            <button onClick={() => void openPicker()} className="mt-2 w-full h-11 rounded-xl bg-[#123F3A] text-white font-bold">اختر من طلباتي</button>
          </div>
        )}

        {read && (
          <div className="mt-3 rounded-2xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(13,31,29,0.06)] grid grid-cols-3 gap-2 text-[12px]">
            <div className="min-w-0">
              <div className="text-neutral-400">المورد</div>
              <div className="font-bold text-[13px] truncate">{read.supplier_name || '—'}</div>
            </div>
            <div>
              <div className="text-neutral-400">رقم السند</div>
              <div className="font-bold text-[13px]"><bdi dir="ltr">{read.note_number || '—'}</bdi></div>
            </div>
            <div>
              <div className="text-neutral-400">التاريخ</div>
              <div className="font-bold text-[13px]"><bdi dir="ltr">{read.note_date || '—'}</bdi></div>
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="flex items-baseline justify-between mt-6 mb-2 px-1">
              <h2 className="text-[13px] font-bold text-neutral-500">البنود المستلمة ({rows.length})</h2>
              <span className="text-[12px] text-neutral-500">{complete} مكتمل{issues ? ` · ${issues} للمراجعة` : ''}</span>
            </div>
            <div className="space-y-2">
              {rows.map((r, i) => {
                const st = STATUS_AR[r.status]
                return (
                  <div key={i} className={`rounded-2xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(13,31,29,0.06)] ${st.tone === 'bad' ? 'ring-1 ring-red-200' : st.tone === 'warn' ? 'ring-1 ring-amber-200' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 font-bold text-[15px] leading-snug">{r.description}</div>
                      <Pill tone={st.tone}>{st.label}</Pill>
                    </div>
                    {r.lineName && <div className="text-[12px] text-neutral-400 mt-1 line-clamp-1">في الطلب: {r.lineName}</div>}
                    <div className="mt-3 flex items-center gap-3">
                      <label className="flex-1">
                        <span className="block text-[11px] text-neutral-500 mb-1">المستلم</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            value={r.qty}
                            onChange={(e) => setQty(i, e.target.value)}
                            onFocus={(e) => e.currentTarget.select()}
                            inputMode="decimal"
                            className="w-24 h-10 rounded-lg bg-black/[0.05] text-center font-bold tabular-nums outline-none"
                          />
                          <span className="text-[13px] text-neutral-500">{r.unit || ''}</span>
                        </div>
                      </label>
                      <div className="text-left">
                        <span className="block text-[11px] text-neutral-500 mb-1">المطلوب</span>
                        <span className="font-bold tabular-nums text-[15px]">{r.ordered ?? '—'}</span>{' '}
                        <span className="text-[13px] text-neutral-500">{r.orderedUnit || ''}</span>
                      </div>
                    </div>
                    {r.status === 'PARTIAL' && r.ordered != null && num(r.qty) != null && (
                      <div className="mt-2 text-[12px] font-semibold text-amber-700">متبقٍّ {Math.round((r.ordered - (num(r.qty) || 0)) * 100) / 100} {r.orderedUnit || ''}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {match && match.missing.length > 0 && (
          <div className="mt-3 rounded-2xl bg-white shadow-[0_1px_2px_rgba(13,31,29,0.06)]">
            <button onClick={() => setShowMissing((v) => !v)} className="w-full px-4 py-3 flex items-center justify-between text-[14px] font-semibold">
              <span>بنود في الطلب لم تُورَّد في هذا السند ({match.missing.length})</span>
              <span className="text-neutral-400">{showMissing ? '▴' : '▾'}</span>
            </button>
            {showMissing && (
              <div className="divide-y divide-neutral-100 border-t border-neutral-100">
                {match.missing.map((m) => (
                  <div key={m.id} className="px-4 py-2.5 flex items-start justify-between gap-3 text-[13px]">
                    <span className="min-w-0 line-clamp-2">{m.name}</span>
                    <span className="shrink-0 tabular-nums text-neutral-500">{m.quantity ?? '—'} {m.uom || ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {match && (
          <button onClick={() => void openPicker()} className="mt-4 w-full text-[14px] font-bold text-[#123F3A]">ليس هذا الطلب؟ اختر طلبًا آخر</button>
        )}
      </main>

      {match && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-xl border-t border-black/[0.06] px-4 pt-3 m-safe-bottom">
          <div className="pb-3">
            <PrimaryButton className="w-full" disabled={phase === 'saving'} onClick={() => void confirm()}>
              {phase === 'saving' ? 'جارٍ الحفظ…' : 'تأكيد الاستلام'}
            </PrimaryButton>
          </div>
        </div>
      )}

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
