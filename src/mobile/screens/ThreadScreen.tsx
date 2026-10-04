import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  claimConstructionInboxRequest,
  downloadConstructionInboxFile,
  getConstructionInboxThread,
  inboxThreadSupplierLabel,
  markConstructionInboxMessageRead,
  replyToConstructionInboxThread,
  type ConstructionInboxThreadDetail,
  type ConstructionInboxThreadFile,
  type ConstructionInboxThreadMessage,
} from '../../api/constructionClient'
import { chatTimeLabel } from '../../lib/inboxChat'
import { splitQuotedReply } from '../../lib/quotedEmail'
import type { Nav } from '../MobileApp'
import { Avatar, ErrorNote, Skeleton, useLoad } from '../ui'

/** A subject line that names the channel's source is never shown. */
function showSubject(subject?: string | null): boolean {
  const s = String(subject || '').trim()
  return Boolean(s) && !/حراج|haraj/i.test(s)
}

/**
 * Links in a message become buttons. A supplier link whose token the server
 * masked («…supplier_token=[رابط المورد محجوب]») cannot be opened, so it is
 * named for what it is instead of shown as a broken address.
 */
function richText(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(https?:\/\/[^\s\]]*?=\[[^\]\n]*\])|(https?:\/\/[^\s<>()\]]+)/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1]) {
      out.push(
        <span key={k++} className="inline-flex items-center gap-1 my-1 rounded-xl bg-black/[0.05] px-3 py-1.5 text-[13px] font-bold text-neutral-600">
          🔒 رابط تقديم العرض الخاص بالمورد
        </span>,
      )
    } else {
      const url = m[2].replace(/[.,،]+$/, '')
      let host = url
      try {
        host = new URL(url).hostname.replace(/^www\./, '')
      } catch {
        /* keep the raw text */
      }
      out.push(
        <a key={k++} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 my-1 rounded-xl bg-[#123F3A] px-3 py-1.5 text-[13px] font-bold text-white no-underline">
          افتح الرابط · <bdi dir="ltr">{host}</bdi>
        </a>,
      )
    }
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function Bubble({ m, onOpenFile }: { m: ConstructionInboxThreadMessage; onOpenFile: (f: ConstructionInboxThreadFile) => void }) {
  const inbound = m.direction === 'INBOUND'
  const [quoted, setQuoted] = useState(false)
  const split = inbound ? splitQuotedReply(m.body_text) : { visible: m.body_text || '', quoted: null as string | null }
  const state = String(m.state || '').toUpperCase()
  return (
    <div className={`max-w-[84%] rounded-[20px] px-3.5 py-2.5 shadow-[0_1px_1px_rgba(13,31,29,0.06)] ${inbound ? 'self-start bg-white rounded-ss-md' : 'self-end bg-[#DCF2E4] rounded-se-md'}`}>
      {m.kind_hint === 'DISPATCH' && <div className="text-[11px] font-bold text-[#1a7a45] mb-1">دعوة طلب عرض</div>}
      {showSubject(m.subject) && <div className="text-[12px] text-neutral-500 mb-1 truncate">{m.subject}</div>}
      {inbound && m.reply_summary_ar && (
        <div className="text-[12px] font-bold text-[#123F3A] bg-[#e0efec] rounded-lg px-2 py-1 mb-1.5">{m.reply_summary_ar}</div>
      )}
      <div dir="auto" className="text-[15px] leading-relaxed whitespace-pre-line text-start [overflow-wrap:anywhere]">
        {split.visible ? richText(split.visible) : '—'}
      </div>
      {split.quoted && (
        <>
          <button onClick={() => setQuoted((v) => !v)} className="mt-1 text-[12px] font-bold text-[#123F3A]">
            {quoted ? 'إخفاء الرسائل السابقة' : 'عرض الرسائل السابقة'}
          </button>
          {quoted && <pre dir="auto" className="mt-1 max-h-60 overflow-auto rounded-xl bg-black/[0.04] p-2 text-[12px] text-neutral-500 whitespace-pre-wrap font-sans">{split.quoted}</pre>}
        </>
      )}
      {(m.files || []).length > 0 && (
        <div className="mt-2 space-y-1.5">
          {(m.files || []).map((f) => (
            <button
              key={f.id}
              onClick={() => onOpenFile(f)}
              disabled={String(f.state || 'STORED').toUpperCase() !== 'STORED'}
              className="w-full flex items-center gap-2 rounded-xl bg-black/[0.04] px-3 py-2 text-right disabled:opacity-50"
            >
              <span className="text-[18px]">📎</span>
              <span className="flex-1 min-w-0 truncate text-[13px] font-semibold" dir="auto">{f.filename || 'مرفق'}</span>
              <span className="text-[12px] font-bold text-[#123F3A]">فتح</span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-neutral-400">
        {!inbound && state === 'FAILED' && <span className="font-bold text-red-600">لم يُرسل</span>}
        {!inbound && (state === 'SENDING' || state === 'PREPARED') && <span>جارٍ الإرسال</span>}
        <span>{chatTimeLabel(m.created_at)}</span>
        {!inbound && state === 'SENT' && <span className="text-[#1a7a45]">✓</span>}
      </div>
    </div>
  )
}

export default function ThreadScreen({ inviteId, nav }: { inviteId: string; nav: Nav }) {
  const thread = useLoad<ConstructionInboxThreadDetail>(() => getConstructionInboxThread(inviteId), [inviteId])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [note, setNote] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [viewer, setViewer] = useState<{ url: string; name: string; type: string } | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const marked = useRef(new Set<string>())

  const t = thread.data
  const name = t ? inboxThreadSupplierLabel(t) : ''
  const messages = t?.messages || []

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
    for (const m of messages) {
      if (m.direction === 'INBOUND' && m.unread && !marked.current.has(m.id)) {
        marked.current.add(m.id)
        void markConstructionInboxMessageRead(m.id).catch(() => marked.current.delete(m.id))
      }
    }
  }, [messages])

  const replyChannel = useMemo(() => {
    const lastIn = [...messages].reverse().find((m) => m.direction === 'INBOUND' && ['EMAIL', 'HARAJ', 'WHATSAPP'].includes(String(m.channel)))
    if (lastIn) return String(lastIn.channel)
    const available = (t?.send_channels || []).map((c) => String(c.channel))
    return available.includes('EMAIL') || !available.includes('HARAJ') ? 'EMAIL' : 'HARAJ'
  }, [messages, t])

  async function send() {
    if (!t?.invite_id || !text.trim() || sending) return
    if (replyChannel === 'WHATSAPP') {
      setNote({ tone: 'err', text: 'آخر رسالة من المورد وصلت على واتساب، والرد عليه يكون من تطبيق واتساب.' })
      return
    }
    setSending(true)
    setNote(null)
    try {
      const result = await replyToConstructionInboxThread(String(t.invite_id), {
        channel: replyChannel === 'HARAJ' ? 'HARAJ' : 'EMAIL',
        idempotency_key: crypto.randomUUID(),
        text: text.trim(),
        parent_message_id: t.last_message_id ?? null,
      })
      const state = String(result.state || '').toUpperCase()
      if (state === 'SENT') {
        setText('')
        setNote(null)
      } else {
        setNote({ tone: 'err', text: state === 'FAILED' ? 'لم تُرسل الرسالة. حاول مرة أخرى.' : 'لم نتأكد من وصول الرسالة. راجع المحادثة قبل إعادة الإرسال.' })
      }
      await thread.reload()
    } catch (e) {
      setNote({ tone: 'err', text: e instanceof Error ? e.message : 'تعذّر الإرسال.' })
    } finally {
      setSending(false)
    }
  }

  async function claim() {
    const rfqId = t?.request_context?.rfq_id || t?.rfq_id
    if (!rfqId) return
    try {
      await claimConstructionInboxRequest(String(rfqId), { take_over: Boolean(t?.can_take_over) })
      await thread.reload()
    } catch (e) {
      setNote({ tone: 'err', text: e instanceof Error ? e.message : 'تعذّر استلام المحادثة.' })
    }
  }

  async function openFile(f: ConstructionInboxThreadFile) {
    try {
      const blob = await downloadConstructionInboxFile(f.id)
      setViewer({ url: URL.createObjectURL(blob), name: f.filename || 'مرفق', type: blob.type || f.content_type || '' })
    } catch (e) {
      setNote({ tone: 'err', text: e instanceof Error ? e.message : 'تعذّر فتح المرفق.' })
    }
  }

  const quick = ['أرسل عرضك عبر الرابط لو سمحت', 'نحتاج المواصفة الفنية', 'هل السعر شامل الضريبة؟', 'متى موعد التوريد؟']

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#EEF0EA]">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-black/[0.06] m-safe-top">
        <div className="h-14 px-2 flex items-center gap-2">
          <button onClick={nav.back} className="h-10 px-2 text-[#123F3A] text-[28px] leading-none" aria-label="رجوع">›</button>
          {t && <Avatar name={name} size={36} />}
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[15px] truncate">{name || 'المحادثة'}</div>
            <div className="text-[12px] text-neutral-500 truncate">
              {replyChannel === 'EMAIL' ? 'عبر البريد' : replyChannel === 'WHATSAPP' ? 'عبر واتساب' : 'محادثة'}
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 px-3 py-3 flex flex-col gap-2">
        {thread.error && <ErrorNote message={thread.error} onRetry={thread.reload} />}
        {!t && !thread.error && <Skeleton rows={5} height={64} />}
        {messages.map((m) => (
          <Bubble key={m.id} m={m} onOpenFile={openFile} />
        ))}
        <div ref={endRef} />
      </div>

      {t && (
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-xl border-t border-black/[0.06] m-safe-bottom">
          {note && <div className={`px-4 pt-2 text-[13px] font-semibold ${note.tone === 'err' ? 'text-red-600' : 'text-[#1a7a45]'}`}>{note.text}</div>}
          {t.can_reply ? (
            <>
              <div className="flex gap-2 overflow-x-auto px-3 pt-2 m-scroll-x">
                {quick.map((q) => (
                  <button key={q} onClick={() => setText(q)} className="shrink-0 whitespace-nowrap h-8 px-3 rounded-full bg-[#e0efec] text-[#123F3A] text-[13px] font-semibold">
                    {q}
                  </button>
                ))}
              </div>
              <div className="flex items-end gap-2 p-3">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={1}
                  placeholder="اكتب رسالتك للمورد…"
                  className="flex-1 max-h-32 min-h-[44px] resize-none rounded-[22px] bg-black/[0.05] px-4 py-2.5 outline-none leading-snug"
                  style={{ fieldSizing: 'content' } as React.CSSProperties}
                />
                <button
                  onClick={send}
                  disabled={!text.trim() || sending}
                  className="shrink-0 w-11 h-11 rounded-full bg-[#123F3A] text-white flex items-center justify-center disabled:opacity-30 m-press"
                  aria-label="إرسال"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5 -scale-x-100" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" /></svg>
                </button>
              </div>
            </>
          ) : t.can_claim || t.can_take_over ? (
            <div className="p-3">
              <button onClick={claim} className="w-full h-12 rounded-2xl bg-[#123F3A] text-white font-bold">
                {t.can_take_over ? `استلم المحادثة من ${t.owner_name || 'زميلك'}` : 'استلم المحادثة للرد'}
              </button>
            </div>
          ) : (
            <div className="p-4 text-center text-[13px] text-neutral-500">
              {t.owner_name ? `يتولى ${t.owner_name} هذه المحادثة.` : 'لا يمكن الرد على هذه المحادثة.'}
            </div>
          )}
        </div>
      )}

      {viewer && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="m-safe-top bg-black text-white">
            <div className="h-12 px-3 flex items-center gap-3">
              <button
                onClick={() => {
                  URL.revokeObjectURL(viewer.url)
                  setViewer(null)
                }}
                className="text-[16px] font-bold"
              >
                إغلاق
              </button>
              <div className="flex-1 min-w-0 truncate text-[14px] text-white/80" dir="auto">{viewer.name}</div>
            </div>
          </div>
          {viewer.type.startsWith('image/') ? (
            <img src={viewer.url} alt={viewer.name} className="flex-1 object-contain" />
          ) : (
            <iframe src={viewer.url} title={viewer.name} className="flex-1 w-full bg-white" />
          )}
        </div>
      )}
    </div>
  )
}
