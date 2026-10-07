import { supplierCountForDisplay } from "../../lib/supplierCountVisibility"
import { useActualSupplierCounts } from "../priceReview/useActualSupplierCounts"
import { useEffect, useState } from "react"
import {
  getProcurementSummary,
  type ProcurementSummary,
} from "../../api/constructionClient"
export default function ProcurementStatus({
  rfqId,
  onOpen,
}: {
  rfqId: string
  onOpen: () => void
}) {
  const canViewActualCounts = useActualSupplierCounts()
  const [data, setData] = useState<ProcurementSummary | null>(null)
  useEffect(() => {
    let active = true
    setData(null)
    const load = () =>
      getProcurementSummary(rfqId)
        .then((d) => {
          if (active) setData(d)
        })
        .catch(() => {
          if (active) setData(null)
        })
    void load()
    const timer = setInterval(load, 30000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [rfqId])
  if (!data) return null
  return (
    <section
      className="rounded-2xl border border-neutral-200 bg-white p-4 my-4"
      aria-label="موقف التسعير"
    >
      <div className="flex justify-between gap-3">
        <h2 className="font-bold text-[#123F3A]">وش موقف التسعير؟</h2>
        <button onClick={onOpen} className="text-xs font-bold text-[#123F3A]">
          أسئلة الموردين ←
        </button>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm mt-3">
        {[
          [data.needs_intervention, "طلبات تحتاج تدخلك"],
          [data.waiting_suppliers, "موردون ينتظرون إجابة"],
          [data.solved_today, "أسئلة محلولة اليوم"],
          [data.blocking_tasks, "أسئلة تمنع التسعير"],
        ].map(([n, label]) => (
          <span key={String(label)}>
            <b>{n}</b> {label}
          </span>
        ))}
      </div>
      {data.quote_status && (
        <p className="text-xs text-neutral-600 mt-3">
          {supplierCountForDisplay(data.quote_status.contacted, canViewActualCounts)} تمت مراسلتهم ·{" "}
          {data.quote_status.replied} ردوا · {data.quote_status.priced} قدّموا
          عروضًا · {data.quote_status.declined} اعتذروا ·{" "}
          {supplierCountForDisplay(data.quote_status.no_response, canViewActualCounts)} لم يردوا
        </p>
      )}
      <p className="text-[10px] text-neutral-400 mt-2">
        الأعداد بحسب محادثات النسخة الحالية. قد يرد المورد ويكون منتظرًا أو مسعّرًا
        في الوقت نفسه.
      </p>
    </section>
  )
}
