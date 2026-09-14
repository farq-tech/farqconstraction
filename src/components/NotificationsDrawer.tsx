import type { AppView } from '../types'
import { XIcon } from '../icons'

interface NotificationsDrawerProps {
  onClose: () => void
  navigate: (v: AppView) => void
}

const NOTIFS = [
  {
    id: 1,
    title: 'عرض جديد من الخزف السعودي',
    body: 'وصل عرض مكتمل على RFQ-2024-089 — 213,968 ر.س',
    time: 'منذ 45 دقيقة',
    unread: true,
    target: 'offer-detail' as AppView,
  },
  {
    id: 2,
    title: 'عرض جزئي من كابلات الرياض',
    body: 'أرسل عرضًا على 3 من 4 بنود فقط',
    time: 'منذ ساعتين',
    unread: true,
    target: 'offer-detail' as AppView,
  },
  {
    id: 3,
    title: 'يوم واحد للموعد النهائي',
    body: 'RFQ-2024-089 ينتهي غدًا الساعة 11:59 مساءً',
    time: 'منذ 3 ساعات',
    unread: true,
    target: 'rfq-detail' as AppView,
  },
  {
    id: 4,
    title: 'فشل إرسال 5 دعوات',
    body: 'تعذّر الوصول إلى بعض الموردين في RFQ-2024-089',
    time: 'أمس',
    unread: false,
    target: 'sent-failure' as AppView,
  },
  {
    id: 5,
    title: 'تمت ترسية عرض توسعة مستشفى',
    body: 'اعتمد العرض على حديد سابك — 1,240,000 ر.س',
    time: 'قبل يومين',
    unread: false,
    target: 'award-success' as AppView,
  },
]

export function NotificationsDrawer({ onClose, navigate }: NotificationsDrawerProps) {
  const handleClick = (target: AppView) => {
    onClose()
    navigate(target)
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed top-0 left-0 bottom-0 w-full max-w-sm bg-white z-50 shadow-2xl flex flex-col" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
          <div>
            <h2 className="text-lg font-black text-[#0D1F1D]">الإشعارات</h2>
            <div className="text-xs text-neutral-400">{NOTIFS.filter(n => n.unread).length} غير مقروءة</div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <XIcon className="w-5 h-5 text-neutral-500" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-neutral-50">
          {NOTIFS.map(n => (
            <button
              key={n.id}
              onClick={() => handleClick(n.target)}
              className={`w-full text-right px-5 py-4 hover:bg-neutral-50 transition-colors flex gap-3 ${n.unread ? '' : 'opacity-70'}`}
            >
              {n.unread && (
                <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-[#123F3A]" />
              )}
              {!n.unread && (
                <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-transparent" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-[#0D1F1D] mb-0.5 leading-snug">{n.title}</div>
                <div className="text-xs text-neutral-500 leading-relaxed mb-1">{n.body}</div>
                <div className="text-[10px] text-neutral-400">{n.time}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-neutral-100">
          <button className="w-full text-center text-xs text-neutral-400 hover:text-[#123F3A] transition-colors font-semibold">
            تعليم الكل كمقروء
          </button>
        </div>
      </div>
    </>
  )
}
