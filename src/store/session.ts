import type { BOQItem, RFQSummary } from '../types'
import { farqSession } from '../api/farqSession'
import { sanitizeBoqLines } from '../lib/parseBoq'

export type SessionOffer = {
  id: string
  supplierId: string
  supplierName: string
  status: 'complete' | 'partial' | 'pending'
  itemsPriced: number
  itemsTotal: number
  amount: string
  delivery: string
  shipping: string
}

export type ReadIssue = {
  /** `invalid` blocks sending; `partial` needs the buyer's explicit acknowledgement. */
  kind: 'invalid' | 'partial'
  detail: string
}

type SessionState = {
  /**
   * Which signed-in account this working state belongs to; null in demo mode.
   *
   * Everything below — the uploaded كراسة, the draft RFQ, the offers — is one
   * person's work in progress. Without an owner recorded here, signing in as
   * someone else left it on screen and the next account could send another
   * account's tender under their own name.
   */
  ownerUserId: string | null
  /** Content hash / upload identity for the active booklet. */
  documentId: string | null
  fileName: string
  projectName: string
  boqItems: BOQItem[]
  /**
   * The upload screen's verdict on this read, carried to the send step. It was
   * computed, printed as «لا تُرسل طلب تسعير من هذه القراءة», and then dropped:
   * the send button stayed fully enabled on a read the app itself called invalid.
   */
  readIssue: ReadIssue | null
  rfqs: RFQSummary[]
  offers: SessionOffer[]
  activeRfqId: string | null
}

type Listener = () => void

function emptyState(ownerUserId: string | null): SessionState {
  return {
    ownerUserId,
    documentId: null,
    fileName: '',
    projectName: '',
    boqItems: [],
    readIssue: null,
    rfqs: [],
    offers: [],
    activeRfqId: null,
  }
}

const state: SessionState = emptyState(farqSession.getUser()?.id ?? null)

const listeners = new Set<Listener>()

function emit() {
  listeners.forEach((fn) => fn())
}

/**
 * Drop all working state when the signed-in account changes — including on
 * sign-out, so a shared machine does not hand the next person a loaded tender.
 */
export function resetSessionForIdentity(ownerUserId: string | null) {
  Object.assign(state, emptyState(ownerUserId))
  emit()
}

farqSession.subscribe((event, next) => {
  if (event === 'IDENTITY_CHANGED') resetSessionForIdentity(next?.user.id ?? null)
})

export function getSession(): SessionState {
  return state
}

export function subscribeSession(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Start a new upload: wipe previous booklet lines immediately so a failed
 * parse can never leave (or restore) the prior document's items on screen.
 */
export function beginBoqUpload(meta?: { fileName?: string; documentId?: string | null }) {
  state.documentId = meta?.documentId ?? null
  state.fileName = meta?.fileName || ''
  state.projectName = ''
  state.boqItems = []
  state.readIssue = null
  state.offers = []
  state.activeRfqId = null
  emit()
}

export function setParsedBoq(payload: {
  fileName: string
  projectName?: string
  items: BOQItem[]
  documentId: string
  /** Omit to keep the verdict of the same document; pass null to clear it. */
  readIssue?: ReadIssue | null
}) {
  if (payload.readIssue !== undefined) state.readIssue = payload.readIssue
  else if (state.documentId !== payload.documentId) state.readIssue = null
  state.documentId = payload.documentId
  state.fileName = payload.fileName
  state.projectName = payload.projectName || payload.fileName.replace(/\.[^.]+$/, '')
  // Never keep Farq/Excel header labels (اسم المادة / الكمية / الوحدة) as line items.
  state.boqItems = sanitizeBoqLines(payload.items)
  emit()
}

/** Clear booklet lines after a failed parse — do not restore the previous upload. */
export function clearParsedBoq() {
  state.documentId = null
  state.fileName = ''
  state.projectName = ''
  state.boqItems = []
  state.readIssue = null
  state.offers = []
  state.activeRfqId = null
  emit()
}

export function upsertDraftRfq(rfq: RFQSummary) {
  const idx = state.rfqs.findIndex((r) => r.id === rfq.id)
  if (idx >= 0) state.rfqs[idx] = rfq
  else state.rfqs = [rfq, ...state.rfqs]
  state.activeRfqId = rfq.id
  emit()
}

export function clearOffers() {
  state.offers = []
  emit()
}

export function getBoqItems(): BOQItem[] {
  // Sanitize on read so an in-memory session from an earlier buggy parse is cleaned.
  const clean = sanitizeBoqLines(state.boqItems)
  if (clean.length !== state.boqItems.length) {
    state.boqItems = clean
    // Defer notify so callers can finish reading during render/subscribe setup.
    queueMicrotask(() => emit())
  }
  return state.boqItems
}

export function getActiveDocumentId(): string | null {
  return state.documentId
}

export function getRfqs(): RFQSummary[] {
  return state.rfqs
}

export function getOffers(): SessionOffer[] {
  return state.offers
}
