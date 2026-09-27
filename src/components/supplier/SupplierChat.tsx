/**
 * «المحادثة» inside one request, supplier side (frames 4a–4f, F3).
 *
 * Styles follow the buyer's MessageBubble / ChatPane: warm dotted wallpaper,
 * white bubbles for the buyer on the start side, #DCF2E4 for ours, system rows
 * as centred pills, composer with 📎 / textarea / «إرسال».
 *
 * The supplier sees two states on a sent message — «أُرسلت» and «قُرئت» —
 * plus the transient «جارٍ الإرسال…» and «لم تُرسل» with «أعد المحاولة».
 * A retry re-sends the same outbox entry (same client_message_id).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  attachmentProblemAr,
  readAttachment,
  type SupplierAttachment,
  type SupplierMessage,
  type SupplierPortalClient,
} from '../../api/supplierPortalClient'
import { attachmentKind } from '../../lib/inboxChat'
import {
  cacheMessages,
  cachedMessages,
  chatDaySeparatorAr,
  deliverPending,
  deliveryLabel,
  fileSizeAr,
  formatTimeAr,
  lineRefLabel,
  newClientMessageId,
  outboxReducer,
  shortCompany,
  sortMessages,
  visiblePending,
  withLineRef,
  type LineRef,
  type PendingMessage,
} from '../../lib/supplierPortal'
import {
  CheckDoubleIcon,
  CheckIcon,
  ChatIcon,
  ClockIcon,
  DownloadIcon,
  FileIcon,
  InfoIcon,
  PaperclipIcon,
  RetryIcon,
  WifiOffIcon,
  XSmallIcon,
} from './PortalChrome'

const POLL_MS = 15_000

/** CSS-only wallpaper, same as the buyer's ChatPane. */
const WALLPAPER = {
  backgroundColor: '#F2EFE8',
  backgroundImage:
    'radial-gradient(rgba(18,63,58,0.07) 1px, transparent 1.5px), radial-gradient(rgba(18,63,58,0.04) 1px, transparent 1.5px)',
  backgroundSize: '22px 22px, 22px 22px',
  backgroundPosition: '0 0, 11px 11px',
} as const

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

// ─── Pieces ──────────────────────────────────────────────────────────────

function SystemPill({ label, event = false }: { label: string; event?: boolean }) {
  return (
    <div className="flex justify-center py-1.5">
      {event ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e0efec] px-3 py-[5px] text-[11px] font-bold text-[#123F3A] text-center">
          <FileIcon className="w-3.5 h-3.5 flex-shrink-0" />
          {label}
        </span>
      ) : (
        <span className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-bold text-neutral-600 shadow-[0_1px_0.5px_rgba(13,31,29,0.06)]">
          {label}
        </span>
      )}
    </div>
  )
}

function KindSquare({ kind }: { kind: string }) {
  return (
    <span className="flex-shrink-0 w-9 h-9 rounded-lg bg-[#123F3A]/10 text-[#123F3A] text-[9px] font-black flex items-center justify-center">
      {kind || 'ملف'}
    </span>
  )
}

function AttachmentRow({ file }: { file: SupplierAttachment }) {
  const kind = attachmentKind({ filename: file.filename, content_type: file.content_type })
  const size = fileSizeAr(file.size)
  const body = (
    <>
      <KindSquare kind={kind} />
      <span className="min-w-0 flex-1 text-start">
        <bdi className="block truncate text-[11px] font-bold text-[#0D1F1D]">{file.filename}</bdi>
        <span className="block text-[10px] text-neutral-500">{[kind, size].filter(Boolean).join(' · ')}</span>
      </span>
      {file.url && <DownloadIcon className="w-4 h-4 flex-shrink-0 text-[#123F3A]" />}
    </>
  )
  const frame = 'w-full flex items-center gap-2.5 rounded-xl border border-black/5 bg-white px-2.5 py-2'
  return file.url ? (
    <a href={file.url} target="_blank" rel="noopener noreferrer" download={file.filename} className={`${frame} hover:border-[#123F3A]/40`}>
      {body}
    </a>
  ) : (
    <div className={frame}>{body}</div>
  )
}

function PendingFileRow({ file, pending }: { file: File; pending: PendingMessage }) {
  const kind = attachmentKind({ filename: file.name, content_type: file.type })
  const pct = pending.progress == null ? null : Math.round(pending.progress * 100)
  return (
    <div className="w-full rounded-xl border border-black/5 bg-white px-2.5 py-2">
      <div className="flex items-center gap-2.5">
        <KindSquare kind={kind} />
        <span className="min-w-0 flex-1 text-start">
          <bdi className="block truncate text-[11px] font-bold text-[#0D1F1D]">{file.name}</bdi>
          {pending.state === 'failed' ? (
            <span className="block text-[10px] font-semibold text-red-600">تعذّر الرفع — تحقق من الاتصال</span>
          ) : pending.state === 'queued' ? (
            <span className="block text-[10px] text-neutral-500">بانتظار الاتصال</span>
          ) : (
            <span className="block text-[10px] text-neutral-500">جارٍ الرفع…{pct != null ? ` ${pct}%` : ''}</span>
          )}
        </span>
        {pending.state === 'failed' && <RetryIcon className="w-4 h-4 flex-shrink-0 text-red-600" />}
      </div>
      {pending.state === 'sending' && (
        // Fills from the right: the reading direction.
        <div className="mt-2 h-1 rounded-full bg-neutral-100 overflow-hidden flex justify-start">
          <div className="h-full bg-[#123F3A] transition-[width]" style={{ width: `${pct ?? 5}%` }} />
        </div>
      )}
    </div>
  )
}

function bubbleClass(mine: boolean): string {
  return `max-w-[82%] sm:max-w-[70%] flex flex-col gap-1 px-3.5 py-2.5 rounded-2xl shadow-[0_1px_0.5px_rgba(13,31,29,0.08)] ${
    mine ? 'bg-[#DCF2E4] rounded-se-md' : 'bg-white rounded-ss-md'
  }`
}

function Body({ text }: { text: string }) {
  if (!text) return null
  return <p className="text-[13px] leading-[1.65] text-[#0D1F1D] whitespace-pre-wrap break-words" dir="auto">{text}</p>
}

function ServerBubble({ message, author }: { message: SupplierMessage; author: string | null }) {
  const mine = message.direction === 'OUT'
  const status = deliveryLabel(message)
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={bubbleClass(mine)}>
        {!mine && author && <div className="text-[11px] font-bold text-[#123F3A]">{author}</div>}
        <Body text={message.body} />
        {message.attachments.map((file, index) => (
          <AttachmentRow key={file.id || index} file={file} />
        ))}
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-neutral-400">{formatTimeAr(message.created_at)}</span>
          {status && (
            <span className={`inline-flex items-center gap-[3px] font-bold ${status === 'قُرئت' ? 'text-[#123F3A]' : 'text-neutral-500'}`}>
              {status === 'قُرئت' ? <CheckDoubleIcon className="w-3 h-3" /> : <CheckIcon className="w-3 h-3" />}
              {status}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function PendingBubble({ pending, onRetry, online }: { pending: PendingMessage; onRetry: () => void; online: boolean }) {
  return (
    <div className="flex justify-end">
      <div className={bubbleClass(true)}>
        <Body text={pending.body} />
        {pending.files.map((file, index) => (
          <PendingFileRow key={`${file.name}-${index}`} file={file} pending={pending} />
        ))}
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-neutral-400">{formatTimeAr(pending.created_at)}</span>
          {pending.state === 'failed' ? (
            <span className="inline-flex items-center gap-[3px] font-bold text-red-600">
              <InfoIcon className="w-3 h-3" />
              لم تُرسل
            </span>
          ) : pending.state === 'queued' ? (
            <span className="inline-flex items-center gap-[3px] font-bold text-neutral-500">
              <ClockIcon className="w-3 h-3" />
              بانتظار الاتصال
            </span>
          ) : (
            <span className="inline-flex items-center gap-[3px] font-bold text-neutral-500">
              <ClockIcon className="w-3 h-3" />
              جارٍ الإرسال…
            </span>
          )}
        </div>
        {pending.state === 'failed' && (
          <>
            {pending.error && !pending.files.length && <div className="text-[10px] text-red-600">{pending.error}</div>}
            <button
              type="button"
              onClick={onRetry}
              disabled={!online}
              className="self-end inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[12px] font-bold text-red-600 disabled:opacity-50"
            >
              <RetryIcon className="w-3.5 h-3.5" />
              أعد المحاولة
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── The chat ────────────────────────────────────────────────────────────

type Row =
  | { type: 'day'; key: string; label: string }
  | { type: 'system'; key: string; label: string }
  | { type: 'message'; key: string; message: SupplierMessage; author: string | null }
  | { type: 'pending'; key: string; pending: PendingMessage }

export function SupplierChat({
  client,
  inviteId,
  company,
  lineRef,
  onClearLineRef,
  onRead,
  now,
}: {
  client: SupplierPortalClient
  inviteId: string
  company: string
  lineRef: LineRef | null
  onClearLineRef: () => void
  onRead: () => void
  now: number
}) {
  const online = useOnline()
  const [messages, setMessages] = useState<SupplierMessage[]>(() => cachedMessages(inviteId))
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [outbox, dispatch] = useReducer(outboxReducer, [])
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement | null>(null)
  const input = useRef<HTMLTextAreaElement | null>(null)
  const picker = useRef<HTMLInputElement | null>(null)
  const outboxRef = useRef(outbox)
  outboxRef.current = outbox

  const load = useCallback(async () => {
    try {
      const list = sortMessages(await client.listMessages(inviteId))
      setMessages(list)
      cacheMessages(inviteId, list)
      setLoadError(null)
      onRead()
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'تعذّر تحميل المحادثة.')
    } finally {
      setLoaded(true)
    }
  }, [client, inviteId, onRead])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!online) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [online, load])

  const deliver = useCallback(
    async (pending: PendingMessage) => {
      const sent = await deliverPending(pending, {
        send: (payload, onProgress) => client.sendMessage(inviteId, payload, onProgress),
        read: readAttachment,
        dispatch,
      })
      if (sent) {
        setMessages((prev) => {
          const next = prev.some((m) => m.id === sent.id || (sent.client_message_id && m.client_message_id === sent.client_message_id))
            ? prev
            : [...prev, sent]
          cacheMessages(inviteId, next)
          return next
        })
      }
    },
    [client, inviteId],
  )

  // Back online: send what was written while offline, then refresh.
  const wasOnline = useRef(online)
  useEffect(() => {
    const cameBack = online && !wasOnline.current
    wasOnline.current = online
    if (!cameBack) return
    for (const pending of outboxRef.current) if (pending.state === 'queued') void deliver(pending)
    void load()
  }, [online, deliver, load])

  useEffect(() => {
    if (lineRef) input.current?.focus()
  }, [lineRef])

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    let lastDay = ''
    const pushDay = (at: string | null | undefined) => {
      const label = chatDaySeparatorAr(at, now)
      if (label && label !== lastDay) {
        lastDay = label
        out.push({ type: 'day', key: `day-${label}-${out.length}`, label })
      }
    }
    let lastAuthor: string | null = null
    for (const message of messages) {
      pushDay(message.created_at)
      if (message.system_kind || message.channel === 'SYSTEM') {
        out.push({ type: 'system', key: `sys-${message.id}`, label: message.body })
        lastAuthor = null
        continue
      }
      const who = message.direction === 'IN' ? message.author || shortCompany(company) : 'me'
      const author =
        message.direction === 'IN' && who !== lastAuthor
          ? message.author
            ? `${shortCompany(company)} — ${message.author}`
            : shortCompany(company)
          : null
      lastAuthor = who
      out.push({ type: 'message', key: `m-${message.id}`, message, author })
    }
    for (const pending of visiblePending(messages, outbox)) {
      pushDay(pending.created_at)
      out.push({ type: 'pending', key: `p-${pending.client_message_id}`, pending })
    }
    return out
  }, [messages, outbox, company, now])

  // Keep the newest message in view.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [rows.length, outbox])

  const pickFiles = (list: FileList | null) => {
    if (!list || !list.length) return
    const next = [...files, ...Array.from(list)]
    const problem = attachmentProblemAr(next)
    setFileError(problem)
    if (!problem) setFiles(next)
    if (picker.current) picker.current.value = ''
  }

  const canSend = (text.trim().length > 0 || files.length > 0) && !fileError

  const send = () => {
    if (!canSend) return
    const pending: PendingMessage = {
      client_message_id: newClientMessageId(),
      body: withLineRef(text, lineRef),
      files,
      state: online ? 'sending' : 'queued',
      progress: null,
      error: null,
      created_at: new Date().toISOString(),
    }
    dispatch({ type: 'enqueue', message: pending })
    setText('')
    setFiles([])
    onClearLineRef()
    if (online) void deliver(pending)
  }

  const empty = loaded && messages.length === 0 && outbox.length === 0

  return (
    <div className="flex flex-col flex-1 min-h-0" style={WALLPAPER}>
      {!online && (
        <div className="mx-3 mt-3 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-[12px] font-semibold text-amber-800">
          <WifiOffIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
          لا يوجد اتصال — نعرض آخر رسائل محفوظة. أرسل رسالتك أول ما يرجع الاتصال.
        </div>
      )}
      {online && loadError && messages.length > 0 && (
        <div className="mx-3 mt-3 rounded-xl bg-white border border-neutral-200 px-3 py-2 text-[12px] text-neutral-600">{loadError}</div>
      )}

      <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3">
        <div className="max-w-2xl mx-auto flex flex-col gap-1 min-h-full justify-end">
          {!loaded && messages.length === 0 && (
            <div className="flex flex-col gap-2 animate-pulse" aria-hidden="true">
              <div className="self-start w-56 h-12 rounded-2xl bg-white/80" />
              <div className="self-end w-40 h-12 rounded-2xl bg-white/80" />
              <div className="self-start w-48 h-12 rounded-2xl bg-white/80" />
            </div>
          )}
          {empty && (
            <div className="m-auto w-full max-w-sm rounded-2xl bg-white px-5 py-6 text-center">
              {loadError ? (
                <>
                  <div className="text-[14px] font-bold text-[#0D1F1D] mb-1">تعذّر تحميل المحادثة</div>
                  <p className="text-[12px] text-neutral-500 mb-3">{loadError}</p>
                  <button type="button" onClick={() => void load()} className="text-[12px] font-bold text-[#123F3A]">
                    أعد المحاولة
                  </button>
                </>
              ) : (
                <>
                  <span className="mx-auto mb-2 w-9 h-9 rounded-full bg-[#e0efec] text-[#123F3A] flex items-center justify-center">
                    <ChatIcon className="w-4 h-4" />
                  </span>
                  <div className="text-[15px] font-black text-[#0D1F1D] mb-1">ابدأ المحادثة مع {shortCompany(company)}</div>
                  <p className="text-[12px] text-neutral-500 leading-relaxed">
                    اسألهم عن البنود أو أرسل ملف (PDF أو صور). رسالتك توصلهم مباشرة ويوصلك ردّهم هنا.
                  </p>
                </>
              )}
            </div>
          )}
          {rows.map((row) =>
            row.type === 'day' ? (
              <SystemPill key={row.key} label={row.label} />
            ) : row.type === 'system' ? (
              <SystemPill key={row.key} label={row.label} event />
            ) : row.type === 'message' ? (
              <ServerBubble key={row.key} message={row.message} author={row.author} />
            ) : (
              <PendingBubble key={row.key} pending={row.pending} online={online} onRetry={() => void deliver(row.pending)} />
            ),
          )}
        </div>
      </div>

      <div className="bg-[#F7F6F2] border-t border-neutral-200 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-2xl mx-auto">
          {lineRef && (
            <div className="mx-3 mt-2 flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-[#0D1F1D]">{lineRefLabel(lineRef)}</span>
              <button type="button" onClick={onClearLineRef} aria-label="إزالة البند" className="text-neutral-400 hover:text-neutral-600">
                <XSmallIcon className="w-4 h-4" />
              </button>
            </div>
          )}
          {(files.length > 0 || fileError) && (
            <div className="mx-3 mt-2 flex flex-wrap gap-1.5">
              {files.map((file, index) => (
                <span key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-1 rounded-full bg-white border border-neutral-200 px-2.5 py-1 text-[11px] font-semibold text-[#0D1F1D]">
                  <bdi className="truncate max-w-[180px]">{file.name}</bdi>
                  <button
                    type="button"
                    aria-label="إزالة الملف"
                    onClick={() => {
                      const next = files.filter((_, i) => i !== index)
                      setFiles(next)
                      setFileError(attachmentProblemAr(next))
                    }}
                    className="text-neutral-400"
                  >
                    <XSmallIcon className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
              {fileError && <span className="w-full text-[11px] font-semibold text-red-600">{fileError}</span>}
            </div>
          )}
          <div className="flex items-end gap-2 px-3 py-2.5">
            <input
              ref={picker}
              type="file"
              multiple
              accept="application/pdf,.pdf,image/*"
              className="hidden"
              onChange={(e) => pickFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => picker.current?.click()}
              aria-label="إرفاق ملف"
              className="w-10 h-10 flex-shrink-0 rounded-full bg-white border border-neutral-200 text-neutral-600 flex items-center justify-center"
            >
              <PaperclipIcon className="w-[18px] h-[18px]" />
            </button>
            <textarea
              ref={input}
              value={text}
              rows={1}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia?.('(pointer: fine)').matches) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder={online ? 'اكتب رسالتك…' : 'لا يوجد اتصال — نرسلها عند عودته'}
              className="flex-1 min-w-0 max-h-32 resize-none rounded-3xl border border-neutral-200 bg-white px-4 py-2 text-[13px] leading-6 outline-none focus:border-[#123F3A] [field-sizing:content]"
            />
            <button
              type="button"
              onClick={send}
              disabled={!canSend}
              className="h-10 flex-shrink-0 rounded-full bg-[#123F3A] px-5 text-[12px] font-bold text-white disabled:opacity-40"
            >
              إرسال
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SupplierChat
