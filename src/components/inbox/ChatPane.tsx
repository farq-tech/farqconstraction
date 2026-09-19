import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ConstructionApiError,
  claimConstructionInboxRequest,
  downloadConstructionInboxFile,
  getConstructionInboxThread,
  inboxThreadSupplierLabel,
  markConstructionInboxMessageRead,
  markConstructionInboxMessageUnread,
  readConstructionInboxAttachments,
  replyToConstructionInboxThread,
  retryConstructionInboxReply,
  INBOX_ATTACHMENT_MAX_FILES,
  type ConstructionInboxThreadDetail,
  type ConstructionInboxThreadMessage,
} from '../../api/constructionClient'
import { isReadOnlyBuild, READ_ONLY_MESSAGE } from '../../api/readOnlyMode'
import { chatDayLabel } from '../../lib/inboxChat'
import { MessageBubble } from './MessageBubble'
import { SupplierAvatar } from './SupplierAvatar'

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

/** CSS-only wallpaper: a faint dot grid on warm paper. No image, no repaint cost. */
const WALLPAPER = {
  backgroundColor: '#F2EFE8',
  backgroundImage:
    'radial-gradient(rgba(18,63,58,0.07) 1px, transparent 1.5px), radial-gradient(rgba(18,63,58,0.04) 1px, transparent 1.5px)',
  backgroundSize: '22px 22px, 22px 22px',
  backgroundPosition: '0 0, 11px 11px',
} as const

function ChatSkeleton() {
  // Widths are fixed, not random: a skeleton must not look like real messages.
  const rows = [
    ['self-start', 'w-56'],
    ['self-start', 'w-40'],
    ['self-end', 'w-64'],
    ['self-start', 'w-48'],
    ['self-end', 'w-36'],
  ]
  return (
    <div className="flex flex-col gap-2 animate-pulse" aria-hidden="true">
      {rows.map(([side, width], index) => (
        <div key={index} className={`${side} ${width} h-12 rounded-2xl bg-white/80`} />
      ))}
    </div>
  )
}

export type ChatPaneProps = {
  /** Invitation id — the key of a supplier conversation in the inbox API. */
  inviteId: string
  /** Narrow screens show one pane at a time; this returns to the list. */
  onBack: () => void
  onOpenRfq: (rfqId: string) => void
  /**
   * Tells the list how many unread inbound messages this thread still has,
   * counted from the thread the server just returned. Only called when the
   * server returned the whole thread, so the number is never a guess.
   */
  onUnreadKnown?: (inviteId: string, unread: number) => void
  /**
   * Inside a request's page: show only this request's messages (the inbox
   * thread merges every open request with the same supplier) and hide the
   * «تفاصيل الطلب» link, since the user is already on it.
   */
  requestScoped?: boolean
}

export function ChatPane({ inviteId, onBack, onOpenRfq, onUnreadKnown, requestScoped = false }: ChatPaneProps) {
  const readOnly = isReadOnlyBuild()
  const [thread, setThread] = useState<ConstructionInboxThreadDetail | null>(null)
  const [loading, setLoading] = useState(true)
  /** The thread itself could not be read — distinct from a failed action on a loaded thread. */
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [includeItems, setIncludeItems] = useState(false)
  const [sending, setSending] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  // Selection: pick supplier messages, then mark them read or unread.
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [marking, setMarking] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const scroller = useRef<HTMLDivElement | null>(null)
  const markedRef = useRef<Set<string>>(new Set())
  const alive = useRef(true)
  const unreadKnownRef = useRef(onUnreadKnown)
  unreadKnownRef.current = onUnreadKnown

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const publish = useCallback(
    (detail: ConstructionInboxThreadDetail) => {
      if (!alive.current) return
      setThread(detail)
      // `older_than` means the server held older messages back; an unread count
      // taken from a partial thread would be a guess, so the list keeps its own.
      if (!detail.older_than) {
        unreadKnownRef.current?.(
          inviteId,
          detail.messages.filter((m) => m.direction === 'INBOUND' && m.unread).length,
        )
      }
    },
    [inviteId],
  )

  const load = useCallback(
    async (markRead: boolean) => {
      setLoading(true)
      setLoadError(null)
      try {
        const detail = await getConstructionInboxThread(inviteId)
        publish(detail)
        // Marking read is a write. The read-only build refuses it at the network
        // choke point, so asking would only produce a refusal and a pointless
        // refetch — the «جديدة» tags stay, which is the truth on this build.
        if (markRead && !readOnly) {
          // Keep the bell honest: opening a conversation reads its inbound messages.
          const unread = detail.messages.filter(
            (m) => m.direction === 'INBOUND' && m.unread && !markedRef.current.has(m.id),
          )
          if (unread.length) {
            const results = await Promise.allSettled(
              unread.map((m) =>
                markConstructionInboxMessageRead(m.id).then(() => markedRef.current.add(m.id)),
              ),
            )
            if (results.some((r) => r.status === 'fulfilled')) {
              publish(await getConstructionInboxThread(inviteId))
            }
          }
        }
      } catch (err) {
        if (!alive.current) return
        setLoadError(err instanceof Error ? err.message : 'تعذّر تحميل المحادثة.')
      } finally {
        if (alive.current) setLoading(false)
      }
    },
    [inviteId, publish, readOnly],
  )

  useEffect(() => {
    void load(true)
  }, [load])

  useEffect(() => {
    setSelecting(false)
    setPicked(new Set())
  }, [inviteId])

  const togglePicked = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const markPicked = async (asRead: boolean) => {
    if (!picked.size || marking) return
    setMarking(true)
    setError(null)
    setNotice(null)
    const ids = [...picked]
    const results = await Promise.allSettled(
      ids.map((id) => (asRead ? markConstructionInboxMessageRead(id) : markConstructionInboxMessageUnread(id))),
    )
    const failed = results.filter((r) => r.status === 'rejected').length
    ids.forEach((id, i) => {
      if (results[i]!.status !== 'fulfilled') return
      if (asRead) markedRef.current.add(id)
      else markedRef.current.delete(id)
    })
    try {
      publish(await getConstructionInboxThread(inviteId))
    } catch {
      /* the counts below still say what was done */
    }
    if (!alive.current) return
    setMarking(false)
    if (failed) {
      const first = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
      setError(`تعذّر تعليم ${failed} من ${ids.length}: ${first.reason instanceof Error ? first.reason.message : 'سبب غير معروف'}`)
    } else {
      setNotice(asRead ? `عُلّمت ${ids.length} رسالة كمقروءة.` : `عُلّمت ${ids.length} رسالة كغير مقروءة، وستبقى كذلك حتى تفتح المحادثة من جديد.`)
      setSelecting(false)
      setPicked(new Set())
    }
  }

  // Newest message in view on open, like any chat app. The pane's own scroller
  // is moved — `scrollIntoView` would also drag the page, which must not scroll.
  const messageCount = thread?.messages.length ?? 0
  const lastMessageId = thread?.messages[messageCount - 1]?.id
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messageCount, lastMessageId])

  const supplierName = thread ? inboxThreadSupplierLabel(thread) : ''
  const reference = thread?.request_context?.reference
  const rfqId = thread?.request_context?.rfq_id || thread?.rfq_id
  const itemPackage = thread?.item_package
  const emailChannel = useMemo(
    () => (thread?.send_channels || []).find((c) => c.channel === 'EMAIL'),
    [thread],
  )
  /**
   * The reply goes back on the channel the supplier last wrote on; the server
   * refuses anything else. With no inbound message yet: email when the thread
   * has an address, otherwise Haraj.
   */
  const replyChannel = useMemo<'EMAIL' | 'HARAJ' | 'WHATSAPP'>(() => {
    const lastIn = [...(thread?.messages || [])].reverse().find((m) => m.direction === 'INBOUND' && ['EMAIL', 'HARAJ', 'WHATSAPP'].includes(String(m.channel)))
    if (lastIn) return String(lastIn.channel) as 'EMAIL' | 'HARAJ' | 'WHATSAPP'
    const available = (thread?.send_channels || []).map((c) => String(c.channel))
    return available.includes('EMAIL') || !available.includes('HARAJ') ? 'EMAIL' : 'HARAJ'
  }, [thread])
  const unreadNow = (thread?.messages || []).filter((m) => m.direction === 'INBOUND' && m.unread).length
  /** One switch for every control that would send: permission AND a build that may write. */
  const canCompose = Boolean(thread?.can_reply) && !readOnly

  async function handleClaim(takeOver: boolean) {
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
      if (alive.current) setClaiming(false)
    }
  }

  async function handleSend() {
    if (!canCompose || !thread?.invite_id || !text.trim() || sending) return
    setSending(true)
    setError(null)
    setNotice(null)
    try {
      if (replyChannel === 'WHATSAPP') {
        setError('آخر رسالة من المورد وصلت على واتساب — الرد عليه يكون من تطبيق واتساب نفسه.')
        return
      }
      if (replyChannel === 'HARAJ' && files.length) {
        setError('محادثة حراج تقبل النص فقط — أزل المرفقات أو أرسلها بالبريد.')
        return
      }
      const attachments = files.length ? await readConstructionInboxAttachments(files) : []
      const result = await replyToConstructionInboxThread(String(thread.invite_id), {
        channel: replyChannel === 'HARAJ' ? 'HARAJ' : 'EMAIL',
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
      if (alive.current) setSending(false)
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

  let lastDay = ''
  let lastSender = ''
  const now = Date.now()

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-3 sm:px-4 py-2.5 bg-white border-b border-neutral-200">
        <button
          type="button"
          onClick={onBack}
          aria-label="رجوع إلى قائمة المحادثات"
          className="lg:hidden flex-shrink-0 w-9 h-9 -ms-1 rounded-full flex items-center justify-center text-[#123F3A] hover:bg-neutral-100"
        >
          {/* RTL: "back" points to the right, towards where the list sits. */}
          <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 4l6 6-6 6" />
          </svg>
        </button>
        {thread ? (
          <SupplierAvatar name={supplierName} size="sm" />
        ) : (
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-neutral-100" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-black text-[#0D1F1D] truncate">
            {thread ? supplierName : loading ? 'جارٍ تحميل المحادثة…' : 'محادثة مورد'}
          </h1>
          <div className="text-[11px] text-neutral-500 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {reference && (
              <span>
                الطلب <bdi className="font-bold">{reference}</bdi>
              </span>
            )}
            {thread?.reply_recipient && (
              <span className="hidden sm:inline truncate">
                الرد إلى <bdi dir="ltr">{thread.reply_recipient}</bdi>
              </span>
            )}
            {thread?.owner_name && <span>المسؤول: {thread.owner_name}</span>}
          </div>
        </div>
        {thread && !thread.locked && thread.messages.some((m) => m.direction === 'INBOUND') && (
          <button
            type="button"
            onClick={() => {
              setSelecting((v) => !v)
              setPicked(new Set())
            }}
            className={`flex-shrink-0 text-[11px] font-bold border rounded-xl px-3 py-1.5 ${
              selecting ? 'bg-[#123F3A] text-white border-[#123F3A]' : 'text-[#123F3A] border-neutral-200 hover:border-[#123F3A]/40'
            }`}
          >
            {selecting ? 'إنهاء التحديد' : 'تحديد'}
          </button>
        )}
        {rfqId && !requestScoped && (
          <button
            type="button"
            onClick={() => onOpenRfq(String(rfqId))}
            className="flex-shrink-0 text-[11px] font-bold text-[#123F3A] border border-neutral-200 rounded-xl px-3 py-1.5 hover:border-[#123F3A]/40"
          >
            تفاصيل الطلب
          </button>
        )}
      </div>

      {selecting && thread && (
        <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2 bg-[#f0faf7] border-b border-[#d7efe6] text-xs">
          <span className="font-bold text-[#0D1F1D]">{picked.size} محددة</span>
          <button
            type="button"
            onClick={() => setPicked(new Set(thread.messages.filter((m) => m.direction === 'INBOUND').map((m) => m.id)))}
            className="text-[#123F3A] font-semibold hover:underline"
          >
            تحديد كل رسائل المورد
          </button>
          <span className="flex-1" />
          <button
            type="button"
            disabled={!picked.size || marking || readOnly}
            onClick={() => void markPicked(true)}
            className="px-3 py-1.5 rounded-lg bg-white border border-neutral-200 font-bold text-[#123F3A] disabled:opacity-40"
          >
            مقروءة
          </button>
          <button
            type="button"
            disabled={!picked.size || marking || readOnly}
            onClick={() => void markPicked(false)}
            className="px-3 py-1.5 rounded-lg bg-[#123F3A] text-white font-bold disabled:opacity-40"
          >
            غير مقروءة
          </button>
        </div>
      )}

      {(error || notice) && (
        <div className="flex-shrink-0 px-3 sm:px-4 pt-2 bg-white border-b border-neutral-100 pb-2 space-y-2">
          {error && (
            <div role="alert" className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 leading-relaxed">
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-2xl border border-[#CFF5DC] bg-[#F1FBF5] px-4 py-2.5 text-xs text-[#1a7a45] leading-relaxed">
              {notice}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scroller} style={WALLPAPER} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-6 py-4">
        {loading && !thread && <ChatSkeleton />}

        {loadError && !thread && (
          <div role="alert" className="max-w-md mx-auto mt-10 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-center">
            <div className="text-sm font-bold text-amber-900 mb-1">تعذّر تحميل هذه المحادثة</div>
            <p className="text-xs text-amber-800 leading-relaxed mb-3 break-words">{loadError}</p>
            <button
              type="button"
              disabled={loading}
              onClick={() => void load(true)}
              className="rounded-xl bg-[#123F3A] text-white text-xs font-bold px-4 py-2 disabled:opacity-50"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {loadError && thread && (
          <div role="alert" className="max-w-md mx-auto mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 leading-relaxed">
            تعذّر تحديث المحادثة — المعروض أدناه آخر نسخة قُرئت بنجاح. ({loadError})
          </div>
        )}

        {thread?.locked && (
          <div className="max-w-md mx-auto mt-10 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-xs text-neutral-600 text-center">
            هذا الطلب بظرف مختوم — الرسائل والمرفقات مخفية حتى فتح المظاريف.
          </div>
        )}

        {thread && !thread.locked && (
          <div className="flex flex-col max-w-4xl mx-auto">
            {thread.older_than && (
              <div className="self-center mb-2 rounded-full bg-white/90 text-neutral-500 text-[10px] px-3 py-1 text-center">
                أعاد الخادم أحدث الرسائل فقط — توجد رسائل أقدم غير معروضة هنا.
              </div>
            )}
            {(requestScoped ? thread.messages.filter((m) => !m.invite_id || m.invite_id === inviteId) : thread.messages).map((message) => {
              const day = chatDayLabel(message.created_at, now)
              const showDay = Boolean(day) && day !== lastDay
              if (showDay) lastDay = day
              const author = messageAuthor(message, thread)
              const sender = `${message.direction}:${author}`
              const leadsGroup = showDay || sender !== lastSender
              lastSender = sender
              const key = `${message.direction}-${message.id}`
              return (
                <div key={key} className="flex flex-col">
                  {showDay && (
                    <div className="self-center my-3 rounded-full bg-white/90 shadow-[0_1px_1px_rgba(13,31,29,0.06)] text-neutral-600 text-[10px] font-bold px-3 py-1">
                      {day}
                    </div>
                  )}
                  {selecting && message.direction === 'INBOUND' && (
                    <label className="self-start flex items-center gap-2 mt-2 mb-0.5 text-[11px] text-neutral-600 cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-[#123F3A] w-4 h-4"
                        checked={picked.has(message.id)}
                        onChange={() => togglePicked(message.id)}
                      />
                      {message.unread ? 'غير مقروءة' : 'مقروءة'} — حدّد هذه الرسالة
                    </label>
                  )}
                  <MessageBubble
                    message={message}
                    author={author}
                    leadsGroup={leadsGroup}
                    quotedOpen={expanded[key] === true}
                    onToggleQuoted={() => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}
                    onDownload={handleDownload}
                    onRetry={handleRetry}
                    retryBlockedReason={readOnly ? READ_ONLY_MESSAGE : null}
                  />
                </div>
              )
            })}
            {thread.messages.length === 0 && (
              <div className="self-center mt-10 rounded-2xl bg-white/90 px-4 py-3 text-sm text-neutral-500">
                لا رسائل في هذه المحادثة بعد.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      {thread && !thread.locked && (
        <div className="flex-shrink-0 px-3 sm:px-4 pt-2.5 pb-3 bg-[#F7F6F2] border-t border-neutral-200">
          {readOnly && (
            // Said here, at the box the owner would type into — not only in the
            // page banner — so a greyed composer never reads as a broken one.
            <div className="rounded-xl bg-amber-100 border border-amber-200 text-amber-900 text-[11px] font-bold leading-relaxed px-3 py-2 mb-2">
              {READ_ONLY_MESSAGE}
            </div>
          )}

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
                    disabled={claiming || readOnly}
                    onClick={() => handleClaim(false)}
                    className="rounded-lg bg-[#123F3A] text-white text-[11px] font-bold px-3 py-1.5 disabled:opacity-50"
                  >
                    استلام المحادثة
                  </button>
                )}
                {thread.can_take_over && !thread.can_claim && (
                  <button
                    type="button"
                    disabled={claiming || readOnly}
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
              className={`flex-shrink-0 w-10 h-10 rounded-full border border-neutral-200 bg-white flex items-center justify-center text-sm cursor-pointer hover:border-[#123F3A]/40 ${
                !canCompose || sending ? 'opacity-50 pointer-events-none' : ''
              }`}
              title={`إرفاق ملفات (حتى ${INBOX_ATTACHMENT_MAX_FILES})`}
            >
              📎
              <input
                ref={fileInput}
                type="file"
                multiple
                className="hidden"
                disabled={!canCompose || sending}
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
              disabled={!canCompose || sending}
              rows={1}
              maxLength={20000}
              placeholder={readOnly ? 'الإرسال معطّل في هذه النسخة التجريبية' : 'اكتب رسالتك للمورد…'}
              className="flex-1 min-w-0 resize-none rounded-3xl border border-neutral-200 bg-white px-4 py-2.5 text-[13px] leading-relaxed max-h-32 disabled:bg-neutral-100 disabled:text-neutral-400 disabled:cursor-not-allowed"
            />
            <button
              type="button"
              disabled={!canCompose || sending || !text.trim()}
              onClick={handleSend}
              className="flex-shrink-0 h-10 rounded-full bg-[#123F3A] text-white text-xs font-bold px-5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sending ? '…' : 'إرسال'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
            <label className="inline-flex items-center gap-1.5 text-[11px] text-neutral-700">
              <input
                type="checkbox"
                checked={includeItems}
                disabled={!canCompose || sending || !itemPackage?.can_attach_items}
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
              {unreadNow > 0
                ? `${unreadNow} غير مقروءة`
                : thread.older_than
                  ? 'كل الرسائل المعروضة مقروءة'
                  : 'كل الرسائل مقروءة'}
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
      )}
    </div>
  )
}

export default ChatPane
