import type { ConstructionReplyDraft } from '../../api/constructionClient'
import { NEEDS_HUMAN_LABEL } from '../../lib/supplierReply'

type ReplyDraftCardProps = {
  draft: ConstructionReplyDraft
  /** Sending, a write-disabled build, or a closed channel. */
  disabled: boolean
  busy: boolean
  onSend: (text: string) => void
  onEdit: (text: string) => void
  onDismiss: () => void
}

/**
 * The suggested answer to the supplier's latest message, above the composer.
 * Nothing leaves until the buyer presses «أرسل» (the normal reply path) — the
 * click is the approval. «عدّل» puts it in the box; «تجاهل» closes it.
 * A message only a person should answer shows «يحتاج رد منك» and no text.
 */
export default function ReplyDraftCard({ draft, disabled, busy, onSend, onEdit, onDismiss }: ReplyDraftCardProps) {
  const text = String(draft.text || '').trim()
  if (!text) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 mb-2">
        <span className="inline-flex items-center gap-2 text-[12px] font-bold text-amber-900">
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px]">{NEEDS_HUMAN_LABEL}</span>
          رسالة المورد تحتاج ردك أنت — ما في رد مقترح لها.
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={onDismiss}
          className="flex-shrink-0 text-[11px] font-bold text-amber-900 hover:underline disabled:opacity-40"
        >
          تجاهل
        </button>
      </div>
    )
  }
  return (
    <div className="rounded-2xl border border-[#123F3A]/15 bg-white px-3.5 py-2.5 mb-2">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-bold rounded-full bg-[#123F3A]/10 text-[#123F3A] px-2 py-0.5">رد مقترح</span>
        <span className="text-[10px] text-neutral-500">لا يُرسل إلا إذا ضغطت «أرسل»</span>
        {draft.needs_human && (
          <span className="text-[10px] font-bold rounded-full bg-amber-100 text-amber-900 px-2 py-0.5">{NEEDS_HUMAN_LABEL}</span>
        )}
      </div>
      <p dir="auto" className="text-[13px] text-[#0D1F1D] leading-relaxed whitespace-pre-line text-start">
        {text}
      </p>
      <div className="flex items-center gap-2 mt-2">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => onSend(text)}
          className="rounded-full bg-[#123F3A] text-white text-[11px] font-bold px-4 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? '…' : 'أرسل'}
        </button>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => onEdit(text)}
          className="rounded-full border border-[#123F3A] text-[#123F3A] text-[11px] font-bold px-4 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          عدّل
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDismiss}
          className="text-[11px] font-bold text-neutral-500 hover:underline disabled:opacity-40"
        >
          تجاهل
        </button>
      </div>
    </div>
  )
}
