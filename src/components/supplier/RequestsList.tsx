/** «طلباتك» — every request this supplier holds, across companies (frame 2b). */
import type { SupplierRequest } from '../../api/supplierPortalClient'
import {
  companyInitial,
  deadlineChip,
  formatDayMonthAr,
  isSubmissionClosed,
  linesAr,
  requestStatusChip,
} from '../../lib/supplierPortal'
import { ChevronStartIcon, Chip, ClockIcon } from './PortalChrome'

function companiesAr(n: number): string {
  if (n === 1) return 'شركة واحدة'
  if (n === 2) return 'شركتين'
  return n <= 10 ? `${n} شركات` : `${n} شركة`
}

function requestsAr(n: number): string {
  if (n === 1) return 'طلب واحد'
  if (n === 2) return 'طلبين'
  return n <= 10 ? `${n} طلبات` : `${n} طلب`
}

export function RequestsList({
  requests,
  onOpen,
  now,
}: {
  requests: SupplierRequest[]
  onOpen: (inviteId: string) => void
  now: number
}) {
  const companies = new Set(requests.map((r) => r.buyer_company).filter(Boolean)).size || requests.length
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-[24px] font-black text-[#0D1F1D]">طلباتك</h1>
        <p className="text-[12px] text-neutral-500">
          {requestsAr(requests.length)} من {companiesAr(companies)}
        </p>
      </div>
      {requests.length === 0 && (
        <div className="bg-white border border-neutral-100 rounded-2xl p-6 text-center text-sm text-neutral-500">
          ما عندكم طلبات حالياً.
        </div>
      )}
      {requests.map((request) => {
        const chip = requestStatusChip(request)
        const closed = isSubmissionClosed(request)
        const countdown = deadlineChip(request.deadline, now, closed)
        const meta = [
          request.reference ? `طلب ${request.reference}‏` : null,
          request.line_count ? linesAr(request.line_count) : null,
          request.deadline ? (closed ? formatDayMonthAr(request.deadline) : `يُغلق ${formatDayMonthAr(request.deadline)}`) : null,
        ]
          .filter(Boolean)
          .join(' · ')
        return (
          <button
            key={request.invite_id}
            type="button"
            onClick={() => onOpen(request.invite_id)}
            className="w-full text-start bg-white border border-neutral-100 rounded-2xl p-4 flex items-center gap-3 hover:border-[#123F3A]/30"
          >
            <span className="w-10 h-10 flex-shrink-0 rounded-xl bg-[#e0efec] text-[#123F3A] font-black flex items-center justify-center">
              {companyInitial(request.buyer_company)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-[#0D1F1D] truncate">{request.buyer_company || 'المشتري'}</span>
              {meta && <span className="block text-[11px] text-neutral-500 mt-0.5">{meta}</span>}
              <span className="mt-2 flex flex-wrap gap-1.5">
                <Chip tone={chip.tone}>{chip.text}</Chip>
                {countdown && (
                  <Chip tone={countdown.tone} icon={<ClockIcon className="w-3.5 h-3.5" />}>
                    {countdown.text}
                  </Chip>
                )}
              </span>
            </span>
            {request.unread_count > 0 && (
              <span className="flex-shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-[#123F3A] text-white text-[10px] font-bold flex items-center justify-center" aria-label={`${request.unread_count} رسائل غير مقروءة`}>
                {request.unread_count}
              </span>
            )}
            <ChevronStartIcon className="w-4 h-4 flex-shrink-0 text-neutral-400" />
          </button>
        )
      })}
    </div>
  )
}

export default RequestsList
