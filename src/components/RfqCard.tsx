import type { RFQSummary } from '../types'

const STATUS: Record<RFQSummary['status'], { label: string; cls: string }> = {
  active: { label: 'بانتظار العروض', cls: 'bg-amber-50 text-amber-700' },
  awarded: { label: 'تمت الترسية', cls: 'bg-[#CFF5DC] text-[#1a7a45]' },
  draft: { label: 'مسودة', cls: 'bg-neutral-100 text-neutral-500' },
  closed: { label: 'مغلق', cls: 'bg-neutral-100 text-neutral-500' },
}

/** One step of the request's progress: how many of the invited suppliers got there. */
function Step({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between gap-1 mb-1">
        <span className="text-[11px] text-neutral-500">{label}</span>
        <span className="text-xs font-bold text-[#0D1F1D] tabular-nums">
          {value}
          <span className="text-neutral-400 font-medium">/{total}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/**
 * A request as the buyer recognises it: the project first, the reference the
 * suppliers were given, and how far it has got — reached, answered, quoted —
 * with the time left before quotes close.
 */
export function RfqCard({ rfq, onOpen }: { rfq: RFQSummary; onOpen: () => void }) {
  const status = STATUS[rfq.status]
  const total = rfq.suppliers || 0
  const showProgress = rfq.status !== 'draft' && total > 0
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full bg-white border border-neutral-100 rounded-2xl px-5 py-4 hover:border-[#123F3A]/30 hover:shadow-sm transition-all text-right"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-black text-[#0D1F1D] text-base leading-snug truncate">{rfq.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-500">
            {rfq.reference && <span dir="ltr" className="font-mono text-[11px] text-neutral-400">{rfq.reference}</span>}
            {rfq.subtitle && <span>{rfq.subtitle}</span>}
            <span>· {rfq.items} {rfq.items === 1 ? 'بند' : 'بنود'}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${status.cls}`}>{status.label}</span>
          {rfq.closesLabel && (
            <span className={`text-[11px] font-semibold ${rfq.closesUrgent ? 'text-red-600' : 'text-neutral-400'}`}>
              {rfq.closesLabel}
            </span>
          )}
        </div>
      </div>
      {showProgress && (
        <div className="mt-3 flex gap-3">
          <Step label="وصلهم الطلب" value={rfq.sent ?? total} total={total} tone="bg-[#123F3A]/40" />
          <Step label="ردّوا" value={rfq.replied ?? 0} total={total} tone="bg-[#2F6CB5]/70" />
          <Step label="قدّموا عرضًا" value={rfq.offers} total={total} tone="bg-[#1a7a45]" />
        </div>
      )}
    </button>
  )
}

export default RfqCard
