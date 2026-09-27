import { useState } from 'react'
import { ChevronLeftIcon, FileIcon, LockIcon, XIcon } from '../../icons'
import {
  SEALED_PRICE_LABEL,
  formatAmount,
  formatEventTime,
  type PanelLine,
  type QuoteEvent,
  type SupplierPanelModel,
  type TimelineState,
} from '../../lib/supplierPanel'
import { ACCOUNT_LABEL, accountKey } from '../../lib/inboxFilters'

const LINE_CHIP: Record<PanelLine['status'], string> = {
  PRICED: 'bg-mint text-mint-700',
  DECLINED: 'bg-red-50 text-red-700',
  NOT_QUOTED: 'bg-amber-50 text-amber-800',
  SEALED: 'bg-neutral-100 text-neutral-600',
  OTHER: 'bg-neutral-100 text-neutral-600',
}

const DOT: Record<TimelineState, string> = {
  done: 'bg-farq border-farq',
  awarded: 'bg-mint-700 border-mint-700',
  upcoming: 'bg-white border-neutral-400',
  unknown: 'bg-white border-neutral-200',
}

export type SupplierPanelProps = {
  model: SupplierPanelModel | null
  loading: boolean
  partial: boolean
  /** The request this conversation belongs to; null = none linked. */
  rfqId: string | null
  /** Lines requested from this supplier (thread item package), shown when the offer has none yet. */
  requestedLines?: number | null
  /** Only when the thread row carries it (the list API does not today). */
  accountStatus?: string | null
  onClose: () => void
  onOpenRfq: (rfqId: string) => void
}

/**
 * «ملخص المورد» beside the chat: what he quoted per line, at what price
 * (or «مختوم حتى فتح الأظرف»), and the path of his offer so far.
 */
export function SupplierPanel({ model, loading, partial, rfqId, requestedLines, accountStatus, onClose, onOpenRfq }: SupplierPanelProps) {
  const [allLines, setAllLines] = useState(false)
  const account = accountKey(accountStatus)
  const lines = model?.lines || []
  const shown = allLines ? lines : lines.slice(0, 5)

  return (
    <aside aria-label="ملخص المورد" className="flex flex-col h-full min-h-0 bg-white">
      <div className="flex-shrink-0 flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="text-base font-black text-[#0D1F1D]">ملخص المورد</h2>
        <button type="button" onClick={onClose} aria-label="إغلاق ملخص المورد" className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-600 hover:bg-neutral-100">
          <XIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 space-y-4">
        {!rfqId && <p className="text-xs text-neutral-500 leading-relaxed">لا طلب مرتبط بهذه المحادثة — لا عرض نلخّصه.</p>}

        {rfqId && loading && !model && (
          <div className="space-y-2 animate-pulse" aria-hidden="true">
            <div className="h-6 w-2/3 rounded-full bg-neutral-100" />
            <div className="h-12 rounded-xl bg-neutral-100" />
            <div className="h-12 rounded-xl bg-neutral-100" />
            <div className="h-12 rounded-xl bg-neutral-100" />
          </div>
        )}

        {partial && (
          <p className="text-[11px] text-amber-800 bg-amber-50 rounded-xl px-3 py-2 leading-relaxed">
            تعذّر قراءة جزء من بيانات الطلب — المعروض هو ما وصل فقط.
          </p>
        )}

        {model && (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              {account && (
                <span className="inline-flex rounded-full bg-mint text-mint-700 px-2.5 py-1 text-[11px] font-bold">
                  الحساب {ACCOUNT_LABEL[account]}
                </span>
              )}
              {model.quoteStatus === 'submitted' ? (
                <span className="inline-flex rounded-full bg-farq-100 text-farq px-2.5 py-1 text-[11px] font-bold">
                  قدّم عرضاً{model.quoteVersion && model.quoteVersion > 1 ? ` · النسخة ${model.quoteVersion}` : ''}
                </span>
              ) : model.quoteStatus === 'not_submitted' ? (
                <span className="inline-flex rounded-full bg-amber-50 text-amber-800 px-2.5 py-1 text-[11px] font-bold">لم يقدّم عرضاً بعد</span>
              ) : null}
            </div>

            {model.sealed && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-900 leading-relaxed">
                <LockIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>ظرف مختوم — الأسعار تظهر بعد فتح الأظرف.</span>
              </div>
            )}

            {!model.sealed && model.total != null && (
              <div className="flex items-baseline justify-between rounded-xl bg-farq-50 px-3 py-2.5">
                <span className="text-xs text-neutral-500">الإجمالي</span>
                <span className="text-base font-black text-[#0D1F1D]">{formatAmount(model.total, model.currency)}</span>
              </div>
            )}

            {lines.length === 0 && requestedLines != null && requestedLines > 0 && (
              <p className="text-xs text-neutral-600 leading-relaxed">
                طُلب منه {requestedLines} {requestedLines > 2 && requestedLines < 11 ? 'بنود' : 'بند'} — تظهر حالتها بنداً بنداً بعد أن يقدّم عرضه.
              </p>
            )}

            {lines.length > 0 && (
              <section>
                <h3 className="text-sm font-black text-[#0D1F1D] mb-1">البنود ({lines.length})</h3>
                <ul className="divide-y divide-neutral-100">
                  {shown.map((line) => (
                    <li key={line.key} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p dir="auto" className="text-[13px] font-bold text-[#0D1F1D] leading-snug break-words">{line.name}</p>
                        {line.quantity != null && (
                          <p className="text-[11px] text-neutral-500">
                            {line.quantity.toLocaleString('en-US')} {line.uom || ''}
                          </p>
                        )}
                      </div>
                      <div className="flex-shrink-0 flex flex-col items-end gap-1">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${LINE_CHIP[line.status]}`}>{line.statusLabel}</span>
                        <span className="text-[10px] text-neutral-500">
                          {model.sealed
                            ? SEALED_PRICE_LABEL
                            : line.unitPrice != null
                              ? `${formatAmount(line.unitPrice, line.currency)}${line.uom ? `/${line.uom}` : ''}`
                              : ''}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
                {lines.length > 5 && (
                  <button type="button" onClick={() => setAllLines((v) => !v)} className="text-xs font-bold text-farq hover:underline mt-1">
                    {allLines ? 'عرض أقل' : `+ ${lines.length - 5} بنود`}
                  </button>
                )}
              </section>
            )}

            {model.timeline.length > 0 && (
              <section>
                <h3 className="text-sm font-black text-[#0D1F1D] mb-2">مسار العرض</h3>
                <ol className="relative">
                  {model.timeline.map((step, index) => (
                    <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0">
                      {index < model.timeline.length - 1 && (
                        <span className="absolute top-3 bottom-0 start-[5px] w-px bg-neutral-200" aria-hidden="true" />
                      )}
                      <span className={`relative mt-1 w-[11px] h-[11px] rounded-full border-2 flex-shrink-0 ${DOT[step.state]}`} aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-[11px] text-neutral-500">
                          {step.state === 'unknown' && !step.at
                            ? 'غير معروفة بعد'
                            : step.state === 'upcoming'
                              ? `موعده ${formatEventTime(step.at)}`
                              : formatEventTime(step.at)}
                        </p>
                        <p className={`text-[13px] ${step.state === 'done' || step.state === 'awarded' ? 'font-black text-[#0D1F1D]' : 'text-neutral-600'}`}>
                          {step.title}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
      </div>

      {rfqId && (
        <div className="flex-shrink-0 px-4 pb-4 pt-2">
          <button
            type="button"
            onClick={() => onOpenRfq(rfqId)}
            className="w-full rounded-xl border border-neutral-200 py-2.5 text-sm font-bold text-farq hover:border-farq/40"
          >
            فتح ملف الطلب
          </button>
        </div>
      )}
    </aside>
  )
}

/** A platform card in the chat when a quote, or a new version of it, arrives. */
export function QuoteCard({
  event,
  sealed,
  lineCount,
  onOpen,
}: {
  event: QuoteEvent
  sealed: boolean
  /** Lines requested from this supplier, for «وصل عرض — 7 بنود». */
  lineCount: number | null
  onOpen?: () => void
}) {
  const newVersion = event.version > 1
  const title = newVersion
    ? `نسخة جديدة من العرض (${event.version})`
    : `وصل عرض${lineCount ? ` — ${lineCount} ${lineCount > 10 || lineCount < 3 ? 'بند' : 'بنود'}` : ''}`
  const when = formatEventTime(event.at)
  const subtitle = sealed
    ? 'الأسعار مخفية — ظرف مختوم حتى فتح الأظرف'
    : newVersion
      ? when
      : when
        ? `أُرسل ${when}`
        : ''
  return (
    <div
      className={`w-full max-w-[360px] rounded-2xl bg-white border-[1.5px] p-3.5 flex flex-col gap-2.5 ${
        newVersion && !sealed ? 'border-mint' : 'border-farq-100'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex-shrink-0 w-9 h-9 rounded-[10px] bg-farq-100 text-farq flex items-center justify-center">
          {sealed ? <LockIcon className="w-[18px] h-[18px]" /> : <FileIcon className="w-[18px] h-[18px]" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-[#0D1F1D] truncate">{title}</p>
          {subtitle && <p className="text-[11px] text-neutral-500 truncate">{subtitle}</p>}
        </div>
      </div>
      {(sealed || event.total != null) && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-500">الإجمالي</span>
          {sealed ? (
            <span className="text-[13px] font-black text-neutral-500">السعر مخفي</span>
          ) : (
            <span className="text-lg font-black text-[#0D1F1D]">{formatAmount(event.total, event.currency)}</span>
          )}
        </div>
      )}
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          className="w-full inline-flex items-center justify-center gap-1 rounded-xl bg-farq-50 py-2 text-xs font-bold text-farq hover:bg-farq-100"
        >
          عرض التفاصيل
          <ChevronLeftIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
