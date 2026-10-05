import { useEffect, useState } from 'react'
import {
  ConstructionApiError,
  getConstructionPrewarm,
  getPrewarmCapabilities,
  type ConstructionPrewarmIntelligence,
} from '../../api/constructionClient'

export default function PrewarmIntelligence({ rfqId }: { rfqId: string }) {
  const [data, setData] = useState<ConstructionPrewarmIntelligence | null>(null)
  const [error, setError] = useState(false)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    let alive = true
    setData(null)
    setError(false)
    setExpanded(false)
    getPrewarmCapabilities()
      .then((capabilities) => capabilities.can_release ? getConstructionPrewarm(rfqId) : { rfq_id: rfqId, enabled: false, lines: [] })
      .then((result) => {
        if (alive) setData(result)
      })
      .catch((err) => {
        if (
          alive &&
          !(
            err instanceof ConstructionApiError &&
            (['PREWARM_DISABLED', 'PREWARM_UNAVAILABLE'].includes(err.code) ||
              err.status === 404)
          )
        )
          setError(true)
      })
    return () => {
      alive = false
    }
  }, [rfqId])
  const rows =
    data?.lines.flatMap((line) =>
      line.intelligence.map((evidence) => ({
        ...evidence,
        lineId: line.line_id,
        lineName: line.line_name,
      })),
    ) || []
  const seen = new Set<string>()
  const cards = rows.filter((row) => {
    const key = `${row.lineId}:${row.supplier_id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (error)
    return (
      <p
        role="alert"
        className="rounded-xl bg-amber-50 text-amber-900 text-sm p-3"
      >
        تعذر تحديث المعرفة السابقة. أعد فتح الطلب للمحاولة.
      </p>
    )
  if (!rows.length) return null
  return (
    <section
      className="rounded-2xl border border-[#cce6da] bg-[#f2faf6] p-4 my-4"
      aria-label="المعرفة السابقة عن البنود"
    >
      <h2 className="font-black text-[#123F3A]">سبق العمل على هذه المواد</h2>
      <p className="text-xs text-neutral-600 mt-2">
        هذه معرفة تاريخية وليست عروضًا جديدة للطلب. الربط لا يرسل رسالة للمورد.
        الردود الجديدة تُتابع ضمن دعوة الطلب الحالي.
      </p>
      <div className="grid sm:grid-cols-2 gap-2 mt-3">
        {(expanded ? cards : cards.slice(0, 8)).map((row) => (
          <div
            key={`${row.lineId}:${row.evidence_id}`}
            className="bg-white rounded-xl p-3 text-sm"
          >
            <p className="text-xs font-bold text-neutral-600 mb-1">
              {row.lineName}
            </p>
            <strong>{row.supplier_name}</strong>
            <p className="text-xs mt-1 text-[#123F3A]">
              {row.tier === 'A'
                ? 'نفس المادة والمواصفات الحرجة'
                : row.tier === 'B'
                  ? 'مكافئ — لترشيح المورد فقط'
                  : 'نفس العائلة — مورد مرشح'}
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              {row.kind === 'PRICED'
                ? 'سبق أن قدم سعرًا'
                : row.kind === 'RESPONDED'
                  ? 'سبق أن رد'
                  : 'لديه معرفة سابقة بالمادة'}
            </p>
            {row.message && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer font-bold">
                  رسالة سابقة معتمدة للمشاركة
                </summary>
                <p className="text-neutral-500 my-2">
                  {new Date(row.message.created_at || '').toLocaleString(
                    'ar-SA-u-ca-gregory-nu-latn',
                  )}{' '}
                  · {row.message.channel} · {row.message.employee_name}
                </p>
                <p className="whitespace-pre-wrap">{row.message.body_text}</p>
              </details>
            )}
          </div>
        ))}
      </div>
      {cards.length > 8 && (
        <button
          className="text-sm font-bold underline mt-3"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'عرض أقل' : `عرض جميع الموردين والبنود (${cards.length})`}
        </button>
      )}
    </section>
  )
}
