import { useEffect, useState } from "react"
import {
  getConstructionMe,
  getPlatformWhatsAppArrival,
  listPlatformWhatsAppArrivals,
  resolvePlatformWhatsAppArrival,
  retryPlatformWhatsAppArrivalMedia,
  type PlatformWhatsAppArrivalDetail,
  type PlatformWhatsAppArrivalSummary,
} from "../../api/constructionClient"

function formatTime(value?: string | null) {
  if (!value) return "وقت غير معروف"
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? "وقت غير معروف"
    : date.toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" })
}

/** Separate platform-only review of shared-number arrivals; tenant inboxes never call these endpoints. */
export default function PlatformWhatsAppReviewPanel() {
  const [allowed, setAllowed] = useState(false)
  const [open, setOpen] = useState(false)
  const [arrivals, setArrivals] = useState<PlatformWhatsAppArrivalSummary[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [selected, setSelected] =
    useState<PlatformWhatsAppArrivalDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const [resolvedId, setResolvedId] = useState<string | null>(null)
  const [canRetryMedia, setCanRetryMedia] = useState(false)

  useEffect(() => {
    let alive = true
    getConstructionMe()
      .then((me) => {
        if (alive)
          setAllowed(me.permissions?.review_unowned_whatsapp_arrivals === true)
      })
      .catch(() => {
        if (alive) setAllowed(false)
      })
    return () => {
      alive = false
    }
  }, [])

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const result = await listPlatformWhatsAppArrivals()
      setArrivals(result.arrivals || [])
      setHasMore(Boolean(result.has_more))
      if (
        selected &&
        !result.arrivals?.some((row) => row.id === selected.arrival.id)
      )
        setSelected(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تحميل الرسائل")
    } finally {
      setLoading(false)
    }
  }

  async function openQueue() {
    setOpen(true)
    setNotice(null)
    setResolvedId(null)
    setCanRetryMedia(false)
    await refresh()
  }

  async function selectArrival(row: PlatformWhatsAppArrivalSummary) {
    setSelected(null)
    setError(null)
    setNotice(null)
    setLoading(true)
    try {
      setSelected(await getPlatformWhatsAppArrival(row.id))
      setReason("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر فتح الرسالة")
    } finally {
      setLoading(false)
    }
  }

  async function resolve(inviteId: string) {
    if (!selected || reason.trim().length < 8) return
    setBusy(true)
    setError(null)
    try {
      const result = await resolvePlatformWhatsAppArrival(
        selected.arrival.id,
        inviteId,
        selected.arrival.revision,
        reason.trim(),
      )
      setResolvedId(selected.arrival.id)
      setCanRetryMedia(Boolean(result.media_attachment_state))
      setNotice(
        result.media_attachment_state
          ? "تم ربط الرسالة. يجري إرفاق الوسائط بالمحادثة."
          : "تم ربط الرسالة بالمحادثة والطلب المختار.",
      )
      setArrivals((rows) =>
        rows.filter((row) => row.id !== selected.arrival.id),
      )
      setSelected(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر ربط الرسالة")
    } finally {
      setBusy(false)
    }
  }

  async function retryMedia() {
    if (!resolvedId) return
    setBusy(true)
    setError(null)
    try {
      const result = await retryPlatformWhatsAppArrivalMedia(resolvedId)
      setNotice(`حالة مرفق الوسائط: ${result.media_attachment_state}`)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "تعذّرت إعادة محاولة إرفاق الوسائط",
      )
    } finally {
      setBusy(false)
    }
  }

  if (!allowed) return null

  return (
    <>
      <button
        type="button"
        onClick={() => void openQueue()}
        className="fixed z-30 bottom-5 end-5 rounded-full bg-[#123F3A] px-4 py-3 text-sm font-bold text-white shadow-lg hover:bg-[#0D1F1D]"
      >
        مراجعة وارد WhatsApp الداخلي
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0D1F1D]/55 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="مراجعة رسائل WhatsApp الداخلية"
        >
          <div
            dir="rtl"
            className="flex h-[min(780px,94dvh)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-[#F8F9F7] shadow-2xl"
          >
            <header className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3 sm:px-6">
              <div>
                <h2 className="text-lg font-black text-[#0D1F1D]">
                  وارد WhatsApp الداخلي
                </h2>
                <p className="mt-0.5 text-xs text-neutral-500">
                  رسائل الأرقام المشتركة غير المنسوبة لشركة، مع تسجيل الاطلاع
                  والربط.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void refresh()}
                  disabled={loading}
                  className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-bold text-[#123F3A] disabled:opacity-50"
                >
                  تحديث
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-bold text-neutral-700"
                >
                  إغلاق
                </button>
              </div>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)]">
              <aside className="min-h-0 overflow-y-auto border-b border-neutral-200 bg-white lg:border-b-0 lg:border-s">
                <div className="border-b border-neutral-100 px-4 py-3 text-xs font-bold text-neutral-600">
                  {arrivals.length} رسالة تحتاج مراجعة
                  {hasMore ? " · توجد رسائل إضافية" : ""}
                </div>
                {arrivals.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => void selectArrival(row)}
                    className={`block w-full border-b border-neutral-100 px-4 py-3 text-start hover:bg-[#F5F8F6] ${
                      selected?.arrival.id === row.id ? "bg-[#EAF2EF]" : ""
                    }`}
                  >
                    <span className="block text-sm font-bold text-[#0D1F1D]">
                      رسالة واردة · {row.candidate_count} احتمالات
                    </span>
                    <span className="mt-1 block text-[11px] text-neutral-500">
                      وصلت {formatTime(row.occurred_at || row.ingested_at)}
                    </span>
                    <span
                      className="mt-1 block truncate text-[10px] text-neutral-400"
                      dir="ltr"
                    >
                      {row.id}
                    </span>
                  </button>
                ))}
                {!loading && arrivals.length === 0 && (
                  <p className="px-4 py-6 text-sm text-neutral-500">
                    لا توجد رسائل تنتظر المراجعة.
                  </p>
                )}
              </aside>

              <main className="min-h-0 overflow-y-auto p-4 sm:p-6">
                {error && (
                  <div
                    role="alert"
                    className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                  >
                    {error}
                  </div>
                )}
                {notice && (
                  <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                    {notice}
                    {resolvedId && canRetryMedia && (
                      <button
                        type="button"
                        onClick={() => void retryMedia()}
                        disabled={busy}
                        className="font-bold underline disabled:opacity-50"
                      >
                        إعادة محاولة إرفاق الوسائط
                      </button>
                    )}
                  </div>
                )}
                {loading && (
                  <p className="text-sm text-neutral-500">جارٍ التحميل…</p>
                )}
                {!loading && !selected && !notice && (
                  <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
                    اختر رسالة لمراجعة محتواها والطلبات المطابقة.
                  </p>
                )}
                {selected && (
                  <div className="space-y-5">
                    <section className="rounded-xl border border-neutral-200 bg-white p-4">
                      <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-neutral-500">
                        <span>
                          وصلت{" "}
                          {formatTime(
                            selected.arrival.occurred_at ||
                              selected.arrival.ingested_at,
                          )}
                        </span>
                        <span>رقم المراجعة {selected.arrival.revision}</span>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm leading-7 text-[#0D1F1D]">
                        {selected.arrival.text || "لا يوجد نص في الرسالة."}
                      </p>
                      {selected.arrival.media_available && (
                        <p className="mt-3 text-xs font-semibold text-neutral-600">
                          تحتوي الرسالة على وسائط مرفقة.
                        </p>
                      )}
                    </section>

                    <section className="space-y-3">
                      <h3 className="text-sm font-black text-[#0D1F1D]">
                        الطلبات المرشحة · لا يظهر الرقم المرسل
                      </h3>
                      {selected.candidates.map((candidate) => {
                        const safe =
                          candidate.sent_by_whatsapp && candidate.phone_matches
                        return (
                          <article
                            key={candidate.invite_id}
                            className="rounded-xl border border-neutral-200 bg-white p-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-bold text-[#0D1F1D]">
                                  {candidate.supplier_name_ar ||
                                    candidate.supplier_name_en ||
                                    "مورد غير مسمى"}
                                </div>
                                <div className="mt-1 text-xs text-neutral-600">
                                  {candidate.project_name || "مشروع بلا اسم"}
                                  {candidate.request_reference
                                    ? ` · ${candidate.request_reference}`
                                    : ""}
                                </div>
                                <div
                                  className={`mt-2 text-[11px] ${
                                    safe ? "text-emerald-700" : "text-amber-800"
                                  }`}
                                >
                                  {candidate.sent_by_whatsapp
                                    ? "دعوة WhatsApp مسجلة كمرسلة"
                                    : "لا يوجد إرسال WhatsApp مسجل"}{" "}
                                  ·{" "}
                                  {candidate.phone_matches
                                    ? "الرقم مطابق"
                                    : "الرقم غير مطابق"}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  void resolve(candidate.invite_id)
                                }
                                disabled={
                                  !safe || busy || reason.trim().length < 8
                                }
                                className="shrink-0 rounded-lg bg-[#123F3A] px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
                              >
                                ربط بهذه المحادثة
                              </button>
                            </div>
                          </article>
                        )
                      })}
                    </section>

                    <label className="block text-xs font-bold text-neutral-700">
                      سبب الربط · مطلوب للتدقيق
                      <textarea
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        minLength={8}
                        maxLength={1000}
                        rows={2}
                        className="mt-1.5 w-full resize-y rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#123F3A]"
                        placeholder="مثال: أكد المراجع تطابق الطلب والمورد مع محتوى الرد."
                      />
                    </label>
                  </div>
                )}
              </main>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
