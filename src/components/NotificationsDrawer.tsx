import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppView } from '../types'
import { BellIcon, XIcon } from '../icons'
import { useProcurement } from '../procurementContext'
import {
  formatArDate,
  formatRfqReference,
  listConstructionInboxMessages,
  markConstructionInboxMessageRead,
  type ConstructionInboxMessage,
} from '../api/constructionClient'
import {
  groupNotificationsByDay,
  notificationTimestamp,
  relativeTimeAr,
  type NotificationDayGroup,
} from '../lib/notificationOrder'

interface NotificationsDrawerProps {
  onClose: () => void
  navigate: (v: AppView) => void
  onUnreadChange?: (count: number) => void
}

function dayHeading(group: NotificationDayGroup<ConstructionInboxMessage>): string {
  if (group.kind === 'today') return 'اليوم'
  if (group.kind === 'yesterday') return 'أمس'
  if (group.kind === 'undated' || group.dayStart === null) return 'بدون تاريخ'
  return formatArDate(new Date(group.dayStart).toISOString())
}

function exactDateTime(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })
}

function supplierLabel(message: ConstructionInboxMessage): string {
  const fromName = String(message.sender || '')
    .replace(/\s+via\s+\S.*$/i, '')
    .replace(/\s*<[^>]+>\s*$/, '')
    .replace(/^"|"$/g, '')
    .trim()
  return (
    message.supplier_name_ar ||
    message.supplier_name_en ||
    (fromName && fromName !== 'مورد' ? fromName : null) ||
    message.sender ||
    'مورد بدون اسم'
  )
}

function LoadingSkeleton() {
  return (
    <div className="px-4 py-4 space-y-2" role="status" aria-busy="true">
      <span className="sr-only">جاري تحميل الإشعارات…</span>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-3 rounded-2xl border border-neutral-100 px-4 py-3.5 animate-pulse" aria-hidden="true">
          <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-neutral-200" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-2/3 rounded-full bg-neutral-200" />
            <div className="h-3 w-full rounded-full bg-neutral-100" />
            <div className="h-2.5 w-1/4 rounded-full bg-neutral-100" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function NotificationsDrawer({ onClose, navigate, onUnreadChange }: NotificationsDrawerProps) {
  const { openRfq, setSelectedOfferId } = useProcurement()
  const [messages, setMessages] = useState<ConstructionInboxMessage[]>([])
  // null = the server has not told us (loading or failed). Never rendered as a number.
  const [unreadCount, setUnreadCount] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listConstructionInboxMessages()
      .then((page) => {
        if (cancelled) return
        setMessages(page.messages || [])
        setUnreadCount(page.unread_count ?? 0)
        setHasMore(Boolean(page.next_cursor))
        onUnreadChange?.(page.unread_count ?? 0)
        setNow(Date.now())
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setMessages([])
        setUnreadCount(null)
        setHasMore(false)
        // Deliberately NOT reporting 0 upward: a failed read is "unknown", not "nothing unread".
        setError(err instanceof Error && err.message ? err.message : 'خطأ غير معروف')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [onUnreadChange, reloadKey])

  // Keep «قبل 5 دقائق» honest while the drawer stays open. Clock only — no network.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  // The parent may pass a new `onClose` on every render; keep the latest in a ref so
  // the listener is bound once and focus is moved once (never stolen mid-navigation).
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    closeButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Order is DERIVED from state on every change (load, mark-read, anything later),
  // so it cannot drift: whatever is in `messages`, what is shown is newest first.
  const groups = useMemo(() => groupNotificationsByDay(messages, now), [messages, now])

  const openMessage = async (message: ConstructionInboxMessage) => {
    if (message.unread) {
      try {
        await markConstructionInboxMessageRead(message.id)
        setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, unread: false } : m)))
        if (unreadCount !== null) {
          const nextUnread = Math.max(0, unreadCount - 1)
          setUnreadCount(nextUnread)
          onUnreadChange?.(nextUnread)
        }
      } catch {
        // Still navigate — read state is best-effort.
      }
    }
    const rfqId = message.rfq_id
    if (rfqId && message.invite_id) {
      setSelectedOfferId(message.invite_id)
      openRfq(rfqId, 'offer-detail')
    } else if (rfqId) {
      openRfq(rfqId, 'offers')
    } else {
      navigate('inbox')
    }
    onClose()
  }

  const goToInbox = () => {
    navigate('inbox')
    onClose()
  }

  const statusLine = loading
    ? 'جاري التحميل…'
    : error
      ? 'تعذّر التحميل — العدد غير معروف'
      : unreadCount !== null && unreadCount > 0
        ? `${unreadCount} غير مقروءة · الأحدث أولًا`
        : messages.length > 0
          ? 'كلها مقروءة · الأحدث أولًا'
          : 'لا جديد'

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="الإشعارات">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div className="absolute top-0 bottom-0 left-0 w-full max-w-md bg-white shadow-2xl animate-fade-up flex flex-col">
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0 w-10 h-10 rounded-2xl bg-[#CFF5DC] text-[#123F3A] flex items-center justify-center">
              <BellIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-[#0D1F1D]">الإشعارات</h2>
              <div className={`text-xs mt-0.5 ${error && !loading ? 'text-amber-800' : 'text-neutral-400'}`} aria-live="polite">
                {statusLine}
              </div>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#123F3A]"
            type="button"
            aria-label="إغلاق الإشعارات"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <LoadingSkeleton />
          ) : error ? (
            <div className="p-6" role="alert">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5 text-center text-sm">
                <p className="text-amber-900 font-bold mb-2">تعذّر قراءة إشعارات الوارد</p>
                <p className="text-xs text-amber-900/80 leading-relaxed mb-1">
                  فشل طلب قائمة رسائل الوارد من الخادم، فلا نعرف الآن هل توجد رسائل جديدة أم لا.
                </p>
                <p className="text-xs text-neutral-600 leading-relaxed mb-4 break-words">
                  السبب كما ورد: <bdi>{error}</bdi>
                </p>
                <button
                  type="button"
                  onClick={() => setReloadKey((k) => k + 1)}
                  className="rounded-xl bg-[#123F3A] px-4 py-2 text-xs font-bold text-white hover:bg-[#0D1F1D] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#123F3A]"
                >
                  إعادة المحاولة
                </button>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed text-center mt-4">
                الإشعارات هنا = رسائل وارد مربوطة بدعوة RFQ عبر <bdi>replies.farq.sa</bdi> أو مزامنة Gmail المرتبطة.
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="p-8 text-center text-sm">
              <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-[#CFF5DC]/60 text-[#123F3A] flex items-center justify-center">
                <BellIcon className="w-6 h-6" />
              </div>
              <p className="text-[#0D1F1D] font-bold mb-2">لا إشعارات واردة بعد.</p>
              <p className="text-xs text-neutral-400 leading-relaxed max-w-sm mx-auto mb-3">
                تظهر هنا رسائل الموردين بعد ربطها بدعوة RFQ: عبر Reply-To على{' '}
                <bdi className="font-semibold">replies.farq.sa</bdi>، أو عبر مزامنة Gmail لصندوق الشركة{' '}
                <bdi className="font-semibold">info@farq.sa</bdi> عند تطابق فريد (مرجع ELE-RFQ-…، In-Reply-To، أو اسم
                المورد في From).
              </p>
              <p className="text-xs text-neutral-500 leading-relaxed max-w-sm mx-auto bg-neutral-50 rounded-xl px-3 py-2">
                ردود Zendesk/CC التي تصل إلى info@ تظهر هنا بعد ربط Gmail وتشغيل المزامنة من صندوق الوارد — بشرط تطابق
                فريد مع الدعوة. الغامض لا يُستورد تلقائيًا.
              </p>
              <button
                type="button"
                onClick={goToInbox}
                className="mt-4 text-xs font-bold text-[#123F3A] hover:underline"
              >
                فتح صندوق الوارد / ربط Gmail ←
              </button>
            </div>
          ) : (
            <>
              {groups.map((group) => (
                <section key={group.key} aria-label={dayHeading(group)}>
                  <h3 className="sticky top-0 z-10 px-5 py-2 bg-white/95 backdrop-blur border-b border-neutral-100 text-[11px] font-black text-[#123F3A]">
                    {dayHeading(group)}
                  </h3>
                  <ul className="px-3 py-2 space-y-1.5">
                    {group.items.map((message) => {
                      const supplier = supplierLabel(message)
                      const reference = message.rfq_reference || formatRfqReference(message.rfq_id)
                      const ts = notificationTimestamp(message)
                      const relative = relativeTimeAr(ts, now)
                      const timeText = ts === null ? 'التاريخ غير متوفر' : relative || formatArDate(message.received_at)
                      const unread = Boolean(message.unread)
                      return (
                        <li key={message.id}>
                          <button
                            type="button"
                            onClick={() => void openMessage(message)}
                            aria-label={`${unread ? 'غير مقروءة: ' : ''}رسالة من ${supplier}، ${timeText}`}
                            className={`w-full text-right rounded-2xl border px-4 py-3.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#123F3A] ${
                              unread
                                ? 'border-[#CFF5DC] bg-[#CFF5DC]/30 hover:bg-[#CFF5DC]/50'
                                : 'border-transparent bg-white hover:bg-neutral-50'
                            }`}
                          >
                            <div className="flex gap-3">
                              <div
                                className={`flex-shrink-0 w-2 h-2 mt-2 rounded-full ${
                                  unread ? 'bg-[#123F3A]' : 'bg-neutral-200'
                                }`}
                                aria-hidden="true"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-3 mb-1">
                                  <div
                                    className={`text-sm leading-snug truncate ${
                                      unread ? 'font-black text-[#0D1F1D]' : 'font-semibold text-neutral-600'
                                    }`}
                                  >
                                    رسالة من {supplier}
                                  </div>
                                  <time
                                    className={`flex-shrink-0 text-[11px] ${
                                      unread ? 'font-bold text-[#123F3A]' : 'text-neutral-400'
                                    }`}
                                    dateTime={ts === null ? undefined : new Date(ts).toISOString()}
                                    title={ts === null ? 'لم يرسل الخادم تاريخًا مقروءًا لهذه الرسالة' : exactDateTime(ts)}
                                  >
                                    {timeText}
                                  </time>
                                </div>
                                <div
                                  className={`text-xs leading-relaxed ${unread ? 'text-neutral-600' : 'text-neutral-400'}`}
                                >
                                  {message.locked ? 'مغلق حتى فتح الظروف' : message.subject || 'بدون عنوان'}
                                  {' · '}
                                  <bdi>{reference}</bdi>
                                </div>
                              </div>
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
              <div className="px-5 py-4 text-center border-t border-neutral-100">
                {hasMore && (
                  <p className="text-[11px] text-neutral-400 leading-relaxed mb-2">
                    هذه أول دفعة أرسلها الخادم فقط — توجد رسائل أخرى في صندوق الوارد.
                  </p>
                )}
                <button type="button" onClick={goToInbox} className="text-xs font-bold text-[#123F3A] hover:underline">
                  فتح صندوق الوارد ←
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default NotificationsDrawer
