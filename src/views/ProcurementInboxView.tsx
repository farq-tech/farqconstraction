import { useEffect, useState } from "react"
import type { AppView } from "../types"
import { useProcurement } from "../procurementContext"
import { useFarqSession } from "../api/useFarqSession"
import { isReadOnlyBuild } from "../api/readOnlyMode"
import {
  listProcurementTasks,
  listCompanyMembers,
  getProcurementTask,
  answerProcurementTask,
  answerProcurementAttachment,
  listProcurementProjectFiles,
  assignProcurementTask,
  getProcurementImpact,
  broadcastProcurementAnswer,
  retryProcurementTask,
  closeProcurementTask,
  listProcurementShadows,
  type ProcurementTask,
  type ProcurementTaskList,
  type ProcurementImpact,
  type ProcurementShadowCase,
} from "../api/constructionClient"
const STATES: Record<string, string> = {
  NEW: "جديد",
  ASSIGNED: "مسند",
  WAITING_BUYER: "بانتظار المشتريات",
  ANSWERED: "إجابة محفوظة · الإرسال قيد المتابعة",
  SENT_TO_SUPPLIERS: "أُرسلت للموردين",
  CLOSED: "مغلق",
}
const PRIORITIES: Record<string, string> = {
  BLOCKING_QUOTE: "يمنع التسعير",
  IMPORTANT: "مهم",
  INFORMATIONAL: "معلومة",
}
const ATTRIBUTES: Record<string, string> = {
  thickness: "السماكة",
  voltage: "الجهد",
  quantity: "الكمية",
  dimensions: "المقاس",
  color: "اللون",
  brand: "الماركة",
  location: "موقع التوريد",
  payment: "شروط الدفع",
}
function replyPreview(task: ProcurementTask, value: string, unit: string) {
  return `${ATTRIBUTES[task.attribute] || "المعلومة المطلوبة"} المطلوبة ${value}${
    unit ? ` ${unit}` : ""
  }.`
}
function TaskCard({
  task,
  memberLabels,
  live,
  onRefresh,
  onConversation,
  onRfq,
}: {
  task: ProcurementTask
  memberLabels: Record<string, string>
  live: boolean
  onRefresh: () => void
  onConversation: (id: string) => void
  onRfq: (id: string) => void
}) {
  const session = useFarqSession()
  const [detail, setDetail] = useState<ProcurementTask | null>(
      task.waiters ? task : null,
    ),
    [value, setValue] = useState(""),
    [unit, setUnit] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [echo, setEcho] = useState(""),
    [correction, setCorrection] = useState(false),
    [impact, setImpact] = useState<ProcurementImpact | null>(null),
    [projectFiles, setProjectFiles] = useState<Array<{
      id: string
      filename: string
    }>>([])
  const current = detail || task
  const closed = ["ANSWERED", "SENT_TO_SUPPLIERS", "CLOSED"].includes(
    current.state,
  )
  const writable = live && !isReadOnlyBuild() && detail?.can_write === true
  async function load() {
    const d = await getProcurementTask(task.id)
    setDetail(d)
    return d
  }
  async function act(fn: () => Promise<unknown>) {
    setBusy(true)
    setError("")
    setEcho("")
    try {
      await fn()
      await load()
      onRefresh()
      window.dispatchEvent(new Event("procurement-updated"))
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إكمال الإجراء")
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    if (
      task.waiters &&
      !["ANSWERED", "SENT_TO_SUPPLIERS", "CLOSED"].includes(task.state)
    ) {
      setDetail(task)
      return
    }
    let active = true
    getProcurementTask(task.id)
      .then((d) => {
        if (active) setDetail(d)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [task.id, task.revision])
  const count =
    task.supplier_count ??
    new Set(current.waiters?.map((w) => w.supplier_name)).size
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-3">
      <div className="flex justify-between gap-4">
        <div>
          <h2 className="font-black text-[#0D1F1D]">{task.item_name}</h2>
          <button
            className="text-xs text-neutral-500 underline"
            onClick={() => onRfq(task.rfq_id)}
          >
            عرض طلب التسعير
          </button>
        </div>
        <span
          className={`h-fit rounded-full px-2 py-1 text-[10px] font-bold ${
            task.priority === "BLOCKING_QUOTE"
              ? "bg-amber-100 text-amber-800"
              : "bg-neutral-100 text-neutral-600"
          }`}
        >
          {PRIORITIES[task.priority]}
        </span>
      </div>
      <p className="text-xs text-neutral-500">
        {count} موردين مرتبطين بالسؤال · {STATES[current.state]} ·{" "}
        {new Date(task.created_at).toLocaleString("ar-SA", {
          timeZone: "Asia/Riyadh",
          dateStyle: "short",
          timeStyle: "short",
        })}
      </p>
      <p className="text-base font-bold">{task.question}</p>
      {current.answer && (
        <p className="text-sm rounded-xl bg-green-50 p-3">
          الإجابة المؤكدة: {current.answer.value} {current.answer.unit}{" "}
          <span className="text-xs text-neutral-500">· محفوظة على البند</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-neutral-500">
          المسؤول:{" "}
          {current.assigned_user_id === session.user?.id
            ? "أنت"
            : current.assigned_user_id
              ? memberLabels[current.assigned_user_id] ||
                "موظف المشتريات المسند"
              : "غير مسند"}
        </span>
        {writable && !closed && (
          <button
            disabled={busy}
            onClick={() =>
              act(() =>
                assignProcurementTask(
                  task.id,
                  session.user!.id,
                  current.revision,
                ),
              )
            }
            className="underline text-[#123F3A]"
          >
            إسناد لي
          </button>
        )}
      </div>
      {task.kind === "HUMAN_REVIEW_REQUIRED" ? (
        <p className="text-sm text-amber-800">
          تحتاج هذه الرسالة قرارًا بشريًا. افتح المحادثة واستلمها.
        </p>
      ) : task.kind === "ATTACHMENT_REQUEST" ? (
        <div className="flex flex-wrap gap-2">
          <label
            className={`rounded-xl border px-3 py-2 text-sm ${
              writable && !closed ? "cursor-pointer" : "opacity-40"
            }`}
          >
            رفع صورة أو ملف
            <input
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              disabled={!writable || busy || closed}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0]
                if (!file) return
                void act(async () => {
                  if (file.size > 5 * 1024 * 1024)
                    throw Error("اختر ملفًا حتى 5 ميجابايت")
                  const content = await new Promise<string>(
                    (resolve, reject) => {
                      const r = new FileReader()
                      r.onload = () => resolve(String(r.result).split(",")[1])
                      r.onerror = () => reject(Error("تعذر قراءة الملف"))
                      r.readAsDataURL(file)
                    },
                  )
                  await answerProcurementAttachment(task.id, {
                    revision: current.revision,
                    idempotency_key: crypto.randomUUID(),
                    files: [{ filename: file.name, content }],
                  })
                  setEcho(
                    "حُفظ الملف على البند. تابع حالة الإرسال للموردين أدناه.",
                  )
                })
              }}
            />
          </label>
          <button
            disabled={!writable || busy || closed}
            className="rounded-xl border px-3 py-2 text-sm disabled:opacity-40"
            onClick={() =>
              act(async () => {
                setProjectFiles(
                  (await listProcurementProjectFiles(task.id)).files,
                )
              })
            }
          >
            اختيار من ملفات الطلب
          </button>
          <button
            disabled={!writable || busy || closed}
            className="rounded-xl border px-3 py-2 text-sm disabled:opacity-40"
            onClick={() =>
              act(() =>
                answerProcurementAttachment(task.id, {
                  revision: current.revision,
                  idempotency_key: crypto.randomUUID(),
                  unavailable: true,
                }),
              )
            }
          >
            غير متوفرة
          </button>
          {projectFiles.map((f) => (
            <button
              key={f.id}
              disabled={!writable || busy}
              className="text-sm underline"
              onClick={() =>
                act(() =>
                  answerProcurementAttachment(task.id, {
                    revision: current.revision,
                    idempotency_key: crypto.randomUUID(),
                    file_id: f.id,
                  }),
                )
              }
            >
              {f.filename}
            </button>
          ))}
        </div>
      ) : !closed || correction ? (
        <div className="space-y-3">
          {task.attribute === "voltage" && (
            <div className="flex gap-2">
              {["220", "380", "غير محدد"].map((v) => (
                <button
                  key={v}
                  disabled={!writable || busy}
                  onClick={() => {
                    setValue(v)
                    setUnit(v === "غير محدد" ? "" : "V")
                  }}
                  className="border rounded-lg px-3 py-2 text-sm disabled:opacity-40"
                >
                  {v === "غير محدد" ? v : `${v}V`}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              aria-label="الإجابة المؤكدة"
              placeholder="اكتب الإجابة"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={!writable || busy}
              className="min-w-0 flex-1 border rounded-xl px-3 py-2 text-sm"
            />
            <input
              aria-label="الوحدة"
              placeholder="الوحدة"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              disabled={!writable || busy}
              className="w-24 border rounded-xl px-3 py-2 text-sm"
            />
          </div>
          {value && (
            <div className="rounded-xl bg-neutral-50 p-3 text-sm">
              <span className="block text-[10px] text-neutral-500 mb-1">
                الرد المقترح
              </span>
              {replyPreview(task, value, unit)}
            </div>
          )}
          <button
            disabled={!writable || busy || !value.trim()}
            onClick={() =>
              act(async () => {
                await answerProcurementTask(task.id, {
                  value: value.trim(),
                  unit: unit.trim() || undefined,
                  revision: current.revision,
                  idempotency_key: crypto.randomUUID(),
                  correction,
                })
                if (correction) {
                  setImpact(await getProcurementImpact(task.id))
                  setCorrection(false)
                } else
                  setEcho(
                    "حُفظت الإجابة. الإرسال قيد المتابعة؛ تظهر نتيجة كل مورد أدناه.",
                  )
                setValue("")
                setUnit("")
              })
            }
            className="rounded-xl bg-[#123F3A] text-white px-5 py-2.5 font-bold text-sm disabled:opacity-40"
          >
            {busy ? "جارٍ الحفظ…" : correction ? "حفظ التصحيح" : "إرسال الإجابة"}
          </button>
        </div>
      ) : (
        <button
          disabled={!writable || busy}
          className="text-sm underline text-[#123F3A] disabled:opacity-40"
          onClick={() => {
            setCorrection(true)
            setValue(String(current.answer?.value || ""))
            setUnit(current.answer?.unit || "")
          }}
        >
          تصحيح الإجابة المؤكدة
        </button>
      )}
      {impact && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2 text-sm">
          <p>
            هذا التعديل يؤثر على {impact.recipients.length} محادثات موردين لديهم
            هذا البند.
          </p>
          <p>{impact.text}</p>
          <div className="flex gap-3">
            <button
              disabled={!writable || busy}
              onClick={() =>
                act(async () => {
                  const r = await broadcastProcurementAnswer(
                    task.id,
                    impact.hash,
                  )
                  setImpact(null)
                  setEcho(
                    `جُهّز التحديث لـ${r.queued} محادثات. تابع نتيجة الإرسال.`,
                  )
                })
              }
              className="font-bold text-[#123F3A]"
            >
              إرسال التحديث للـ{impact.recipients.length}
            </button>
            <button onClick={() => setImpact(null)}>عدم الإرسال</button>
          </div>
        </div>
      )}
      {current.waiters?.length ? (
        <details>
          <summary className="cursor-pointer text-xs text-neutral-600">
            الموردون والسؤال الأصلي وحالة الإرسال
          </summary>
          <div className="space-y-2 mt-3">
            {current.waiters.map((w) => (
              <div key={w.id} className="border-t pt-2 text-xs">
                <div className="flex justify-between gap-2">
                  <b>{w.supplier_name}</b>
                  <button
                    onClick={() => onConversation(w.invite_id)}
                    className="underline text-[#123F3A]"
                  >
                    عرض المحادثة
                  </button>
                </div>
                <p className="my-1 whitespace-pre-wrap">
                  {w.original_question}
                </p>
                <span className="text-neutral-500">
                  {({
                    WAITING: "ينتظر الإجابة",
                    READY: "جاهز للإرسال",
                    PROCESSING: "قيد الإرسال",
                    SENT: "قبله مسار الإرسال",
                    FAILED: "تعذر الإرسال",
                    UNKNOWN: "نتيجة غير مؤكدة تحتاج مراجعة",
                    HUMAN_HELD: "الموظف استلم المحادثة",
                    SUPERSEDED: "سؤال مكرر ضمن المحادثة",
                  } as Record<string, string>)[w.state] || w.state}
                </span>
                {w.failure_code && (
                  <p className="text-red-700">{w.failure_code}</p>
                )}
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {writable && current.waiters?.some((w) => w.state === "FAILED") && (
        <button
          disabled={busy}
          onClick={() => act(() => retryProcurementTask(task.id))}
          className="text-sm underline"
        >
          إعادة محاولة الإرسال الفاشل المؤكد
        </button>
      )}
      {writable &&
        (current.state === "SENT_TO_SUPPLIERS" ||
          (task.kind === "HUMAN_REVIEW_REQUIRED" && !closed)) && (
          <button
            disabled={busy}
            onClick={() =>
              act(() => closeProcurementTask(task.id, current.revision))
            }
            className="text-sm underline"
          >
            {task.kind === "HUMAN_REVIEW_REQUIRED"
              ? "أنهيت المراجعة"
              : "إغلاق المهمة"}
          </button>
        )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {echo && (
        <p role="status" className="text-sm text-green-800">
          {echo}
        </p>
      )}
    </article>
  )
}
export default function ProcurementInboxView({
  navigate,
}: {
  navigate: (view: AppView) => void
}) {
  const { openInboxThread: openThread, openRfq } = useProcurement()
  const [data, setData] = useState<ProcurementTaskList | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState<"tasks" | "shadow">("tasks"),
    [cases, setCases] = useState<ProcurementShadowCase[]>([]),
    [showClosed, setShowClosed] = useState(false),
    [refresh, setRefresh] = useState(0),
    [memberLabels, setMemberLabels] = useState<Record<string, string>>({})
  useEffect(() => {
    let active = true
    void listCompanyMembers()
      .then((r) => {
        if (active)
          setMemberLabels(
            Object.fromEntries(
              r.members.map((m) => [
                m.user_id,
                m.label || m.email || "موظف المشتريات",
              ]),
            ),
          )
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const d = await listProcurementTasks()
        if (active) {
          setData(d)
          setError("")
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "تعذر تحميل أسئلة الموردين")
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    const timer = setInterval(load, 15000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [refresh])
  useEffect(() => {
    if (tab !== "shadow") return
    let active = true
    listProcurementShadows()
      .then((r) => {
        if (active) setCases(r.cases)
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "تعذر تحميل المقارنة")
      })
    return () => {
      active = false
    }
  }, [tab, refresh])
  const tasks = (data?.tasks || []).filter(
    (t) => showClosed || !["CLOSED", "SENT_TO_SUPPLIERS"].includes(t.state),
  )
  const differences = cases.filter(
    (c) => (c.old_reply || "") !== (c.new_decision.reply || ""),
  )
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5" dir="rtl">
      <div className="flex justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-[#0D1F1D]">أسئلة الموردين</h1>
          <p className="text-sm text-neutral-500 mt-1">
            جاوب مرة، وتصل المعلومة لكل مورد ينتظرها.
          </p>
        </div>
        <button
          className="text-sm underline"
          onClick={() => setRefresh((n) => n + 1)}
        >
          تحديث
        </button>
      </div>
      {data?.mode === "SHADOW" && (
        <p className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900">
          وضع المقارنة فقط. القرارات الجديدة لا ترسل رسائل ولا تنشئ مهام
          تشغيلية.
        </p>
      )}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            [data.summary.needs_intervention, "تحتاج تدخلك"],
            [data.summary.waiting_suppliers, "موردون ينتظرون"],
            [data.summary.solved_today, "محلولة اليوم"],
            [data.summary.blocking_tasks, "تمنع التسعير"],
          ].map(([n, label]) => (
            <div key={String(label)} className="bg-white border rounded-xl p-4">
              <b className="text-2xl text-[#123F3A]">{n}</b>
              <p className="text-xs text-neutral-500 mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-4 border-b pb-3 text-sm">
        <button
          className={
            tab === "tasks" ? "font-bold text-[#123F3A]" : "text-neutral-500"
          }
          onClick={() => setTab("tasks")}
        >
          مهام المشتريات
        </button>
        <button
          className={
            tab === "shadow" ? "font-bold text-[#123F3A]" : "text-neutral-500"
          }
          onClick={() => setTab("shadow")}
        >
          مقارنة ردود أحمد
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
          <p className="mt-1">
            البيانات غير متاحة حاليًا؛ لا يعني ذلك أن جميع الأسئلة محلولة.
          </p>
        </div>
      )}
      {loading && (
        <p role="status" className="text-sm text-neutral-500">
          جارٍ تحميل أسئلة الموردين…
        </p>
      )}
      {tab === "tasks" ? (
        <>
          <label className="flex gap-2 text-xs">
            <input
              type="checkbox"
              checked={showClosed}
              onChange={(e) => setShowClosed(e.target.checked)}
            />
            عرض المهام المرسلة والمغلقة
          </label>
          <div className="grid lg:grid-cols-2 gap-4">
            {tasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                memberLabels={memberLabels}
                live={data?.mode === "LIVE"}
                onRefresh={() => setRefresh((n) => n + 1)}
                onConversation={(id) => openThread(id)}
                onRfq={(id) => openRfq(id)}
              />
            ))}
          </div>
          {!loading && !error && !tasks.length && (
            <p className="rounded-xl border bg-white p-6 text-sm text-neutral-600">
              لا توجد مهام ضمن هذا العرض.
            </p>
          )}
        </>
      ) : (
        <div className="space-y-4">
          {differences.map((c) => (
            <article
              key={c.message_id}
              className="border rounded-2xl bg-white p-5 space-y-3 text-sm"
            >
              <h2 className="font-bold">رسالة المورد</h2>
              <p className="whitespace-pre-wrap">{c.supplier_message}</p>
              <details>
                <summary className="cursor-pointer text-xs">
                  السياق السابق
                </summary>
                {c.new_decision.context?.lines?.map((line) => (
                  <p key={line.line_key} className="text-xs mt-2">
                    البند: {line.name}، الكمية: {line.quantity ?? "غير محددة"}{" "}
                    {line.uom || ""}
                    {line.technical_specification &&
                    Object.keys(line.technical_specification).length > 0
                      ? `، المواصفات: ${JSON.stringify(line.technical_specification)}`
                      : ""}
                  </p>
                ))}
                {c.new_decision.context?.history.map((m, i) => (
                  <p key={i} className="text-xs mt-2">
                    {m.from === "SUPPLIER" ? "المورد" : "فريق المشتريات"}:{" "}
                    {m.text}
                  </p>
                ))}
              </details>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="bg-neutral-50 p-3 rounded-xl">
                  <b>الرد القديم</b>
                  <p className="mt-1 whitespace-pre-wrap">
                    {c.old_reply || "لا يوجد رد مرسل مؤكد في السجل"}
                  </p>
                </div>
                <div className="bg-green-50 p-3 rounded-xl">
                  <b>القرار الجديد</b>
                  <p className="mt-1 whitespace-pre-wrap">
                    {c.new_decision.reply ||
                      ({
                        NO_REPLY: "لا رد",
                        HUMAN_REVIEW: "يحتاج تدخلًا بشريًا",
                      } as Record<string, string>)[c.new_decision.decision] ||
                      c.new_decision.decision}
                  </p>
                </div>
              </div>
              <p>
                النية:{" "}
                {c.new_decision.intents
                  ?.map(
                    (i) => `${i.intent} (${Math.round(i.confidence * 100)}%)`,
                  )
                  .join("، ")}
              </p>
              <p>الإجراء: {c.new_decision.action}</p>
              <p>
                سبب الاختلاف:{" "}
                {c.new_decision.reason ||
                  "القرار مبني على المعلومات والخطوة المطلوبة"}
              </p>
              <ul className="text-xs space-y-1">
                {c.new_decision.facts?.map((f, i) => (
                  <li key={i}>
                    {f.attribute}: {JSON.stringify(f.value)}
                  </li>
                ))}
              </ul>
              <button
                className="underline text-[#123F3A]"
                onClick={() => openThread(c.invite_id)}
              >
                عرض المحادثة
              </button>
            </article>
          ))}
          {!error && !differences.length && (
            <p className="text-sm text-neutral-500">
              لا توجد اختلافات مسجلة ضمن العينة المعروضة بعد.
            </p>
          )}
        </div>
      )}
      <button
        className="text-xs underline text-neutral-500"
        onClick={() => navigate("inbox")}
      >
        العودة للمراسلات
      </button>
    </main>
  )
}
