/**
 * «حالة العرض»: the head card (status chip, countdown, company, reference,
 * quote version), the outcome note, and «مسار الطلب» — a vertical path with a
 * real date on every step that has one. Frames 2a / 2c / 2d / F1.
 */
import type { SupplierRequest } from '../../api/supplierPortalClient'
import {
  deadlineChip,
  isSubmissionClosed,
  linesAr,
  outcomeNote,
  requestStatusChip,
  shortCompany,
  timelineRows,
  type StepTone,
  type TimelineRow,
} from '../../lib/supplierPortal'
import { Card, Chip, ChatIcon, ClockIcon, Notice } from './PortalChrome'

const DOT: Record<StepTone, string> = {
  done: 'bg-[#123F3A] border-[#123F3A]',
  awarded: 'bg-[#1a7a45] border-[#1a7a45]',
  upcoming: 'bg-white border-neutral-400',
  unknown: 'bg-white border-neutral-300',
  muted: 'bg-neutral-400 border-neutral-400',
}

const LABEL: Record<StepTone, string> = {
  done: 'font-bold text-[#0D1F1D]',
  awarded: 'font-bold text-[#1a7a45]',
  upcoming: 'font-semibold text-neutral-600',
  unknown: 'font-semibold text-neutral-400',
  muted: 'font-bold text-neutral-600',
}

export function Timeline({ rows }: { rows: TimelineRow[] }) {
  return (
    <ol className="relative">
      {rows.map((row, index) => (
        <li key={`${row.kind}-${index}`} className="relative flex gap-3 pb-5 last:pb-0" data-tone={row.tone}>
          <div className="relative flex flex-col items-center w-3 flex-shrink-0 pt-1.5">
            <span className={`w-2.5 h-2.5 rounded-full border-[1.5px] ${DOT[row.tone]}`} />
            {index < rows.length - 1 && <span className="absolute top-5 bottom-[-4px] w-px bg-neutral-200" />}
          </div>
          <div className="min-w-0">
            <div className={`text-[11px] ${row.tone === 'unknown' ? 'text-neutral-400' : 'text-neutral-500'}`}>{row.detail}</div>
            <div className={`text-[14px] leading-snug ${LABEL[row.tone]}`}>{row.label}</div>
          </div>
        </li>
      ))}
    </ol>
  )
}

export function StatusPanel({
  request,
  onMessage,
  now,
}: {
  request: SupplierRequest
  onMessage: (() => void) | null
  now: number
}) {
  const chip = requestStatusChip(request)
  const countdown = deadlineChip(request.deadline, now, isSubmissionClosed(request))
  const note = outcomeNote(request)
  const rows = timelineRows(request.status_timeline, request.deadline)
  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Chip tone={chip.tone}>{chip.text}</Chip>
          {countdown && (
            <Chip tone={countdown.tone} icon={<ClockIcon className="w-3.5 h-3.5" />}>
              {countdown.text}
            </Chip>
          )}
        </div>
        <div className="text-[18px] font-black text-[#0D1F1D] leading-snug">{request.buyer_company || 'المشتري'}</div>
        <div className="text-[12px] text-neutral-500 mt-1">
          {[request.reference ? `طلب ${request.reference}‏` : 'طلب', request.line_count ? linesAr(request.line_count) : null]
            .filter(Boolean)
            .join(' · ')}
        </div>
        {request.quote_version ? (
          <div className="text-[12px] text-neutral-500 mt-1">عرضك: النسخة {request.quote_version}</div>
        ) : null}
      </Card>

      {note && <Notice tone={note.tone}>{note.text}</Notice>}

      <Card>
        <div className="text-[14px] font-bold text-[#0D1F1D] mb-4">مسار الطلب</div>
        <Timeline rows={rows} />
        <div className="text-[11px] text-neutral-400 mt-5">التواريخ بتوقيت الرياض. ما نعرض تاريخ ما وصلنا.</div>
      </Card>

      {onMessage && (
        <button
          type="button"
          onClick={onMessage}
          className="w-full flex items-center justify-center gap-2 py-3.5 bg-white border border-neutral-200 rounded-xl text-sm font-bold text-[#123F3A]"
        >
          <ChatIcon className="w-4 h-4" />
          راسل {shortCompany(request.buyer_company || 'المشتري')}
        </button>
      )}
    </div>
  )
}

export default StatusPanel
