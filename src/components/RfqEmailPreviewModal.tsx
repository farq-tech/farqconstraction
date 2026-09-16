import { XIcon } from '../icons'
import type { RfqEmailPreview } from '../lib/rfqEmailPreview'

interface RfqEmailPreviewModalProps {
  preview: RfqEmailPreview
  onClose: () => void
}

/** Modal showing the Farq RFQ invite email as the supplier would receive it. */
export function RfqEmailPreviewModal({ preview, onClose }: RfqEmailPreviewModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl max-h-[92vh] bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-black text-[#0D1F1D]">معاينة إيميل طلب التسعير</div>
            <div className="text-xs text-neutral-500 mt-1 truncate" dir="ltr">
              من: {preview.from}
            </div>
            <div className="text-xs text-neutral-500 truncate" dir="ltr">
              إلى: {preview.to}
            </div>
            <div className="text-xs font-semibold text-[#123F3A] mt-1 truncate">
              الموضوع: {preview.subject}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 flex-shrink-0"
            aria-label="إغلاق"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto bg-[#f3f5f3] p-3 sm:p-5">
          <iframe
            title="معاينة الإيميل"
            sandbox=""
            srcDoc={preview.html}
            className="w-full min-h-[70vh] rounded-xl border-0 bg-transparent"
          />
        </div>
        <div className="px-5 py-3 border-t border-neutral-100 text-[11px] text-neutral-400">
          نفس قالب Farq (`rfqEmail`) المرسل عبر Resend — الرابط في المعاينة للتوضيح فقط.
        </div>
      </div>
    </div>
  )
}

export default RfqEmailPreviewModal
