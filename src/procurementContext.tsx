import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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
}

const ProcurementContext = createContext<ProcurementContextValue | null>(null)

function initialViewFromUrl(): AppView {
  try {
    const view = new URLSearchParams(window.location.search).get('view')
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
  const [selectedRfqId, setSelectedRfqId] = useState<string | null>(null)
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null)
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null)
  const [selectedQuoteVersionId, setSelectedQuoteVersionId] = useState<string | null>(null)
  const [draftBoq, setDraftBoq] = useState<DraftBoqState | null>(null)
  const [awardResult, setAwardResult] = useState<Record<string, unknown> | null>(null)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)

  const navigate = useCallback((v: AppView) => setView(v), [])

  const openInboxThread = useCallback((inviteId: string) => {
    setSelectedThreadId(inviteId)
    setView('inbox-thread')
  }, [])

  const openRfq = useCallback((id: string, next: AppView = 'rfq-detail') => {
    setSelectedRfqId(id)
    setView(next)
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
