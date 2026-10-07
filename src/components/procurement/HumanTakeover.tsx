import { useEffect, useState } from "react"
import {
  getProcurementConversationState,
  setProcurementConversationMode,
  type ProcurementConversationState,
} from "../../api/constructionClient"
import { isReadOnlyBuild } from "../../api/readOnlyMode"
export default function HumanTakeover({
  inviteId,
  canWrite,
}: {
  inviteId: string
  canWrite: boolean
}) {
  const [state, setState] = useState<ProcurementConversationState | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  useEffect(() => {
    let active = true
    setState(null)
    setError("")
    const load = () =>
      getProcurementConversationState(inviteId)
        .then((s) => {
          if (active) setState(s)
        })
        .catch(() => {
          if (active) setState(null)
        })
    void load()
    const timer = setInterval(load, 30000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [inviteId])
  if (!state) return null
  return (
    <div className="flex flex-col items-end gap-1 text-xs">
      <span
        className={
          state.assistant_mode === "HUMAN"
            ? "text-amber-800"
            : "text-neutral-500"
        }
      >
        {state.assistant_mode === "HUMAN"
          ? "المحادثة مع فريق المشتريات"
          : state.mode === "SHADOW"
            ? "وضع المقارنة"
            : "أحمد يتابع المحادثة"}
      </span>
      <button
        disabled={!canWrite || busy || isReadOnlyBuild() || !state.can_takeover}
        className="rounded-lg border border-[#123F3A]/20 px-3 py-2 font-bold text-[#123F3A] disabled:opacity-40"
        onClick={async () => {
          setBusy(true)
          setError("")
          try {
            setState(
              await setProcurementConversationMode(
                inviteId,
                state.assistant_mode === "HUMAN" ? "AI" : "HUMAN",
                state.revision,
              ),
            )
          } catch (e) {
            setError(
              e instanceof Error &&
                e.message.includes("PROCUREMENT_HUMAN_SPEC_CONFLICT")
                ? "توجد مواصفة مختلفة عن الإجابة المؤكدة. اعتمد التصحيح في أسئلة الموردين قبل إرجاع أحمد."
                : e instanceof Error
                  ? e.message
                  : "تعذر تحديث وضع المحادثة",
            )
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy
          ? "جارٍ تحديث المحادثة…"
          : state.assistant_mode === "HUMAN"
            ? "إرجاع لأحمد"
            : "استلم المحادثة"}
      </button>
      {error && (
        <span role="alert" className="text-red-700 max-w-60">
          {error}
        </span>
      )}
    </div>
  )
}
