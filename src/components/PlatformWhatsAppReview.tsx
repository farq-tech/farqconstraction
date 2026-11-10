import { useEffect, useState } from "react"
import {
  getConstructionMe,
  getPlatformWhatsAppArrival,
  listPlatformWhatsAppArrivals,
  resolvePlatformWhatsAppArrival,
  type PlatformWhatsAppArrivalSummary,
  type PlatformWhatsAppArrivalDetail,
} from "../api/constructionClient"
import { useFarqSession } from "../api/useFarqSession"

function dateLabel(value?: string | null) {
  if (!value) return "وقت الاستلام غير متاح"
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? "وقت الاستلام غير متاح"
    : new Intl.DateTimeFormat("ar-SA", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
}

function candidateLabel(
  candidate: PlatformWhatsAppArrivalDetail["candidates"][number],
) {
  return (
    [
      candidate.company_name || `شركة ${candidate.company_id.slice(0, 8)}`,
      candidate.project_name,
      candidate.request_reference && `طلب ${candidate.request_reference}`,
    ]
      .filter(Boolean)
      .join(" · ") || `طلب ${candidate.rfq_id.slice(0, 8)}`
  )
}

export default function PlatformWhatsAppReview() {
  const session = useFarqSession()
  const [allowed, setAllowed] = useState(false)
  const [arrivals, setArrivals] = useState<PlatformWhatsAppArrivalSummary[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [details, setDetails] =
    useState<Record<string, PlatformWhatsAppArrivalDetail>>({})
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  async function load(cursor?: string | null, append = false) {
    const page = await listPlatformWhatsAppArrivals(cursor)
    setArrivals((current) =>
      append ? [...current, ...page.arrivals] : page.arrivals,
    )
    setNextCursor(page.next_cursor || null)
  }

  useEffect(() => {
    let cancelled = false
    setAllowed(false)
    setArrivals([])
    setDetails({})
    setSelected({})
    setNextCursor(null)
    setError("")
    if (!session.user?.id) return
    const userId = session.user.id
    getConstructionMe()
      .then(async (me) => {
        if (
          cancelled ||
          me.user_id !== userId ||
          me.permissions?.review_unowned_whatsapp_arrivals !== true
        )
          return
        setAllowed(true)
        try {
          const page = await listPlatformWhatsAppArrivals()
          if (cancelled) return
          setArrivals(page.arrivals)
          setNextCursor(page.next_cursor || null)
        } catch {
          if (!cancelled) setError("تعذر تحميل قائمة الرسائل غير المرتبطة.")
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [session.user?.id])

  if (!allowed) return null

  async function showDetail(arrivalId: string) {
    if (details[arrivalId]) {
      setDetails((current) => {
        const next = { ...current }
        delete next[arrivalId]
        return next
      })
      return
    }
    setLoadingId(arrivalId)
    setError("")
    try {
      const detail = await getPlatformWhatsAppArrival(arrivalId)
      setDetails((current) => ({ ...current, [arrivalId]: detail }))
      setReasons((current) => ({ ...current, [arrivalId]: "" }))
    } catch {
      setError("تعذر فتح الرسالة. حدّث القائمة ثم حاول مرة أخرى.")
    } finally {
      setLoadingId(null)
    }
  }

  async function linkSelected(arrivalId: string) {
    const detail = details[arrivalId]
    const inviteId = selected[arrivalId]
    const reason = (reasons[arrivalId] || "").trim()
    if (!detail || !inviteId || reason.length < 8) return
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const result = await resolvePlatformWhatsAppArrival(
        arrivalId,
        inviteId,
        detail.arrival.revision,
        reason,
      )
      if (!result.resolved) throw new Error("RESOLUTION_NOT_CONFIRMED")
      const linked = detail.candidates.find(
        (candidate) => candidate.invite_id === inviteId,
      )
      setArrivals((current) =>
        current.filter((arrival) => arrival.id !== arrivalId),
      )
      setDetails((current) => {
        const next = { ...current }
        delete next[arrivalId]
        return next
      })
      setSelected((current) => {
        const next = { ...current }
        delete next[arrivalId]
        return next
      })
      setNotice(
        `تم ربط الرسالة بـ ${
          linked ? candidateLabel(linked) : "الطلب"
        }. ستظهر في محادثة المورد لدى الشركة المعنية.`,
      )
    } catch {
      setError(
        "لم يتم الربط. قد تكون الرسالة عولجت أو تغيرت؛ حدّث القائمة وأعد مراجعة الطلب.",
      )
    } finally {
      setBusy(false)
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    setError("")
    try {
      await load(nextCursor, true)
    } catch {
      setError("تعذر تحميل رسائل إضافية.")
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <section
      className="mx-4 mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"
      aria-label="مراجعة رسائل واتساب غير المرتبطة"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-neutral-900">
            رسائل واتساب تحتاج تحديد الطلب
          </h2>
          <p className="mt-1 max-w-3xl text-neutral-700">
            هذه الرسائل وصلت إلى رقم استخدمته أكثر من شركة. راجع نص الرسالة
            وسياق الطلب، ثم اربطها يدوياً؛ لن تظهر في محادثة أي شركة قبل تأكيد
            الربط.
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 font-medium text-neutral-800">
          {arrivals.length}
          {nextCursor ? "+" : ""} رسالة
        </span>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-white p-3 text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mt-3 rounded-lg bg-white p-3 text-emerald-800"
        >
          {notice}
        </p>
      )}
      {!error && arrivals.length === 0 && (
        <p className="mt-3 rounded-lg bg-white p-3 text-neutral-700">
          لا توجد رسائل واتساب غير مرتبطة حالياً.
        </p>
      )}

      <ul className="mt-3 space-y-3">
        {arrivals.map((arrival) => {
          const detail = details[arrival.id]
          const picked = selected[arrival.id]
          return (
            <li
              key={arrival.id}
              className="rounded-lg border border-amber-200 bg-white p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-neutral-900">
                    {arrival.candidate_count} طلبات محتملة
                  </p>
                  <p className="mt-1 text-xs text-neutral-600">
                    وصلت {dateLabel(arrival.occurred_at || arrival.ingested_at)}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-neutral-300 px-3 py-2 font-medium text-[#123F3A] hover:bg-neutral-50 disabled:opacity-60"
                  disabled={loadingId === arrival.id}
                  onClick={() => void showDetail(arrival.id)}
                >
                  {loadingId === arrival.id
                    ? "جارٍ التحميل…"
                    : detail
                      ? "إخفاء التفاصيل"
                      : "مراجعة الرسالة"}
                </button>
              </div>
              {detail && (
                <div className="mt-3 border-t border-neutral-200 pt-3">
                  <p className="whitespace-pre-wrap break-words rounded-lg bg-neutral-50 p-3 text-neutral-900">
                    {detail.arrival.text ||
                      (detail.arrival.media_available
                        ? "وصل مرفق من المورد دون نص."
                        : "لا يوجد نص للرسالة.")}
                  </p>
                  {detail.arrival.media_available && (
                    <p className="mt-2 text-xs text-neutral-600">
                      يوجد مرفق؛ سيبدأ حفظه بعد ربط الرسالة.
                    </p>
                  )}
                  <p className="mt-3 font-medium text-neutral-900">
                    اختر الطلب الصحيح
                  </p>
                  <ul className="mt-2 space-y-2">
                    {detail.candidates.map((candidate) => (
                      <li key={candidate.invite_id}>
                        <button
                          type="button"
                          aria-pressed={picked === candidate.invite_id}
                          className={`w-full rounded-lg border p-3 text-right ${
                            picked === candidate.invite_id
                              ? "border-[#123F3A] bg-[#123F3A]/5"
                              : "border-neutral-200 hover:bg-neutral-50"
                          }`}
                          onClick={() =>
                            setSelected((current) => ({
                              ...current,
                              [arrival.id]: candidate.invite_id,
                            }))
                          }
                        >
                          <span className="block font-medium text-neutral-900">
                            {candidateLabel(candidate)}
                          </span>
                          <span className="mt-1 block text-xs text-neutral-600">
                            {candidate.supplier_name_ar ||
                              candidate.supplier_name_en ||
                              "المورد غير معروف"}{" "}
                            · {candidate.response_status || "بانتظار الرد"}
                          </span>
                          <span className="mt-1 block text-xs text-neutral-500">
                            {candidate.sent_by_whatsapp
                              ? "سبق إرسال طلب لهذا المورد عبر واتساب"
                              : "لا يظهر سجل إرسال واتساب لهذا الطلب"}
                            {candidate.phone_matches
                              ? " · الرقم مطابق لجهة الاتصال"
                              : " · الرقم غير مطابق لجهة الاتصال"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {picked && (
                    <div className="mt-3 space-y-2">
                      <label
                        className="block text-xs font-medium text-neutral-700"
                        htmlFor={`whatsapp-link-reason-${arrival.id}`}
                      >
                        سبب الربط للمراجعة الداخلية
                      </label>
                      <input
                        id={`whatsapp-link-reason-${arrival.id}`}
                        value={reasons[arrival.id] || ""}
                        onChange={(event) =>
                          setReasons((current) => ({
                            ...current,
                            [arrival.id]: event.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2"
                        placeholder="مثال: مرجع الطلب الوارد في نص الرسالة يطابق هذا الطلب"
                        maxLength={1000}
                      />
                      <button
                        type="button"
                        disabled={
                          busy || (reasons[arrival.id] || "").trim().length < 8
                        }
                        onClick={() => void linkSelected(arrival.id)}
                        className="rounded-lg bg-[#123F3A] px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busy
                          ? "جارٍ ربط الرسالة…"
                          : "تأكيد ربط الرسالة بالطلب المحدد"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {nextCursor && (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => void loadMore()}
          className="mt-3 rounded-lg border border-neutral-300 bg-white px-4 py-2 font-medium text-neutral-800 disabled:opacity-60"
        >
          {loadingMore ? "جارٍ التحميل…" : "تحميل رسائل أقدم"}
        </button>
      )}
    </section>
  )
}
