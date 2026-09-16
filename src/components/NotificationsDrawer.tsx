import { useEffect, useState } from 'react'
import type { AppView } from '../types'
import { XIcon } from '../icons'
import { useProcurement } from '../procurementContext'
import {
  formatArDate,
  formatRfqReference,
  listConstructionInboxMessages,
  markConstructionInboxMessageRead,
  type ConstructionInboxMessage,
} from '../api/constructionClient'

interface NotificationsDrawerProps {
  onClose: () => void
  navigate: (v: AppView) => void
  onUnreadChange?: (count: number) => void
}

export function NotificationsDrawer({ onClose, navigate, onUnreadChange }: NotificationsDrawerProps) {
  const { openRfq, setSelectedOfferId } = useProcurement()
  const [messages, setMessages] = useState<ConstructionInboxMessage[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listConstructionInboxMessages()
      .then((page) => {
        if (cancelled) return
        setMessages(page.messages || [])
        setUnreadCount(page.unread_count ?? 0)
        onUnreadChange?.(page.unread_count ?? 0)
        setError(null)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setMessages([])
        setUnreadCount(0)
        onUnreadChange?.(0)
        setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [onUnreadChange])

  const openMessage = async (message: ConstructionInboxMessage) => {
    if (message.unread) {
      try {
        await markConstructionInboxMessageRead(message.id)
        setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, unread: false } : m)))
        const nextUnread = Math.max(0, unreadCount - 1)
        setUnreadCount(nextUnread)
        onUnreadChange?.(nextUnread)
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

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute top-0 bottom-0 left-0 w-full max-w-md bg-white shadow-2xl animate-fade-up flex flex-col">
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-[#0D1F1D]">الإشعارات</h2>
            <div className="text-xs text-neutral-400 mt-0.5">
              {unreadCount > 0 ? `${unreadCount} غير مقروءة` : 'لا جديد'}
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-neutral-400 hover:text-neutral-600" type="button">
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-neutral-400 text-sm">جاري التحميل…</div>
          ) : error ? (
            <div className="p-8 text-center text-sm">
              <p className="text-amber-800 font-bold mb-2">تعذّر قراءة إشعارات الوارد</p>
              <p className="text-xs text-neutral-500 leading-relaxed mb-3">{error}</p>
              <p className="text-xs text-neutral-400 leading-relaxed">
                الإشعارات هنا = رسائل وارد مربوطة بدعوة RFQ عبر `replies.farq.sa` أو مزامنة Gmail المرتبطة.
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="p-8 text-center text-sm">
              <p className="text-neutral-500 mb-2">لا إشعارات واردة بعد.</p>
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
                onClick={() => {
                  navigate('inbox')
                  onClose()
                }}
                className="mt-4 text-xs font-bold text-[#123F3A] hover:underline"
              >
                فتح صندوق الوارد / ربط Gmail ←
              </button>
            </div>
          ) : (
            messages.map((message) => {
              const fromName = String(message.sender || '')
                .replace(/\s+via\s+\S.*$/i, '')
                .replace(/\s*<[^>]+>\s*$/, '')
                .replace(/^"|"$/g, '')
                .trim()
              const supplier =
                message.supplier_name_ar ||
                message.supplier_name_en ||
                (fromName && fromName !== 'مورد' ? fromName : null) ||
                message.sender ||
                'مورد بدون اسم'
              const reference =
                message.rfq_reference || formatRfqReference(message.rfq_id)
              return (
                <button
                  key={message.id}
                  type="button"
                  onClick={() => void openMessage(message)}
                  className={`w-full text-right px-5 py-4 border-b border-neutral-50 hover:bg-[#f0faf7]/50 ${
                    message.unread ? '' : 'opacity-70'
                  }`}
                >
                  <div className="flex gap-3">
                    <div
                      className={`flex-shrink-0 w-2 h-2 mt-2 rounded-full ${
                        message.unread ? 'bg-[#123F3A]' : 'bg-transparent'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm text-[#0D1F1D] mb-1 leading-snug">
                        رسالة من {supplier}
                      </div>
                      <div className="text-xs text-neutral-500 mb-1 leading-relaxed">
                        {message.locked
                          ? 'مغلق حتى فتح الظروف'
                          : message.subject || 'بدون عنوان'}
                        {' · '}
                        <bdi>{reference}</bdi>
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        {formatArDate(message.received_at)}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

export default NotificationsDrawer
