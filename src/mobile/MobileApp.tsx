import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { useFarqSession } from '../api/useFarqSession'
import { listConstructionInboxThreads } from '../api/constructionClient'
import LoginScreen from './screens/LoginScreen'
import HomeScreen from './screens/HomeScreen'
import RequestsScreen from './screens/RequestsScreen'
import RequestDetailScreen from './screens/RequestDetailScreen'
import InboxScreen from './screens/InboxScreen'
import ThreadScreen from './screens/ThreadScreen'
import SuppliersScreen from './screens/SuppliersScreen'
import MoreScreen from './screens/MoreScreen'
import ReportsScreen from './screens/ReportsScreen'
import PricesScreen from './screens/PricesScreen'
import NewRequestScreen from './screens/NewRequestScreen'
import PurchaseScanScreen from './screens/PurchaseScanScreen'
import { HomeIcon, FileIcon, InboxIcon, UsersIcon } from '../icons'
import { statusBar } from './native'
import { enablePush } from './push'

export type Tab = 'home' | 'requests' | 'inbox' | 'suppliers' | 'more'

/** A pushed screen on top of a tab's root. */
export type Route =
  | { kind: 'request'; id: string }
  | { kind: 'thread'; inviteId: string }
  | { kind: 'reports' }
  | { kind: 'prices' }
  | { kind: 'new'; draftId?: string }
  | { kind: 'scan' }

export type Nav = {
  push: (route: Route) => void
  back: () => void
  switchTab: (tab: Tab, route?: Route) => void
}

const TABS: Array<{ id: Tab; label: string; Icon?: (p: { className?: string }) => ReactElement }> = [
  { id: 'home', label: 'الرئيسية', Icon: HomeIcon },
  { id: 'requests', label: 'الطلبات', Icon: FileIcon },
  { id: 'inbox', label: 'المراسلات', Icon: InboxIcon },
  { id: 'suppliers', label: 'الموردون', Icon: UsersIcon },
  { id: 'more', label: 'المزيد' },
]

export default function MobileApp() {
  const session = useFarqSession()
  const [tab, setTab] = useState<Tab>('home')
  const [stacks, setStacks] = useState<Record<Tab, Route[]>>({ home: [], requests: [], inbox: [], suppliers: [], more: [] })
  const [needsReply, setNeedsReply] = useState(0)

  const stack = stacks[tab]
  const top = stack[stack.length - 1]

  const push = useCallback(
    (route: Route) => {
      setStacks((s) => ({ ...s, [tab]: [...s[tab], route] }))
      window.scrollTo(0, 0)
    },
    [tab],
  )
  const back = useCallback(() => {
    setStacks((s) => ({ ...s, [tab]: s[tab].slice(0, -1) }))
  }, [tab])
  const switchTab = useCallback((next: Tab, route?: Route) => {
    setTab(next)
    setStacks((s) => ({ ...s, [next]: route ? [route] : s[next] }))
    window.scrollTo(0, 0)
  }, [])
  const nav: Nav = { push, back, switchTab }

  // The inbox badge: conversations that still need an answer.
  useEffect(() => {
    if (!session.isAuthenticated) return
    let alive = true
    const load = () =>
      listConstructionInboxThreads({ filter: 'needs_reply' })
        .then((r) => alive && setNeedsReply(Number(r.follow_up_counts?.action ?? r.total_count ?? r.threads.length) || 0))
        .catch(() => {})
    void load()
    const timer = window.setInterval(load, 60_000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [session.isAuthenticated, tab])

  // Light status-bar text over the green home header and sign-in; dark elsewhere.
  const onDark = !session.isAuthenticated || (tab === 'home' && !top)
  useEffect(() => {
    statusBar(onDark)
  }, [onDark])

  // Notifications: ask once after sign-in; a tap opens what it is about.
  useEffect(() => {
    if (!session.isAuthenticated) return
    void enablePush((target) => {
      if (target.kind === 'QUOTE' && target.rfq_id) switchTab('requests', { kind: 'request', id: String(target.rfq_id) })
      else if (target.invite_id) switchTab('inbox', { kind: 'thread', inviteId: String(target.invite_id) })
      else if (target.rfq_id) switchTab('requests', { kind: 'request', id: String(target.rfq_id) })
    })
  }, [session.isAuthenticated, switchTab])

  if (!session.isAuthenticated) return <LoginScreen />

  function onTabTap(id: Tab) {
    if (id === tab) {
      // Tapping the current tab returns to its root, as iOS does.
      setStacks((s) => ({ ...s, [id]: [] }))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      setTab(id)
      window.scrollTo(0, 0)
    }
  }

  let screen: ReactElement
  if (top?.kind === 'request') screen = <RequestDetailScreen key={top.id} id={top.id} nav={nav} />
  else if (top?.kind === 'thread') screen = <ThreadScreen key={top.inviteId} inviteId={top.inviteId} nav={nav} />
  else if (top?.kind === 'reports') screen = <ReportsScreen nav={nav} />
  else if (top?.kind === 'prices') screen = <PricesScreen nav={nav} />
  else if (top?.kind === 'new') screen = <NewRequestScreen key={top.draftId || 'new'} nav={nav} draftId={top.draftId} />
  else if (top?.kind === 'scan') screen = <PurchaseScanScreen nav={nav} />
  else if (tab === 'home') screen = <HomeScreen nav={nav} />
  else if (tab === 'requests') screen = <RequestsScreen nav={nav} />
  else if (tab === 'inbox') screen = <InboxScreen nav={nav} />
  else if (tab === 'suppliers') screen = <SuppliersScreen nav={nav} />
  else screen = <MoreScreen nav={nav} />

  // The composer owns the bottom edge inside a conversation.
  const hideTabBar = top?.kind === 'thread' || top?.kind === 'new' || top?.kind === 'scan'

  return (
    <div className="min-h-[100dvh] bg-[#f2f3ef] text-[#0D1F1D]" dir="rtl">
      {screen}
      {!hideTabBar && (
        <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/90 backdrop-blur-xl border-t border-black/[0.06] m-safe-bottom">
          <div className="flex">
            {TABS.map(({ id, label, Icon }) => {
              const active = tab === id
              const badge = id === 'inbox' && needsReply > 0 ? needsReply : 0
              return (
                <button
                  key={id}
                  onClick={() => onTabTap(id)}
                  className={`relative flex-1 flex flex-col items-center gap-1 pt-2 pb-1.5 ${active ? 'text-[#123F3A]' : 'text-neutral-400'}`}
                >
                  {Icon ? (
                    <Icon className="w-[26px] h-[26px]" />
                  ) : (
                    <span className="w-[26px] h-[26px] flex items-center justify-center gap-[3px]" aria-hidden>
                      <span className="w-[5px] h-[5px] rounded-full bg-current" />
                      <span className="w-[5px] h-[5px] rounded-full bg-current" />
                      <span className="w-[5px] h-[5px] rounded-full bg-current" />
                    </span>
                  )}
                  <span className={`text-[11px] ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
                  {badge > 0 && (
                    <span className="absolute top-1 left-[calc(50%-24px)] min-w-[19px] h-[19px] px-1 rounded-full bg-[#D9480F] text-white text-[11px] font-bold flex items-center justify-center">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </nav>
      )}
    </div>
  )
}
