import {
  type ConstructionInboxThreadFile,
  type ConstructionInboxThreadMessage,
} from '../../api/constructionClient'
import { attachmentKind, chatTimeLabel } from '../../lib/inboxChat'
import { splitQuotedReply } from '../../lib/quotedEmail'
import { InlineImage, isShowableImage } from './InlineImage'

/**
 * Provider truth, not optimism. A rejected or unconfirmed send never gets a
 * checkmark — the owner must be able to trust a «✓» on his own bubble.
 */
function deliveryMark(message: ConstructionInboxThreadMessage): { text: string; className: string } {
  const state = String(message.state || '').toUpperCase()
  if (state === 'SENT') return { text: '✓ أُرسلت', className: 'text-[#1a7a45]' }
  if (state === 'SENDING') return { text: '… جارٍ الإرسال', className: 'text-neutral-500' }
  if (state === 'PREPARED') return { text: 'لم تُرسل بعد', className: 'text-amber-700' }
  if (state === 'FAILED')
    return {
      text: `✗ فشل${message.failure_code ? ` — ${message.failure_code}` : ''}`,
      className: 'text-red-600',
    }
  if (state === 'UNKNOWN')
    return {
      text: `؟ غير مؤكدة${message.failure_code ? ` — ${message.failure_code}` : ''}`,
      className: 'text-amber-700',
    }
  return { text: state || '—', className: 'text-neutral-500' }
}

/** A refused supplier attachment must read as an instruction, not a code. */
function inboundFileNoticeAr(state?: string): string {
  if (state === 'TOO_LARGE')
    return 'لم يُحفظ المرفق: أكبر من الحد (25 ميجابايت للملف و40 ميجابايت للرسالة). اطلب من المورد إرساله على أجزاء.'
  if (state === 'BLOCKED_TYPE')
    return 'لم يُحفظ المرفق — افتح البريد الأصلي للحصول عليه.'
  return 'لم يُحفظ المرفق — افتح البريد الأصلي للحصول عليه.'
}

function AttachmentCard({
  file,
  inbound,
  onDownload,
}: {
  file: ConstructionInboxThreadFile
  inbound: boolean
  onDownload: (fileId: string, filename?: string) => void
}) {
  const kind = attachmentKind(file)
  const stored = file.state === 'STORED'
  const body = (
    <>
      <span className="flex-shrink-0 w-9 h-9 rounded-lg bg-[#123F3A]/10 text-[#123F3A] text-[9px] font-black flex items-center justify-center">
        {kind || 'ملف'}
      </span>
      <span className="min-w-0 flex-1 text-start">
        <bdi className="block truncate text-[11px] font-bold text-[#0D1F1D]">
          {file.filename || 'مرفق'}
        </bdi>
        <span className="block text-[10px] text-neutral-500">
          {inbound ? (stored ? 'اضغط للتنزيل' : 'غير محفوظ') : 'مرفق مع رسالتنا'}
        </span>
      </span>
      {inbound && stored && (
        <svg viewBox="0 0 20 20" className="w-4 h-4 flex-shrink-0 text-[#123F3A]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 3v10m0 0l-4-4m4 4l4-4M4 16h12" />
        </svg>
      )}
    </>
  )
  const frame =
    'w-full max-w-xs flex items-center gap-2.5 rounded-xl border border-black/5 bg-white/80 px-2.5 py-2'
  return (
    <div>
      {inbound ? (
        // Only supplier files are served by the download route; ours are listed, not fetched.
        <button
          type="button"
          disabled={!stored}
          onClick={() => onDownload(file.id, file.filename)}
          className={`${frame} hover:border-[#123F3A]/40 disabled:opacity-60 disabled:hover:border-black/5`}
        >
          {body}
        </button>
      ) : (
        <div className={frame}>{body}</div>
      )}
      {inbound && !stored && (
        <p className="mt-1 text-[10px] text-amber-700 leading-relaxed max-w-xs">
          {inboundFileNoticeAr(file.state)}
        </p>
      )}
    </div>
  )
}

export type MessageBubbleProps = {
  message: ConstructionInboxThreadMessage
  author: string
  /** First bubble of a run from the same sender: shows the name and the tail corner. */
  leadsGroup: boolean
  quotedOpen: boolean
  onToggleQuoted: () => void
  onDownload: (fileId: string, filename?: string) => void
  onRetry: (messageId: string) => void
  /** Read-only build: retry is a real send, so it is shown but cannot be pressed. */
  retryBlockedReason?: string | null
}

export function MessageBubble({
  message,
  author,
  leadsGroup,
  quotedOpen,
  onToggleQuoted,
  onDownload,
  onRetry,
  retryBlockedReason,
}: MessageBubbleProps) {
  const inbound = message.direction === 'INBOUND'
  const mark = inbound ? null : deliveryMark(message)
  // Only inbound mail carries a quoted reply chain worth folding.
  const split = inbound
    ? splitQuotedReply(message.body_text)
    : { visible: message.body_text || '', quoted: null as string | null }
  const files = message.files || []
  // Mail clients leave «[image: name.png]» where a pasted picture was. Once the
  // picture itself is shown below, the marker is noise; without it, it stays,
  // because it is the only sign a picture existed.
  const showsImage = inbound && files.some(isShowableImage)
  const visibleText = showsImage
    ? split.visible.replace(/^[ \t]*\[image:[^\]\n]*\][ \t]*$/gim, '').replace(/\n{3,}/g, '\n\n').trim()
    : split.visible
  const time = chatTimeLabel(message.created_at)

  return (
    // RTL-aware sides: `self-start` follows the app direction, so theirs lands
    // on the right and ours on the left — as Arabic WhatsApp does — without
    // hardcoding left/right.
    <div
      className={`max-w-[88%] sm:max-w-[75%] xl:max-w-[62%] rounded-2xl px-3.5 py-2.5 shadow-[0_1px_1px_rgba(13,31,29,0.08)] ${
        inbound ? 'self-start bg-white' : 'self-end bg-[#DCF2E4]'
      } ${leadsGroup ? (inbound ? 'rounded-ss-md mt-2' : 'rounded-se-md mt-2') : 'mt-0.5'}`}
    >
      {(leadsGroup || message.kind_hint === 'DISPATCH' || (inbound && message.unread)) && (
        <div className="flex items-center gap-2 mb-1">
          {leadsGroup && (
            <span className={`text-[11px] font-bold truncate ${inbound ? 'text-[#123F3A]' : 'text-[#1a7a45]'}`}>
              <bdi>{author}</bdi>
            </span>
          )}
          {message.kind_hint === 'DISPATCH' && (
            <span className="text-[9px] font-bold rounded-full bg-white/70 text-neutral-600 px-1.5 py-0.5">
              دعوة طلب عرض
            </span>
          )}
          {inbound && message.unread && (
            <span className="text-[9px] font-bold rounded-full bg-[#123F3A] text-white px-1.5 py-0.5">
              جديدة
            </span>
          )}
        </div>
      )}

      {message.subject && (
        <div className="text-[10px] text-neutral-500 mb-1 truncate">{message.subject}</div>
      )}

      <p dir="auto" className="text-[13px] text-[#0D1F1D] whitespace-pre-line leading-relaxed break-words text-start">
        {visibleText || '—'}
      </p>

      {split.quoted && (
        <>
          <button
            type="button"
            aria-expanded={quotedOpen}
            onClick={onToggleQuoted}
            className="mt-2 text-[11px] font-bold text-[#123F3A] hover:underline"
          >
            {quotedOpen ? 'إخفاء الرسائل السابقة' : 'عرض الرسائل السابقة'}
          </button>
          {quotedOpen && (
            <pre
              dir="auto"
              className="mt-2 max-h-64 overflow-auto rounded-xl bg-neutral-50 border border-neutral-100 p-2 text-[10px] text-neutral-500 whitespace-pre-wrap break-words font-sans"
            >
              {split.quoted}
            </pre>
          )}
        </>
      )}

      {files.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {files.map((file) =>
            inbound && isShowableImage(file) ? (
              <InlineImage key={file.id} file={file} onDownload={onDownload} />
            ) : (
              <AttachmentCard key={file.id} file={file} inbound={inbound} onDownload={onDownload} />
            ),
          )}
        </div>
      )}

      <div className="mt-1 flex items-center gap-2 justify-end">
        {mark && <span className={`text-[10px] font-bold ${mark.className}`}>{mark.text}</span>}
        {time && <span className="text-[10px] text-neutral-400">{time}</span>}
      </div>

      {message.can_retry && (
        <div className="mt-1">
          <button
            type="button"
            disabled={Boolean(retryBlockedReason)}
            title={retryBlockedReason || undefined}
            className="text-[10px] font-bold text-[#123F3A] hover:underline disabled:opacity-50 disabled:no-underline"
            onClick={() => onRetry(message.id)}
          >
            إعادة محاولة الإرسال
          </button>
        </div>
      )}
    </div>
  )
}

export default MessageBubble
