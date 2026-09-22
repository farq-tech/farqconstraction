import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { AppView } from '../types'
import { HomeIcon, FileIcon, InboxIcon, UsersIcon, SettingsIcon, BellIcon, AccountIcon } from '../icons'
import { NotificationsDrawer } from './NotificationsDrawer'
import { fetchTaseerRequests, fetchTaseerSuppliers } from '../api/taseerClient'
import { useProcurement } from '../procurementContext'
import { useFarqSession } from '../api/useFarqSession'
import { getNeedFlowStep, subscribeNeedFlowStep } from '../lib/needFlowStep'

interface ShellProps {
  view: AppView
  navigate: (v: AppView) => void
  children: React.ReactNode
}

function buildNav(offerBadge: string | null, isScopeOwner = false, inboxBadge: string | null = null) {
  return [
    {
      id: 'home' as AppView,
      label: 'الرئيسية',
      Icon: HomeIcon,
      active: (v: AppView) => v === 'home',
    },
    {
      // Requests, their offers, the comparison and the award are one place:
      // «العروض والمراسلات» next to «المراسلات» read as two inboxes.
      id: 'rfq-list' as AppView,
      label: 'الطلبات',
      Icon: FileIcon,
      badge: offerBadge || undefined,
      active: (v: AppView) =>
        [
          'rfq-list', 'create-upload', 'create-proposals', 'rfq-detail', 'rfq-closed', 'sent', 'sent-failure',
          'offers', 'offer-detail', 'comparison', 'award', 'award-success',
          'taseer-need', 'taseer-compare', 'taseer-chat',
        ].includes(v),
    },
    {
      id: 'inbox' as AppView,
      label: 'المراسلات',
      Icon: InboxIcon,
      badge: inboxBadge || undefined,
      active: (v: AppView) => v === 'inbox' || v === 'inbox-thread',
    },
    {
      id: 'taseer-sellers' as AppView,
      label: 'البائعون',
      Icon: UsersIcon,
      active: (v: AppView) => v === 'taseer-sellers',
    },
    // «مراجعة المواد» is the owner's tool for teaching the resolver; it lists
    // lines from every booklet the company has read. Colleagues never see it.
    ...(isScopeOwner
      ? [
          {
            id: 'learning-review' as AppView,
            label: 'مراجعة المواد',
            Icon: FileIcon,
            active: (v: AppView) => v === 'learning-review',
          },
        ]
      : []),
    {
      id: 'reports' as AppView,
      label: 'التقارير',
      Icon: FileIcon,
      active: (v: AppView) => v === 'reports',
    },
    {
      id: 'settings' as AppView,
      label: 'الإعدادات',
      Icon: SettingsIcon,
      active: (v: AppView) => v === 'settings' || v === 'access-denied',
    },
  ]
}

const CREATE_STEPS = [
  { n: 1, label: 'احتياجك', views: ['create-upload'] as AppView[] },
  { n: 2, label: 'النتائج', views: ['create-upload'] as AppView[] },
  { n: 3, label: 'الاختيار', views: ['create-upload'] as AppView[] },
]

const isCreateFlow = (v: AppView) => v === 'create-upload' || v === 'create-proposals'

/**
 * The Farq wordmark as the brand file draws it, tinted by `bg-*`: the artwork is
 * a mask, so one file serves a light header and a dark one without a second
 * export and without ever re-drawing the letters.
 */
function FarqWordmark({ className = '' }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="فرق"
      className={`inline-block aspect-[1564/648] ${className}`}
      style={{
        WebkitMaskImage: 'url(/brand/farq-wordmark.png)',
        maskImage: 'url(/brand/farq-wordmark.png)',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
    />
  )
}

export function Shell({ view, navigate, children }: ShellProps) {
  const { selectedRfqId, openRfq } = useProcurement()
  const [showNotifs, setShowNotifs] = useState(false)
  const [offerCount, setOfferCount] = useState<number | null>(null)
  const [inboxUnread, setInboxUnread] = useState<number | null>(null)
  const [latestRfqId, setLatestRfqId] = useState<string | null>(null)
  const session = useFarqSession()
  const needStep = useSyncExternalStore(subscribeNeedFlowStep, getNeedFlowStep, getNeedFlowStep)
  // The sidebar used to state «وضع تجريبي / بدون تسجيل دخول» unconditionally,
  // so a genuinely signed-in owner was told he was not signed in.
  const displayName = session.user?.displayName?.trim() || ''
  const email = session.user?.email?.trim() || ''
  const accountLine = session.isAuthenticated
    ? displayName || email || 'حسابك'
    : 'لم تسجّل الدخول'
  const accountSubLine = session.isAuthenticated
    ? (displayName && email ? email : 'مسجّل الدخول')
    : 'سجّل الدخول للمتابعة'
  const inCreate = isCreateFlow(view)
  const step = view === 'create-upload' ? needStep : 2
  const [isScopeOwner] = useState(false)
  const NAV = buildNav(
    offerCount != null && offerCount > 0 ? String(offerCount) : null,
    isScopeOwner,
    inboxUnread != null && inboxUnread > 0 ? String(inboxUnread) : null,
  )
  const onInboxUnreadChange = useCallback((count: number) => {
    setInboxUnread(count)
  }, [])

  const [badgeTick, setBadgeTick] = useState(0)
  useEffect(() => {
    const bump = () => setBadgeTick((n) => n + 1)
    const timer = window.setInterval(bump, 60_000)
    window.addEventListener('focus', bump)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', bump)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchTaseerSuppliers()
      .then((rows) => {
        if (!cancelled) setOfferCount(rows.reduce((sum, row) => sum + (row.offerCount || 0), 0))
      })
      .catch(() => {
        if (!cancelled) setOfferCount(null)
      })
    fetchTaseerRequests()
      .then((rows) => {
        if (!cancelled) setLatestRfqId(rows[0]?.token || null)
      })
      .catch(() => {
        if (!cancelled) setLatestRfqId(null)
      })
    setInboxUnread(0)
    return () => {
      cancelled = true
    }
  }, [session.isAuthenticated, badgeTick])


  function go(id: AppView) {
    if (id === 'offers') {
      // A draft made by an upload («RFQ-…») lives in this browser, not on the
      // server; the offers screen opens the latest real RFQ instead.
      const rfqId = (selectedRfqId && !selectedRfqId.startsWith('RFQ-') ? selectedRfqId : null) || latestRfqId
      if (rfqId) openRfq(rfqId, 'offers')
      else navigate('rfq-list')
      return
    }
    navigate(id)
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-[#FAFAF8] relative" dir="rtl">
      <aside className="hidden">
        <div className="flex items-center gap-3 px-5 py-6 border-b border-white/10">
          <div className="flex-1 min-w-0">
            <FarqWordmark className="h-7 bg-white" />
            <div className="text-white/50 text-xs mt-1.5">تسعير</div>
          </div>
        </div>

        <div className="px-4 pt-4">
          <button
            onClick={() => navigate('create-upload')}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#CFF5DC] text-[#123F3A] font-bold text-sm py-2.5 hover:bg-white transition-colors"
          >
            <span className="text-lg leading-none">+</span>
            طلب تسعير جديد
          </button>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto">
          {NAV.map(({ id, label, Icon, badge, active }) => {
            const isActive = active(view)
            return (
              <button
                key={id}
                onClick={() => go(id)}
                className={`w-full flex items-center gap-3 px-5 py-3 text-right transition-colors ${
                  isActive ? 'bg-white/12 text-white' : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                }`}
              >
                <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                <span className="text-sm font-medium">{label}</span>
                {badge && (
                  <span className="me-auto bg-[#CFF5DC] text-[#123F3A] text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">
                    {badge}
                  </span>
                )}
              </button>
            )
          })}

          <div className="mt-4 mx-3 border-t border-white/10 pt-4 space-y-1">
            <button
              onClick={() => navigate('supplier')}
              className="w-full flex items-center gap-2 px-3 py-2 text-right text-white/30 hover:text-white/60 transition-colors text-xs"
            >
              <span className="text-[10px]">↗</span>
              بوابة الموردين
            </button>
          </div>
        </nav>

        <div className="px-5 py-4 border-t border-white/10">
          <button
            onClick={() => setShowNotifs(true)}
            className="flex items-center gap-2 w-full mb-3 text-white/50 hover:text-white/80 transition-colors py-1"
          >
            <div className="relative flex-shrink-0">
              <BellIcon className="w-4 h-4" />
              {inboxUnread != null && inboxUnread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#CFF5DC] rounded-full" />
              )}
            </div>
            <span className="text-xs">الإشعارات</span>
            {inboxUnread != null && inboxUnread > 0 && (
              <span className="me-auto bg-[#CFF5DC]/20 text-[#CFF5DC] text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                {inboxUnread}
              </span>
            )}
          </button>
          <button onClick={() => navigate('settings')} className="flex items-center gap-3 w-full">
            <div className="w-8 h-8 rounded-full bg-[#CFF5DC] flex items-center justify-center flex-shrink-0 text-[#123F3A]">
              <AccountIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0 text-right">
              <div className="text-white text-sm font-semibold leading-none truncate">
                {accountLine}
              </div>
              <div className="text-white/40 text-xs mt-0.5 truncate">{accountSubLine}</div>
            </div>
          </button>
        </div>
      </aside>

      <div className="flex-1 min-h-0 flex flex-col">
        <header className="sticky top-0 z-40 bg-[#123F3A] px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate('home')} className="flex items-center gap-2">
            <FarqWordmark className="h-5 bg-white" />
            <span className="text-white/40 text-base leading-none">|</span>
            <span className="text-white/90 font-bold text-base leading-none">تسعير</span>
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowNotifs(true)} className="text-white/60 p-1 relative">
              <BellIcon className="w-5 h-5" />
              {inboxUnread != null && inboxUnread > 0 && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-[#CFF5DC] rounded-full" />
              )}
            </button>
            <button onClick={() => navigate('settings')} aria-label="حسابك والإعدادات" title="حسابك">
              <div className="w-8 h-8 rounded-full bg-[#CFF5DC] flex items-center justify-center text-[#123F3A]">
                <AccountIcon className="w-5 h-5" />
              </div>
            </button>
          </div>
        </header>

        <nav className="absolute bottom-0 inset-x-0 bg-white border-t border-neutral-100 z-40 flex">
          {NAV.filter((item) => item.id !== 'learning-review').slice(0, 5).map(({ id, label, Icon, badge, active }) => {
            const isActive = active(view)
            return (
              <button
                key={id}
                onClick={() => go(id)}
                className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 transition-colors relative ${
                  isActive ? 'text-[#123F3A]' : 'text-neutral-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{label.split(' ')[0]}</span>
                {badge && (
                  <span className="absolute top-1.5 left-[calc(50%+7px)] min-w-4 h-4 px-1 bg-[#123F3A] text-white text-[9px] font-black rounded-full flex items-center justify-center">
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {inCreate && (
          <div className="bg-white border-b border-neutral-100 px-6 py-4 sticky top-0 lg:top-0 z-30">
            <div className="max-w-3xl">
              <div className="flex items-center">
                {CREATE_STEPS.map((s, i) => (
                  <div key={s.n} className="flex items-center flex-1 last:flex-none">
                    <div className="flex items-center gap-2.5 shrink-0">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                          step >= s.n ? 'bg-[#123F3A] text-white' : 'bg-neutral-100 text-neutral-400'
                        }`}
                      >
                        {s.n}
                      </div>
                      <span
                        className={`text-sm font-semibold hidden sm:block ${
                          step >= s.n ? 'text-[#0D1F1D]' : 'text-neutral-400'
                        }`}
                      >
                        {s.label}
                      </span>
                    </div>
                    {i < CREATE_STEPS.length - 1 && (
                      <div className={`flex-1 h-px mx-3 ${step > s.n ? 'bg-[#123F3A]' : 'bg-neutral-200'}`} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-24">{children}</main>
      </div>

      {showNotifs && (
        <NotificationsDrawer
          onClose={() => setShowNotifs(false)}
          navigate={navigate}
          onUnreadChange={onInboxUnreadChange}
        />
      )}
    </div>
  )
}

export default Shell
