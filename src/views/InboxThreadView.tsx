import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NavProps } from '../types'
import {
  ConstructionApiError,
  claimConstructionInboxRequest,
  downloadConstructionInboxFile,
  getConstructionInboxThread,
  inboxThreadSupplierLabel,
  markConstructionInboxMessageRead,
  readConstructionInboxAttachments,
  replyToConstructionInboxThread,
  retryConstructionInboxReply,
  INBOX_ATTACHMENT_MAX_FILES,
  INBOX_ATTACHMENT_TYPES,
  type ConstructionInboxThreadDetail,
  type ConstructionInboxThreadMessage,
} from '../api/constructionClient'
import { splitQuotedReply } from '../lib/quotedEmail'
import { useProcurement } from '../procurementContext'

/**
 * Provider truth, not optimism. A rejected or unconfirmed send never gets a
 * checkmark — the owner must be able to trust a «✓» on his own bubble.
 */
function deliveryMark(message: ConstructionInboxThreadMessage): {
  text: string
  className: string
} {
  const state = String(message.state || '').toUpperCase()
  if (state === 'SENT') return { text: '✓ أُرسلت', className: 'text-[#1a7a45]' }
  if (state === 'SENDING') return { text: '… جارٍ الإرسال', className: 'text-neutral-500' }
  if (state === 'PREPARED') return { text: 'لم تُرسل بعد', className: 'text-amber-700' }
  if (state === 'FAILED')
    return { text: `✗ فشل${message.failure_code ? ` — ${message.failure_code}` : ''}`, className: 'text-red-600' }
  if (state === 'UNKNOWN')
    return { text: `؟ غير مؤكدة${message.failure_code ? ` — ${message.failure_code}` : ''}`, className: 'text-amber-700' }
  return { text: state || '—', className: 'text-neutral-500' }
}

const startOfDay = (value: number) => {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function dayLabel(value?: string): string {
  const ts = Date.parse(String(value || ''))
  if (Number.isNaN(ts)) return ''
  const today = startOfDay(Date.now())
  const day = startOfDay(ts)
  if (day === today) return 'اليوم'
  if (day === today - 86400000) return 'أمس'
  return new Date(ts).toLocaleDateString('ar-SA', { day: 'numeric', month: 'long', year: 'numeric' })
}

function timeLabel(value?: string): string {
  const ts = Date.parse(String(value || ''))
  if (Number.isNaN(ts)) return ''
  return new Date(ts).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
}

/** A refused supplier attachment must read as an instruction, not a code. */
function inboundFileNoticeAr(state?: string): string {
  if (state === 'TOO_LARGE')
    return 'لم يُحفظ المرفق: أكبر من الحد المسموح (٥ ميجابايت للملف و١٠ ميجابايت للرسالة). اطلب من المورد إرساله مضغوطًا أو على أجزاء.'
  if (state === 'BLOCKED_TYPE')
    return `لم يُحفظ المرفق: نوع غير مسموح. المسموح ${INBOX_ATTACHMENT_TYPES.join('، ')} فقط.`
  return 'لم يُحفظ المرفق — افتح البريد الأصلي للحصول عليه.'
}

function messageAuthor(
  message: ConstructionInboxThreadMessage,
  thread: ConstructionInboxThreadDetail,
): string {
  if (message.direction === 'INBOUND') {
    return String(message.employee_name || inboxThreadSupplierLabel(thread) || 'المورد')
  }
  return String(message.employee_name || 'فريقنا')
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename || 'attachment'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function InboxThreadView({ navigate }: NavProps) {
  const { selectedThreadId, openRfq } = useProcurement()
  const [thread, setThread] = useState<ConstructionInboxThreadDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [includeItems, setIncludeItems] = useState(false)
  const [sending, setSending] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const fileInput = useRef<HTMLInputElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const markedRef = useRef<Set<string>>(new Set())

  const load = useCallback(
    async (markRead: boolean) => {
      if (!selectedThreadId) return
      setLoading(true)
      setError(null)
      try {
        const detail = await getConstructionInboxThread(selectedThreadId)
        setThread(detail)
        if (markRead) {
          // Keep the bell honest: opening a conversation reads its inbound messages.
          const unread = detail.messages.filter(
            (m) => m.direction === 'INBOUND' && m.unread && !markedRef.current.has(m.id),
          )
          if (unread.length) {
            await Promise.allSettled(
              unread.map((m) =>
                markConstructionInboxMessageRead(m.id).then(() => markedRef.current.add(m.id)),
              ),
            )
            setThread(await getConstructionInboxThread(selectedThreadId))
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'تعذّر تحميل المحادثة.')
      } finally {
        setLoading(false)
      }
    },
    [selectedThreadId],
  )

  useEffect(() => {
    void load(true)
  }, [load])

  // Newest message in view on open, like any chat app.
  useEffect(() => {
    if (thread) bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [thread])

  const supplierName = thread ? inboxThreadSupplierLabel(thread) : ''
  const reference = thread?.request_context?.reference
  const itemPackage = thread?.item_package
  const emailChannel = useMemo(
    () => (thread?.send_channels || []).find((c) => c.channel === 'EMAIL'),
    [thread],
  )
  const unreadNow = (thread?.messages || []).filter((m) => m.direction === 'INBOUND' && m.unread).length

  async function handleClaim(takeOver: boolean) {
    const rfqId = thread?.request_context?.rfq_id || thread?.rfq_id
    if (!rfqId) return
    setClaiming(true)
    setNotice(null)
    try {
      await claimConstructionInboxRequest(String(rfqId), { take_over: takeOver })
      await load(false)
      setNotice('تم استلام المحادثة — يمكنك الإرسال الآن.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر استلام المحادثة.')
    } finally {
      setClaiming(false)
    }
  }

  async function handleSend() {
    if (!thread?.invite_id || !text.trim() || sending) return
    setSending(true)
    setError(null)
    setNotice(null)
    try {
      const attachments = files.length ? await readConstructionInboxAttachments(files) : []
      const result = await replyToConstructionInboxThread(String(thread.invite_id), {
        idempotency_key: crypto.randomUUID(),
        text: text.trim(),
        parent_message_id: thread.last_message_id ?? null,
        attachments,
        include_items: includeItems,
      })
      const state = String(result.state || '').toUpperCase()
      setNotice(
        state === 'SENT'
          ? 'أُرسلت الرسالة — رد المورد سيعود إلى هذه المحادثة نفسها.'
          : state === 'FAILED'
            ? `رفض المزوّد الإرسال (${result.failure_code || 'FAILED'}) — الرسالة محفوظة ويمكن إعادة المحاولة.`
            : `نتيجة الإرسال غير مؤكدة (${result.failure_code || state}) — راجع بريد info@ قبل إعادة الإرسال.`,
      )
      if (state === 'SENT') {
        setText('')
        setFiles([])
        setIncludeItems(false)
        if (fileInput.current) fileInput.current.value = ''
      }
      await load(false)
    } catch (err) {
      setError(
        err instanceof ConstructionApiError || err instanceof Error ? err.message : 'تعذّر الإرسال.',
      )
    } finally {
      setSending(false)
    }
  }

  async function handleRetry(id: string) {
    setError(null)
    setNotice(null)
    try {
      const result = await retryConstructionInboxReply(id)
      setNotice(
        `نتيجة إعادة المحاولة: ${result.state}${result.failure_code ? ` (${result.failure_code})` : ''}`,
      )
      await load(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّرت إعادة المحاولة.')
    }
  }

  async function handleDownload(fileId: string, filename?: string) {
    setError(null)
    try {
      saveBlob(await downloadConstructionInboxFile(fileId), filename || 'attachment')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر تنزيل المرفق.')
    }
  }

  if (!selectedThreadId) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <p className="text-sm text-neutral-500 mb-3">لم تُحدَّد محادثة.</p>
        <button
          type="button"
          className="text-xs font-bold text-[#123F3A]"
          onClick={() => navigate('inbox')}
        >
          ← صندوق الوارد
        </button>
      </div>
    )
  }

  let lastDay = ''

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-8 py-6 flex flex-col min-h-[calc(100vh-4rem)]">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <button
            type="button"
            className="text-xs font-bold text-[#123F3A] hover:underline mb-2"
            onClick={() => navigate('inbox')}
          >
            ← صندوق الوارد
          </button>
          <h1 className="text-xl font-black text-[#0D1F1D] truncate">
            {supplierName || 'محادثة مورد'}
          </h1>
          <div className="text-[11px] text-neutral-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {reference && (
              <span>
                الطلب <bdi className="font-bold">{reference}</bdi>
              </span>
            )}
            {thread?.reply_recipient && (
              <span>
                الرد إلى <bdi dir="ltr">{thread.reply_recipient}</bdi>
              </span>
            )}
            {thread?.owner_name && <span>المسؤول: {thread.owner_name}</span>}
          </div>
        </div>
        {(thread?.request_context?.rfq_id || thread?.rfq_id) && (
          <button
            type="button"
            onClick={() =>
              openRfq(String(thread?.request_context?.rfq_id || thread?.rfq_id), 'rfq-detail')
            }
            className="flex-shrink-0 text-[11px] font-bold text-[#123F3A] border border-neutral-200 rounded-xl px-3 py-1.5 hover:border-[#123F3A]/40"
          >
            تفاصيل الطلب
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 mb-3 text-xs text-amber-900 leading-relaxed">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-2xl border border-[#CFF5DC] bg-[#F1FBF5] px-4 py-3 mb-3 text-xs text-[#1a7a45] leading-relaxed">
          {notice}
        </div>
      )}

      {loading && !thread && <p className="text-sm text-neutral-500">جارٍ تحميل المحادثة…</p>}

      {thread?.locked && (
        <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 mb-3 text-xs text-neutral-600">
          هذا الطلب بظرف مختوم — الرسائل والمرفقات مخفية حتى فتح المظاريف.
        </div>
      )}

      {thread && !thread.locked && (
        <>
          <div className="flex-1 flex flex-col gap-1.5 pb-4">
            {thread.messages.map((message) => {
              const inbound = message.direction === 'INBOUND'
              const mark = inbound ? null : deliveryMark(message)
              const day = dayLabel(message.created_at)
              const showDay = day && day !== lastDay
              if (showDay) lastDay = day
              // Only inbound mail carries a quoted reply chain worth folding.
              const split = inbound
                ? splitQuotedReply(message.body_text)
                : { visible: message.body_text || '', quoted: null as string | null }
              const key = `${message.direction}-${message.id}`
              const open = expanded[key] === true
              return (
                <div key={key} className="flex flex-col">
                  {showDay && (
                    <div className="self-center my-3 rounded-full bg-neutral-100 text-neutral-500 text-[10px] font-bold px-2.5 py-1">
                      {day}
                    </div>
                  )}
                  {/* RTL-aware sides: `self-start` follows the app direction, so
                      ours lands opposite theirs without hardcoding left/right. */}
                  <div
                    className={`max-w-[85%] rounded-2xl border px-3.5 py-2.5 ${
                      inbound
                        ? 'self-start bg-white border-neutral-100'
                        : 'self-end bg-[#DCF2E4] border-[#CFF5DC]'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-bold text-[#0D1F1D] truncate">
                        <bdi>{messageAuthor(message, thread)}</bdi>
                      </span>
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
                    {message.subject && (
                      <div className="text-[10px] text-neutral-500 mb-1 truncate">
                        {message.subject}
                      </div>
                    )}
                    <p className="text-xs text-neutral-800 whitespace-pre-line leading-relaxed break-words">
                      {split.visible || '—'}
                    </p>

                    {split.quoted && (
                      <>
                        <button
                          type="button"
                          onClick={() => setExpanded((prev) => ({ ...prev, [key]: !open }))}
                          className="mt-2 text-[10px] font-bold text-[#123F3A] hover:underline"
                        >
                          {open ? 'إخفاء الرسالة السابقة' : 'إظهار الرسالة السابقة'}
                        </button>
                        {open && (
                          <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-neutral-50 border border-neutral-100 p-2 text-[10px] text-neutral-500 whitespace-pre-wrap break-words">
                            {split.quoted}
                          </pre>
                        )}
                      </>
                    )}

                    {(message.files || []).length > 0 && (
                      <div className="mt-2 flex flex-col gap-1.5 items-start">
                        {(message.files || []).map((file) => (
                          <div key={file.id}>
                            <button
                              type="button"
                              disabled={inbound && file.state !== 'STORED'}
                              onClick={() => inbound && handleDownload(file.id, file.filename)}
                              className="text-[10px] rounded-lg border border-neutral-200 bg-white px-2 py-1 disabled:opacity-50 hover:border-[#123F3A]/40"
                            >
                              📎 <bdi>{file.filename || 'مرفق'}</bdi>
                            </button>
                            {inbound && file.state !== 'STORED' && (
                              <p className="mt-1 text-[10px] text-amber-700 leading-relaxed">
                                {inboundFileNoticeAr(file.state)}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-1.5 flex items-center gap-2 justify-end">
                      {mark && (
                        <span className={`text-[10px] font-bold ${mark.className}`}>{mark.text}</span>
                      )}
                      <span className="text-[10px] text-neutral-400">
                        {timeLabel(message.created_at)}
                      </span>
                    </div>

                    {message.can_retry && (
                      <button
                        type="button"
                        className="mt-1 text-[10px] font-bold text-[#123F3A] hover:underline"
                        onClick={() => handleRetry(message.id)}
                      >
                        إعادة محاولة الإرسال
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {thread.messages.length === 0 && (
              <p className="text-sm text-neutral-500">لا رسائل في هذه المحادثة بعد.</p>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="sticky bottom-0 -mx-4 lg:-mx-8 px-4 lg:px-8 pt-3 pb-4 bg-[#FAFAF8]/95 backdrop-blur border-t border-neutral-100">
            {!thread.can_reply && (
              <div className="rounded-xl bg-amber-50 text-amber-900 text-[11px] leading-relaxed px-3 py-2 mb-2">
                {thread.can_claim
                  ? 'لا مسؤول لهذه المراسلة بعد — استلمها لتتمكن من الإرسال (يمنع ردَّين من شخصين على نفس المورد).'
                  : thread.can_take_over
                    ? `المراسلة مسندة إلى ${thread.owner_name || 'زميل آخر'} — يمكن للمدير نقلها.`
                    : 'لا تملك صلاحية الرد على هذه المراسلة.'}
                <div className="mt-2 flex gap-2">
                  {thread.can_claim && (
                    <button
                      type="button"
                      disabled={claiming}
                      onClick={() => handleClaim(false)}
                      className="rounded-lg bg-[#123F3A] text-white text-[11px] font-bold px-3 py-1.5 disabled:opacity-50"
                    >
                      استلام المحادثة
                    </button>
                  )}
                  {thread.can_take_over && !thread.can_claim && (
                    <button
                      type="button"
                      disabled={claiming}
                      onClick={() => handleClaim(true)}
                      className="rounded-lg border border-[#123F3A] text-[#123F3A] text-[11px] font-bold px-3 py-1.5 disabled:opacity-50"
                    >
                      نقل المسؤولية إليّ
                    </button>
                  )}
                </div>
              </div>
            )}

            {emailChannel?.reason && (
              <div className="rounded-xl bg-amber-50 text-amber-900 text-[11px] px-3 py-2 mb-2">
                قناة البريد غير جاهزة على الـ API ({emailChannel.reason}).
              </div>
            )}

            <div className="flex items-end gap-2">
              <label
                className={`flex-shrink-0 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm cursor-pointer hover:border-[#123F3A]/40 ${
                  !thread.can_reply || sending ? 'opacity-50 pointer-events-none' : ''
                }`}
                title={`المسموح: ${INBOX_ATTACHMENT_TYPES.join('، ')}`}
              >
                📎
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  className="hidden"
                  disabled={!thread.can_reply || sending}
                  accept={INBOX_ATTACHMENT_TYPES.map((t) => `.${t}`).join(',')}
                  onChange={(event) =>
                    setFiles(Array.from(event.target.files || []).slice(0, INBOX_ATTACHMENT_MAX_FILES))
                  }
                />
              </label>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void handleSend()
                }}
                disabled={!thread.can_reply || sending}
                rows={1}
                maxLength={20000}
                placeholder="اكتب رسالتك للمورد…"
                className="flex-1 resize-none rounded-2xl border border-neutral-200 px-3 py-2.5 text-xs leading-relaxed max-h-32 disabled:bg-neutral-50"
              />
              <button
                type="button"
                disabled={!thread.can_reply || sending || !text.trim()}
                onClick={handleSend}
                className="flex-shrink-0 rounded-2xl bg-[#123F3A] text-white text-xs font-bold px-4 py-2.5 disabled:opacity-50"
              >
                {sending ? '…' : 'إرسال'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
              <label className="inline-flex items-center gap-1.5 text-[11px] text-neutral-700">
                <input
                  type="checkbox"
                  checked={includeItems}
                  disabled={!thread.can_reply || sending || !itemPackage?.can_attach_items}
                  onChange={(event) => setIncludeItems(event.target.checked)}
                />
                إرفاق بنود هذا المورد
                {itemPackage?.can_attach_items
                  ? ` (${itemPackage.line_count} من ${itemPackage.total_line_count})`
                  : ''}
              </label>
              {files.length > 0 && (
                <span className="text-[10px] text-neutral-500">
                  {files.length} مرفق: <bdi>{files.map((f) => f.name).join('، ')}</bdi>
                </span>
              )}
              <span className="text-[10px] text-neutral-400 ms-auto">
                {unreadNow > 0 ? `${unreadNow} غير مقروءة` : 'كل الرسائل مقروءة'}
              </span>
            </div>

            {!itemPackage?.can_attach_items && itemPackage?.reason && (
              <p className="text-[10px] text-neutral-500 leading-relaxed mt-1">
                {itemPackage.reason === 'SUPPLIER_SCOPE_REQUIRED'
                  ? `لا يمكن إرفاق البنود: هذا الطلب (${itemPackage.total_line_count} بندًا) لم يُقسّم على الموردين، وإرسال الكتيّب كاملًا ممنوع.`
                  : 'لا بنود مخصصة لهذا المورد في هذا الطلب.'}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default InboxThreadView
