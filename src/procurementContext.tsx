import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AppView, BOQItem } from './types'

export type DraftBoqState = {
  /** Content hash for the active upload — items must match this document only. */
  documentId: string
  fileName: string
  items: BOQItem[]
  selectedSupplierIds: Record<string, string[]>
}

type ProcurementContextValue = {
  view: AppView
  navigate: (v: AppView) => void
  selectedRfqId: string | null
  setSelectedRfqId: (id: string | null) => void
  selectedSupplierId: string | null
  setSelectedSupplierId: (id: string | null) => void
  selectedOfferId: string | null
  setSelectedOfferId: (id: string | null) => void
  selectedQuoteVersionId: string | null
  setSelectedQuoteVersionId: (id: string | null) => void
  draftBoq: DraftBoqState | null
  setDraftBoq: (draft: DraftBoqState | null) => void
  awardResult: Record<string, unknown> | null
  setAwardResult: (value: Record<string, unknown> | null) => void
  openRfq: (id: string, next?: AppView) => void
  /** Invitation id of the supplier conversation being read. */
  selectedThreadId: string | null
  openInboxThread: (inviteId: string) => void
  taseerNeed: string | null
  taseerToken: string | null
  openTaseerNeed: (need: string) => void
  openTaseerCompare: (need: string) => void
  openTaseerChat: (token: string, need?: string) => void
}

const ProcurementContext = createContext<ProcurementContextValue | null>(null)

const UUID_PARAM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function initialParam(name: 'thread' | 'rfq'): string | null {
  try {
    const value = new URLSearchParams(window.location.search).get(name) || ''
    return UUID_PARAM.test(value) ? value : null
  } catch {
    return null
  }
}

function initialViewFromUrl(): AppView {
  try {
    if (window.location.pathname.startsWith('/s/')) return 'taseer-offer'
    const params = new URLSearchParams(window.location.search)
    const view = params.get('view')
    if (view === 'taseer-sellers') return 'taseer-sellers'
    if (view === 'taseer-need') return 'taseer-need'
    if (view === 'taseer-compare') return 'taseer-compare'
    if (view === 'taseer-chat') return 'taseer-chat'
    if (view === 'rfq-list') return 'rfq-list'
    if (view === 'home') return 'home'
    // Links in the email alerts: a supplier conversation or a request.
    if (view === 'inbox' && UUID_PARAM.test(params.get('thread') || '')) return 'inbox-thread'
    if (view === 'rfq' && UUID_PARAM.test(params.get('rfq') || '')) return 'rfq-detail'
    if (view === 'inbox') return 'inbox'
    // An invitation link from the team screen: no session yet, by design.
    if (view === 'invite') return 'invite'
    // Deployed builds have no demo mode (the API refuses
    // `x-construction-demo-user` unless NODE_ENV !== production), so every
    // read 401s until someone signs in. Nothing else reaches 'login': the one
    // navigate to it runs *after* signOut, which needs a session first.
    // Without this the sign-in screen has no door on a real domain.
    if (view === 'login') return 'login'
  } catch {
    /* ignore */
  }
  return 'home'
}

export function ProcurementProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<AppView>(initialViewFromUrl)
  const [selectedRfqId, setSelectedRfqId] = useState<string | null>(() => initialParam('rfq'))
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null)
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null)
  const [selectedQuoteVersionId, setSelectedQuoteVersionId] = useState<string | null>(null)
  const [draftBoq, setDraftBoq] = useState<DraftBoqState | null>(null)
  const [awardResult, setAwardResult] = useState<Record<string, unknown> | null>(null)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(() => initialParam('thread'))
  const [taseerNeed, setTaseerNeed] = useState<string | null>(() => {
    try {
      return new URLSearchParams(window.location.search).get('need')
    } catch {
      return null
    }
  })
  const [taseerToken, setTaseerToken] = useState<string | null>(() => {
    try {
      return new URLSearchParams(window.location.search).get('token')
    } catch {
      return null
    }
  })

  /*
   * THE BROWSER'S BACK BUTTON STAYS INSIDE THE APP.
   *
   * Views are state, not URLs, so Back used to leave the site altogether. Each
   * move now pushes a history entry carrying the view and the record it shows,
   * and Back/Forward put them back. The address bar is left as it is.
   */
  type HistoryEntry = { farqView: AppView; rfqId?: string | null; threadId?: string | null }
  const push = (entry: HistoryEntry) => {
    try {
      window.history.pushState(entry, '')
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    try {
      window.history.replaceState({ farqView: view } satisfies HistoryEntry, '')
    } catch {
      /* ignore */
    }
    const onPop = (event: PopStateEvent) => {
      const entry = event.state as HistoryEntry | null
      if (!entry?.farqView) return
      if (entry.rfqId !== undefined) setSelectedRfqId(entry.rfqId)
      if (entry.threadId !== undefined) setSelectedThreadId(entry.threadId)
      setView(entry.farqView)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const viewRef = useRef(view)
  viewRef.current = view
  const navigate = useCallback((v: AppView) => {
    if (viewRef.current !== v) push({ farqView: v })
    setView(v)
  }, [])

  const openInboxThread = useCallback((inviteId: string) => {
    setSelectedThreadId(inviteId)
    setView('inbox-thread')
    push({ farqView: 'inbox-thread', threadId: inviteId })
  }, [])

  const openRfq = useCallback((id: string, next: AppView = 'rfq-detail') => {
    setSelectedRfqId(id)
    setView(next)
    push({ farqView: next, rfqId: id })
  }, [])

  const openTaseerNeed = useCallback((need: string) => {
    setTaseerNeed(need)
    setView('taseer-need')
    push({ farqView: 'taseer-need' })
  }, [])

  const openTaseerCompare = useCallback((need: string) => {
    setTaseerNeed(need)
    setView('taseer-compare')
    push({ farqView: 'taseer-compare' })
  }, [])

  const openTaseerChat = useCallback((token: string, need?: string) => {
    setTaseerToken(token)
    if (need) setTaseerNeed(need)
    setView('taseer-chat')
    push({ farqView: 'taseer-chat' })
  }, [])

  const value = useMemo(
    () => ({
      view,
      navigate,
      selectedRfqId,
      setSelectedRfqId,
      selectedSupplierId,
      setSelectedSupplierId,
      selectedOfferId,
      setSelectedOfferId,
      selectedQuoteVersionId,
      setSelectedQuoteVersionId,
      draftBoq,
      setDraftBoq,
      awardResult,
      setAwardResult,
      openRfq,
      selectedThreadId,
      openInboxThread,
      taseerNeed,
      taseerToken,
      openTaseerNeed,
      openTaseerCompare,
      openTaseerChat,
    }),
    [
      view,
      navigate,
      selectedRfqId,
      selectedSupplierId,
      selectedOfferId,
      selectedQuoteVersionId,
      draftBoq,
      awardResult,
      openRfq,
      selectedThreadId,
      openInboxThread,
      taseerNeed,
      taseerToken,
      openTaseerNeed,
      openTaseerCompare,
      openTaseerChat,
    ],
  )

  return (
    <ProcurementContext.Provider value={value}>{children}</ProcurementContext.Provider>
  )
}

export function useProcurement(): ProcurementContextValue {
  const ctx = useContext(ProcurementContext)
  if (!ctx) throw new Error('useProcurement must be used within ProcurementProvider')
  return ctx
}
