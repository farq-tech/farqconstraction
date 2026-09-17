/**
 * Thin Farq construction API client for this Figma Make UI.
 * Mirrors Frontend/src/services/constructionService.ts — browser → `/_api` →
 * Farq Express `/api/construction/*`. Never opens Postgres from the frontend.
 *
 * Identity comes from `constructionAuth`: a real per-account session first, and
 * `x-construction-demo-user` only as a last resort (which the Farq API accepts
 * solely outside production with `CONSTRUCTION_DEMO_MODE=1`). Both paths work
 * side by side while real auth is being proven.
 *
 * Supplier portal calls are a SEPARATE identity class: their one-use URL token
 * is the whole credential and they carry no buyer session. See `auth: 'supplier'`.
 */

import { apiBase, apiUnreachableAdvice } from './apiBase'
import { buildOntologyResolution, withOntologyResolution } from '../lib/canonicalIntent'
import {
  constructionHeaders,
  currentAuthMode,
  shouldRetryAfterRefresh,
  supplierPortalHeaders,
} from './constructionAuth'
import { CONSTRUCTION_READ_ONLY, isBlockedWrite, READ_ONLY_MESSAGE } from './readOnlyMode'
import { farqSession } from './farqSession'

export { constructionHeaders }

export type ConstructionRfqSummary = {
  id: string
  status: string
  created_at: string
  updated_at?: string
  submission_closed_at?: string | null
  envelopes_opened_at?: string | null
  closure_note?: string | null
  award_id?: string | null
  award_status?: string | null
  awarded_total?: number | null
  version_number?: number
  buyer?: { company_name?: string; contact_name?: string; email?: string; phone?: string }
  engineering_department?: { key?: string; label_ar?: string; label_en?: string; code?: string } | null
  delivery?: { city?: string; site_address?: string; required_date?: string }
  supplier_count: number
  response_count: number
  opened_count: number
  expired_count: number
  line_count: number
  received_base_quote_total: number | null
}

export type ConstructionManagementOverview = {
  generated_at: string
  summary: {
    rfq_count: number
    draft_count: number
    sent_count: number
    supplier_count: number
    response_count: number
    awaiting_supplier_count: number
    opened_count: number
    expired_count: number
  }
  finance?: {
    currency: 'SAR'
    received_base_quote_total: number | null
    committed_total: number | null
    due_total: number | null
    paid_total: number | null
  }
  rfqs: ConstructionRfqSummary[]
}

export type ConstructionInvitation = {
  id: string
  supplier_id: string
  delivery_status: string
  response_status: string
  opened_at?: string | null
  last_accessed_at?: string | null
  updated_at?: string | null
  supplier: {
    id?: string
    name_ar?: string
    name_en?: string
    city?: string
    email?: string | null
    phone?: string | null
    whatsapp?: string | null
  }
  dispatch_attempts?: Array<{
    channel: 'EMAIL' | 'WHATSAPP' | 'HARAJ'
    message_type?: 'RFQ' | 'AWARD'
    status: string
    sent_at: string | null
    failure_code: string | null
  }>
}

export type ConstructionRfq = {
  id: string
  status: string
  created_at: string
  submission_closed_at?: string | null
  envelopes_opened_at?: string | null
  closure_note?: string | null
  engineering_department?: { key?: string; label_ar?: string; label_en?: string } | null
  current_version?: {
    id?: string
    version_number?: number
    payload?: {
      buyer?: ConstructionRfqSummary['buyer']
      delivery?: ConstructionRfqSummary['delivery']
      lines?: Array<Record<string, unknown>>
      selected_supplier_ids?: string[]
      engineering_department?: unknown
      commercial_terms?: { currency?: string; payment_terms?: string }
      packages?: Array<Record<string, unknown>>
    }
  }
  award?: {
    id: string
    status: string
    project_name?: string
    approved_total?: number | string
    approved_at?: string
    approved_by_email?: string
    selection_reason?: string
  } | null
  audit_timeline?: Array<{
    event_type: string
    created_at: string
    email_snapshot?: string
    role?: string
    snapshot?: Record<string, unknown>
    /** RECORDED = written by the system when it happened; DERIVED = reconstructed at read time from dispatch attempts and RFQ timestamps. */
    source?: 'RECORDED' | 'DERIVED'
  }>
  supplier_count: number
  response_count: number
  invitations: ConstructionInvitation[]
  sender?: {
    name: string
    email: string
    cc?: string[]
    client_name?: string
  }
}

export type ConstructionComparison = {
  rfq: ConstructionRfq
  supplier_responses: Array<{
    supplier: { id?: string; name_ar?: string; name_en?: string }
    offer: Record<string, unknown> & {
      offerId?: string
      quoteVersionId?: string
      totals?: { total?: number; subtotal?: number; tax?: number; goods_total?: number }
      lines?: Array<Record<string, unknown>>
      delivery?: unknown
      currency?: string
    }
    eligibility?: { eligible?: boolean; reason_codes?: string[] }
  }>
  awaiting_supplier_ids: string[]
  quote_matrix?: {
    basis: string
    requested_line_count: number
    supplier_count: number
    complete_quote_count: number
    lines: Array<{
      id: string
      name_ar: string
      name_en?: string
      quantity: number
      uom: string
      offers: Array<{
        supplier_id: string
        status: string
        unit_price: number | null
        line_total: number | null
        quantity: number | null
        currency: string
        prices_include_tax: boolean | null
      }>
    }>
    supplier_summaries?: Array<{
      supplier_id: string
      coverage: {
        requested: number
        priced: number
        unavailable: number
        not_quoted: number
        needs_review: number
        complete: boolean
      }
    }>
  }
  serving_decision?: {
    decision?: string
    winner_offer_ids?: string[]
    reason_codes?: string[]
  }
}

export type ConstructionProject = {
  id: string
  name: string
  code?: string | null
  site_address?: string | null
}

export type PublicSupplierInvite = {
  invite_id: string
  rfq_id: string
  rfq_version_id: string
  version_number?: number
  expires_at?: string
  response_status: string
  submission_closed_at?: string | null
  supplier: {
    name_ar?: string
    name_en?: string
    email?: string | null
    contact_name?: string | null
    phone?: string | null
  }
  buyer?: Record<string, unknown>
  delivery?: Record<string, unknown>
  commercial_terms?: Record<string, unknown>
  lines: Array<{
    id: string
    line_number?: number
    line_key?: string
    quantity: number
    uom: string
    pack?: string
    /**
     * The BOQ line's own text, sent by the buyer even when no catalog row
     * matched. Prefer it over `name_ar`, which is a catalog label and is null
     * for an unmatched line.
     */
    original_name?: string
    name_ar?: string
    name_en?: string
    item_note?: string | null
    technical_specification?: Record<string, unknown>
  }>
}

export type BoqCatalogMatchRow = {
  /** Farq match key (same as request row.key / line_key). */
  line_key: string
  key?: string
  /** Null when Farq returned no CONFIRMED match. Candidates never fill this. */
  farq_spec_id?: string | null
  /** Catalog name. Only ever a label for a confirmed match — never a line name. */
  name_ar?: string
  name_en?: string
  quantity?: number
  uom?: string
  match_kind?: string
  kind?: string
  /** How many unconfirmed candidates Farq returned. Diagnostics only. */
  candidate_count?: number
  rfq_eligible_supplier_ids?: string[]
  rfq_eligible_supplier_count?: number
  suppliers?: Array<{
    id: string
    name_ar?: string
    name_en?: string
    city?: string
    evidence?: string
    channel?: string
    rfq_eligible?: boolean
  }>
  /** Ontology-named material whose suppliers were read from Farq's intent map (review required, never a match). */
  map_suggestion?: {
    intent: string
    family: string | null
    answered_by: string | null
    supplier_count: number
    zero_reason: string | null
    suppliers: Array<{
      id: string
      name_ar?: string
      name_en?: string
      city?: string
      evidence?: string
      channel?: string
      rfq_eligible?: boolean
    }>
  }
  /** Model-named material (review required). Present only when the API's AI-miss step ran and placed the line. */
  ai_suggestion?: {
    intent: string
    family: string | null
    supplier_count: number
    zero_reason: string | null
    suppliers: Array<{
      id: string
      name_ar?: string
      name_en?: string
      city?: string
      evidence?: string
      channel?: string
      rfq_eligible?: boolean
    }>
  }
}

export class ConstructionApiError extends Error {
  status: number
  code: string
  /** Seconds left on the server's limiter. Only set for 429 — lets the UI say
   *  «أعد المحاولة بعد كذا» instead of inventing a disconnection. */
  retryAfterSec?: number

  constructor(message: string, status: number, code: string, retryAfterSec?: number) {
    super(message)
    this.name = 'ConstructionApiError'
    this.status = status
    this.code = code
    this.retryAfterSec = retryAfterSec
  }
}

/** Code every 429 from the construction surface is normalised to. */
export const CONSTRUCTION_RATE_LIMITED = 'CONSTRUCTION_RATE_LIMITED'

/**
 * Shared 429 gate.
 *
 * The API rate-limits the whole `/api/construction` surface as ONE per-IP
 * bucket (`RATE_LIMIT_CONSTRUCTION_PER_MIN`, 60/min). So the moment one call is
 * refused, every other call in the app is already refused too, and spending a
 * real request to rediscover that is what turns a single refusal into a storm:
 * the inbox screen costs 10 requests per load, and each failed «ربط Gmail»
 * click added two more. We remember the server's `Retry-After` and refuse
 * locally until it elapses — no retries, no polling, and the counter is left
 * alone long enough to actually drain.
 */
let rateLimitedUntilMs = 0
/** Only used when the server sends a 429 with no Retry-After to honour. */
let rateLimitBackoffSec = 0
const RATE_LIMIT_MAX_BACKOFF_SEC = 60

/** Seconds the caller must wait, or 0 when the gate is open. */
function rateLimitWaitSec(now = Date.now()): number {
  if (rateLimitedUntilMs <= now) return 0
  return Math.max(1, Math.ceil((rateLimitedUntilMs - now) / 1000))
}

function rateLimitErrorAr(sec: number): ConstructionApiError {
  return new ConstructionApiError(
    `تجاوزنا حد المحاولات على واجهة البناء — أعد المحاولة بعد ${sec} ثانية. هذا حدّ سرعة مؤقّت، لا انقطاع في الربط ولا خطأ في الإعدادات.`,
    429,
    CONSTRUCTION_RATE_LIMITED,
    sec,
  )
}

/**
 * Throws when the limiter is still counting down. Call this before any fetch to
 * `/api/construction` — including transports that don't go through `request()`,
 * such as the suppliers catalogue. A screen that keeps spending requests inside
 * the window is a screen that keeps pushing the owner's countdown back.
 */
export function assertConstructionRateLimitOpen(): void {
  const waiting = rateLimitWaitSec()
  if (waiting > 0) throw rateLimitErrorAr(waiting)
}

/**
 * Feeds a raw response back into the gate. Returns the error to throw when the
 * response was a 429, else null (and reopens the gate on success).
 */
export function recordConstructionResponse(
  response: Response,
  retryAfterSecFromBody?: number,
): ConstructionApiError | null {
  if (response.status === 429) {
    return rateLimitErrorAr(noteRateLimited(response, retryAfterSecFromBody))
  }
  if (response.ok) clearRateLimitGate()
  return null
}

/** Records a 429 so the rest of the app stops spending requests on it. */
function noteRateLimited(response: Response, retryAfterSecFromBody?: number): number {
  const fromHeader = Number(response.headers.get('retry-after'))
  const fromBody = Number(retryAfterSecFromBody)
  let sec = 0
  if (Number.isFinite(fromHeader) && fromHeader > 0) sec = Math.ceil(fromHeader)
  else if (Number.isFinite(fromBody) && fromBody > 0) sec = Math.ceil(fromBody)

  if (sec > 0) {
    // The server told us exactly how long; no need to guess or escalate.
    rateLimitBackoffSec = 0
  } else {
    // No Retry-After: exponential client-side backoff, capped.
    rateLimitBackoffSec = rateLimitBackoffSec
      ? Math.min(rateLimitBackoffSec * 2, RATE_LIMIT_MAX_BACKOFF_SEC)
      : 2
    sec = rateLimitBackoffSec
  }
  rateLimitedUntilMs = Math.max(rateLimitedUntilMs, Date.now() + sec * 1000)
  return rateLimitWaitSec()
}

function clearRateLimitGate() {
  rateLimitedUntilMs = 0
  rateLimitBackoffSec = 0
}

/** Test seam — the gate is module state shared by every construction call. */
export function __resetConstructionRateLimitGate() {
  clearRateLimitGate()
}

/** How long the construction API is still refusing us, in seconds (0 = fine). */
export function constructionRateLimitWaitSec(): number {
  return rateLimitWaitSec()
}

/**
 * Seconds to wait when `err` is a rate limit, else null. Views use this to keep
 * «تجاوزنا حد المحاولات» apart from «غير متصل» / «غير مهيأ».
 */
export function constructionRateLimitSec(err: unknown): number | null {
  if (err instanceof ConstructionApiError && err.status === 429) {
    return err.retryAfterSec && err.retryAfterSec > 0 ? err.retryAfterSec : 1
  }
  return null
}

/** Default browser timeout — catalog/match can be multi-MB; never hang forever. */
export const CONSTRUCTION_FETCH_TIMEOUT_MS = 45_000
/** BOQ catalog match is heavier (items + suppliers); allow a bit longer. */
export const CONSTRUCTION_BOQ_MATCH_TIMEOUT_MS = 90_000

async function parsePayload(response: Response): Promise<{
  ok: boolean
  data: unknown
  errors?: Array<{ code?: string; message?: string }>
  message?: string
  error?: string
  /** Sent by the API's rate limiter alongside the `Retry-After` header. */
  retryAfterSec?: number
}> {
  return response.json().catch(() => ({
    ok: false,
    data: null,
    message: `HTTP ${response.status}`,
  }))
}

/**
 * Which identity class a call belongs to.
 *
 * `buyer` attaches the session (or the demo header). `supplier` attaches
 * NEITHER: the portal token in the URL is the credential, and those two routes
 * run with no authorizer on the API. Keeping this explicit is what prevents a
 * future "add auth everywhere" change from silently killing live invite links.
 */
type AuthClass = 'buyer' | 'supplier'

type RequestInitWithAuth = RequestInit & { timeoutMs?: number; auth?: AuthClass }

async function request<T>(path: string, init: RequestInitWithAuth = {}): Promise<T> {
  const { timeoutMs = CONSTRUCTION_FETCH_TIMEOUT_MS, auth = 'buyer', ...fetchInit } = init
  const response = await send(path, fetchInit, timeoutMs, auth)
  return unwrap<T>(response.response, response.payload)
}

async function send(
  path: string,
  fetchInit: RequestInit,
  timeoutMs: number,
  auth: AuthClass,
): Promise<{ response: Response; payload: Awaited<ReturnType<typeof parsePayload>> }> {
  // Refuse before touching the network while the limiter is still counting us
  // down. Every request sent inside that window is refused anyway and only
  // feeds the storm.
  assertConstructionRateLimitOpen()

  // The testing deployment reads real data but must not dispatch to a real
  // supplier. Refused here, not on the buttons, so there is no path around it.
  if (isBlockedWrite(path, fetchInit.method)) {
    throw new ConstructionApiError(READ_ONLY_MESSAGE, 403, CONSTRUCTION_READ_ONLY)
  }

  const attempt = async () => {
    // Captured before the call so a 401 can tell "my token expired" from
    // "another request already refreshed it" without spending the single-use
    // refresh token twice.
    const usedToken = auth === 'buyer' ? farqSession.getAccessToken() : null
    const headers =
      auth === 'supplier'
        ? supplierPortalHeaders(fetchInit.headers || {})
        : constructionHeaders(fetchInit.headers || {})
    const response = await rawFetch(path, fetchInit, timeoutMs, headers)
    return { response, usedToken }
  }

  let { response, usedToken } = await attempt()
  if (shouldRetryAfterRefresh(response.status, usedToken)) {
    const outcome = await farqSession.refreshForRequest(usedToken)
    // Retry exactly once, and only when we actually hold a fresh token. A
    // refused refresh already signed the user out; retrying would 401 again.
    if (outcome.status === 'refreshed') {
      ;({ response } = await attempt())
    }
  }
  const payload = await parsePayload(response)
  // `unwrap` turns this into the thrown error; here we only need the gate shut.
  recordConstructionResponse(response, payload?.retryAfterSec)
  return { response, payload }
}

async function rawFetch(
  path: string,
  fetchInit: RequestInit,
  timeoutMs: number,
  headers: HeadersInit,
): Promise<Response> {
  const controller = new AbortController()
  const external = fetchInit.signal
  const onExternalAbort = () => controller.abort()
  if (external) {
    if (external.aborted) controller.abort()
    else external.addEventListener('abort', onExternalAbort, { once: true })
  }
  // `globalThis` rather than `window`: this module is unit-tested under Node.
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(`${apiBase()}${path}`, {
      ...fetchInit,
      signal: controller.signal,
      headers,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ConstructionApiError(
        'انتهت مهلة الطلب إلى واجهة البناء — أعد المحاولة أو قلّل عدد البنود.',
        504,
        'CONSTRUCTION_REQUEST_TIMEOUT',
      )
    }
    // A transport failure is not a feature flag problem; say so separately.
    //
    // And with no session it is not a server problem either, so it must not be
    // reported as one. Without a session this client sends
    // `x-construction-demo-user`, which is absent from the API's
    // `access-control-allow-headers` (Authorization is present), so the browser
    // blocks the request before it is sent and `fetch` rejects. The server is
    // healthy and never hears about it. Telling the reader the API is
    // unreachable sends him to check a server that is fine; the true and
    // actionable statement is that he is not signed in.
    throw new ConstructionApiError(
      currentAuthMode() === 'demo'
        ? 'لم تسجّل الدخول. هذا الرابط لا يستطيع مخاطبة خادم فرق بدون جلسة، فلم يصل الطلب إليه أصلًا. سجّل الدخول ثم أعد المحاولة.'
        : `لا يمكن الوصول إلى Farq API من هذا التطبيق — ${apiUnreachableAdvice()}`,
      0,
      'CONSTRUCTION_API_UNREACHABLE',
    )
  } finally {
    globalThis.clearTimeout(timer)
    if (external) external.removeEventListener('abort', onExternalAbort)
  }
}

function unwrap<T>(
  response: Response,
  payload: Awaited<ReturnType<typeof parsePayload>>,
): T {
  const code =
    payload?.errors?.[0]?.code ||
    payload?.error ||
    (typeof payload?.message === 'string' ? payload.message : '') ||
    `HTTP_${response.status}`

  if (!response.ok || payload?.ok === false) {
    // A rate limit is a speed problem, not a configuration or connection one.
    // Reported as anything else it reads as «غير متصل» / «غير مهيأ» and sends
    // the reader off to change env vars that were already correct.
    if (response.status === 429 || code === 'rate_limited' || code === 'RATE_LIMIT') {
      throw rateLimitErrorAr(rateLimitWaitSec() || Number(payload?.retryAfterSec) || 1)
    }
    if (response.status === 401 || code === 'CONSTRUCTION_AUTH_REQUIRED') {
      // After a real session expires or a signing-secret rotation, the honest
      // instruction is "sign in again", not a list of server flags.
      throw new ConstructionApiError(
        farqSession.isAuthenticated()
          ? 'انتهت جلستك — سجّل الدخول من جديد.'
          : 'يتطلب واجهة البناء تسجيل دخول. سجّل الدخول بحسابك، أو محليًا شغّل CONSTRUCTION_DEMO_MODE=1 على الـ API.',
        response.status,
        String(code),
      )
    }
    // Gmail OAuth failures are their own family — they must never be reported
    // as «CONSTRUCTION_DB_URL / READ-WRITE-RFQ» problems, which sent the owner
    // chasing flags that were already on.
    if (String(code).startsWith('GMAIL_')) {
      throw new ConstructionApiError(gmailErrorMessageAr(String(code)), response.status, String(code))
    }
    // Inbox/correspondence codes name one cause each. Without this branch a 503
    // like INBOX_CORRESPONDENCE_DISABLED would read as a database problem.
    if (
      String(code).startsWith('INBOX_') ||
      code === 'SUPPLIER_SCOPE_REQUIRED' ||
      code === 'SUPPLIER_NO_SCOPED_LINES'
    ) {
      throw new ConstructionApiError(
        inboxReplyErrorMessageAr(String(code)),
        response.status,
        String(code),
      )
    }
    // A role refusal is not a misconfiguration. Suppliers, RFQs and the inbox
    // are gated to ADMIN / PROCUREMENT / ENGINEER, and reporting that as a
    // missing server flag sends the reader to change env vars that are already
    // correct.
    if (response.status === 403 || code === 'CONSTRUCTION_FORBIDDEN') {
      throw new ConstructionApiError(
        'صلاحيتك الحالية لا تسمح بهذا الإجراء. رفع الموردين وتعديل بياناتهم متاح لأدوار: مدير (ADMIN)، مشتريات (PROCUREMENT)، مهندس (ENGINEER). اطلب من مالك الحساب ترقية دورك.',
        response.status,
        String(code),
      )
    }
    if (
      response.status === 503 ||
      code === 'CONSTRUCTION_PERSISTENCE_UNAVAILABLE' ||
      code === 'CONSTRUCTION_READ_DISABLED' ||
      code === 'CONSTRUCTION_RFQ_DISABLED' ||
      code === 'CONSTRUCTION_WRITE_DISABLED'
    ) {
      throw new ConstructionApiError(
        `خدمة فرق للبناء متوقفة مؤقتًا من جهة الخادم (${code}). لم يُحفظ شيء؛ أعد المحاولة بعد قليل أو تواصل مع دعم فرق.`,
        response.status,
        String(code),
      )
    }
    throw new ConstructionApiError(
      payload?.errors?.[0]?.message || payload?.message || String(code),
      response.status,
      String(code),
    )
  }

  return payload.data as T
}

export async function getConstructionStatus() {
  return request<Record<string, unknown>>('/api/construction/status')
}

export async function getConstructionMe() {
  return request<{ user_id?: string; scope_owner_user_id?: string; role?: string }>(
    '/api/construction/me',
  )
}

export async function listBuyerRfqs(): Promise<ConstructionManagementOverview> {
  return request<ConstructionManagementOverview>('/api/construction/rfqs')
}

export async function getConstructionRfq(id: string): Promise<ConstructionRfq> {
  return request<ConstructionRfq>(`/api/construction/rfqs/${encodeURIComponent(id)}`)
}

export async function getConstructionComparison(id: string): Promise<ConstructionComparison> {
  return request<ConstructionComparison>(
    `/api/construction/rfqs/${encodeURIComponent(id)}/comparison`,
  )
}

export async function getConstructionProjects(): Promise<{ projects: ConstructionProject[] }> {
  return request<{ projects: ConstructionProject[] }>('/api/construction/projects')
}

export async function createConstructionProject(payload: {
  name: string
  code?: string
  site_address?: string
}): Promise<ConstructionProject> {
  return request<ConstructionProject>('/api/construction/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function createConstructionAward(payload: Record<string, unknown>) {
  return request<Record<string, unknown>>('/api/construction/awards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function closeConstructionRfqSubmissions(
  id: string,
  note: string,
  openEnvelopes = false,
) {
  return request<ConstructionRfq>(
    `/api/construction/rfqs/${encodeURIComponent(id)}/close-submissions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note, open_envelopes: openEnvelopes }),
    },
  )
}

export async function openConstructionRfqEnvelopes(id: string, reason: string) {
  return request<ConstructionRfq>(
    `/api/construction/rfqs/${encodeURIComponent(id)}/open-envelopes`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    },
  )
}

/** Delivery city default when creating RFQs (editable in UI). */
export const DEFAULT_DELIVERY_CITY = 'الرياض'

export function isHarajSellerExternalKey(id: string): boolean {
  return /^haraj:seller:\d+$/i.test(String(id || '').trim())
}

export function countHarajSupplierIds(ids: string[]): number {
  return ids.filter(isHarajSellerExternalKey).length
}

export type SendRfqInviteOptions = {
  sendConsent?: boolean
  /** Required (=1) when sending a single Haraj seller invite. */
  harajLimit?: number
  /** Override default 45s — Haraj pacing needs more headroom. */
  timeoutMs?: number
  signal?: AbortSignal
}

export async function createConstructionRfq(
  payload: Record<string, unknown>,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
) {
  return request<ConstructionRfq>('/api/construction/rfqs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  })
}

export async function sendConstructionRfqInvite(
  rfqId: string,
  inviteId: string,
  sendConsentOrOptions: boolean | SendRfqInviteOptions = true,
) {
  const options: SendRfqInviteOptions =
    typeof sendConsentOrOptions === 'boolean'
      ? { sendConsent: sendConsentOrOptions }
      : sendConsentOrOptions
  const body: Record<string, unknown> = {
    send_consent: options.sendConsent !== false,
  }
  if (options.harajLimit != null) {
    body.haraj_limit = options.harajLimit
  }
  return request<ConstructionRfq>(
    `/api/construction/rfqs/${encodeURIComponent(rfqId)}/invites/${encodeURIComponent(inviteId)}/send`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeoutMs: options.timeoutMs,
      signal: options.signal,
    },
  )
}

export type WhatsAppLinkResult = {
  url: string
  channel: 'WHATSAPP'
  status: string
  sent: boolean
}

/** Manual WhatsApp Web handoff — does NOT Cloud-send; no Meta tokens in browser. */
export async function prepareConstructionWhatsAppLink(
  rfqId: string,
  inviteId: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
) {
  return request<WhatsAppLinkResult>(
    `/api/construction/rfqs/${encodeURIComponent(rfqId)}/invites/${encodeURIComponent(inviteId)}/whatsapp-link`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    },
  )
}

export type ConstructionInboxStatus = {
  enabled?: boolean
  receiving_configured?: boolean
  allowed?: boolean
  correspondence_enabled?: boolean
  attachments_download_enabled?: boolean
  worker_enabled?: boolean
  unresolved_available?: boolean
  work_global_available?: boolean
  work_view_available?: boolean
  replying_allowed?: boolean
}

export type ConstructionInboxThread = {
  invite_id?: string
  supplier_id?: string
  /** Present on API thread rows (not nested under request_context). */
  supplier_name_ar?: string | null
  supplier_name_en?: string | null
  unread_count?: number
  subject?: string | null
  preview?: string | null
  last_received_at?: string | null
  response_status?: string
  /** True when an inbound capture still needs buyer attention. */
  needs_reply?: boolean
  locked?: boolean
  request_context?: {
    rfq_id?: string
    reference?: string
    supplier_name_ar?: string
    supplier_name?: string
  }
  /**
   * Latest activity kind from correspondence.listThreads.
   * `DISPATCH` = outbound RFQ invite SENT snapshot («دعوة طلب عرض مرسلة»),
   * not a supplier reply — must not flood the default inbox.
   */
  kind_hint?: string | null
}

export type ConstructionInboxThreadsResult = {
  threads: ConstructionInboxThread[]
  total_count?: number
  next_cursor?: string | null
  haraj_sync?: { state?: string }
  follow_up_counts?: {
    all?: number
    action?: number
    quoted?: number
    expired?: number
    waiting?: number
    /** Outbound invite-sent only (kind_hint=DISPATCH). */
    unanswered?: number
    [key: string]: number | undefined
  }
}

/** Outbound invite dispatch row — not an inbound supplier conversation. */
export function isOutboundInviteSnapshot(thread: ConstructionInboxThread): boolean {
  return String(thread.kind_hint || '').toUpperCase() === 'DISPATCH' && !thread.needs_reply
}

/** Prefer real supplier labels from the thread row; never invent a reply. */
export function inboxThreadSupplierLabel(thread: ConstructionInboxThread): string {
  const raw = [
    thread.supplier_name_ar,
    thread.supplier_name_en,
    thread.request_context?.supplier_name_ar,
    thread.request_context?.supplier_name,
  ]
    .map((v) => String(v || '').trim())
    .find((v) => v.length > 0 && v !== 'مورد')
  if (raw) return raw
  const id = String(thread.supplier_id || '').trim()
  if (id) return `مورد ${id.slice(0, 8)}`
  return 'مورد بدون اسم'
}

export async function getConstructionInboxStatus() {
  return request<ConstructionInboxStatus>('/api/construction/inbox/status')
}

export type ConstructionInboxMessage = {
  id: string
  invite_id?: string
  sender?: string
  subject?: string
  received_at?: string
  rfq_id?: string
  rfq_reference?: string
  supplier_name_ar?: string
  supplier_name_en?: string
  unread?: boolean
  locked?: boolean
  body_text?: string
}

export type ConstructionInboxMessagesPage = {
  messages: ConstructionInboxMessage[]
  unread_count: number
  next_cursor?: string | null
}

/** Buyer-visible inbound supplier emails (Resend alias + Gmail-linked captures). */
export async function listConstructionInboxMessages(query: { cursor?: string } = {}) {
  const params = new URLSearchParams()
  if (query.cursor) params.set('cursor', query.cursor)
  const qs = params.toString()
  return request<ConstructionInboxMessagesPage>(
    `/api/construction/inbox/messages${qs ? `?${qs}` : ''}`,
  )
}

export async function markConstructionInboxMessageRead(messageId: string) {
  return request<{ read: boolean }>(
    `/api/construction/inbox/messages/${encodeURIComponent(messageId)}/read`,
    { method: 'POST' },
  )
}

/** Back to unread for the signed-in member only; colleagues keep their own state. */
export async function markConstructionInboxMessageUnread(messageId: string) {
  return request<{ read: boolean }>(
    `/api/construction/inbox/messages/${encodeURIComponent(messageId)}/unread`,
    { method: 'POST' },
  )
}

export async function listConstructionInboxThreads(query: {
  /** API only accepts needs_reply | all. Use client helpers for inbound vs مرسل. */
  filter?: 'needs_reply' | 'all'
  cursor?: string
} = {}) {
  const params = new URLSearchParams()
  if (query.filter) params.set('filter', query.filter)
  if (query.cursor) params.set('cursor', query.cursor)
  const qs = params.toString()
  return request<ConstructionInboxThreadsResult>(
    `/api/construction/inbox/threads${qs ? `?${qs}` : ''}`,
  )
}

export type ConstructionInboxThreadFile = {
  id: string
  filename?: string
  content_type?: string
  /** STORED = downloadable · BLOCKED_TYPE / TOO_LARGE = kept as a reference only. */
  state?: string
}

export type ConstructionInboxThreadMessage = {
  id: string
  invite_id?: string
  direction: 'INBOUND' | 'OUTBOUND'
  employee_name?: string | null
  subject?: string | null
  body_text?: string | null
  created_at?: string
  /** INBOUND: RECEIVED · OUTBOUND: PREPARED | SENDING | SENT | FAILED | UNKNOWN. */
  state?: string
  kind_hint?: string | null
  channel?: string | null
  failure_code?: string | null
  unread?: boolean
  can_retry?: boolean
  files?: ConstructionInboxThreadFile[]
  request_context?: { reference?: string; rfq_id?: string }
}

export type ConstructionInboxThreadDetail = ConstructionInboxThread & {
  rfq_id?: string
  version_number?: string | number | null
  owner_user_id?: string | null
  owner_name?: string | null
  can_reply?: boolean
  can_claim?: boolean
  can_take_over?: boolean
  messages: ConstructionInboxThreadMessage[]
  older_than?: string | null
  /** Parent id the server requires on a reply; stale value = INBOX_NEW_MESSAGE. */
  last_message_id?: string | null
  reply_channel?: string | null
  reply_recipient?: string | null
  send_channels?: Array<{
    channel: string
    reason?: string | null
    max_length?: number
    window_until?: string | null
  }>
  /** Supplier-scoped item sheet availability — never the whole booklet. */
  item_package?: {
    can_attach_items?: boolean
    reason?: string | null
    mode?: string | null
    line_count?: number
    total_line_count?: number | null
  }
  requests?: Array<{ invite_id?: string; reference?: string; item_count?: number; locked?: boolean }>
}

export type ConstructionInboxReplyResult = {
  id: string
  state: string
  failure_code?: string | null
}

export async function getConstructionInboxThread(inviteId: string) {
  return request<ConstructionInboxThreadDetail>(
    `/api/construction/inbox/threads/${encodeURIComponent(inviteId)}`,
  )
}

/** Replying requires this user to own the request's correspondence. */
export async function claimConstructionInboxRequest(
  rfqId: string,
  body: { employee_name?: string; take_over?: boolean } = {},
) {
  return request<{ assigned: boolean; owner_user_id: string; owner_name: string }>(
    `/api/construction/inbox/requests/${encodeURIComponent(rfqId)}/owner`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
}

export type ConstructionInboxOutboundAttachment = { filename: string; content: string }

/**
 * Sends through the same signed Reply-To alias that routed the inbound reply,
 * with In-Reply-To / References set by the API, so the supplier's answer lands
 * back on this thread. `include_items` asks the API to attach that supplier's
 * own RFQ lines — the server refuses when the request was never split.
 */
export async function replyToConstructionInboxThread(
  inviteId: string,
  body: {
    idempotency_key: string
    text: string
    parent_message_id?: string | null
    attachments?: ConstructionInboxOutboundAttachment[]
    include_items?: boolean
    channel?: 'EMAIL' | 'HARAJ'
  },
) {
  return request<ConstructionInboxReplyResult>(
    `/api/construction/inbox/threads/${encodeURIComponent(inviteId)}/reply`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotency_key: body.idempotency_key,
        text: body.text,
        parent_message_id: body.parent_message_id ?? null,
        ...(body.attachments?.length ? { attachments: body.attachments } : {}),
        ...(body.include_items ? { include_items: true } : {}),
        ...(body.channel && body.channel !== 'EMAIL' ? { channel: body.channel } : {}),
      }),
    },
  )
}

export async function retryConstructionInboxReply(outboxId: string) {
  return request<ConstructionInboxReplyResult>(
    `/api/construction/inbox/outbox/${encodeURIComponent(outboxId)}/retry`,
    { method: 'POST' },
  )
}

/** Same caps the API enforces (`filesForSend`): reject before a pointless round trip. */
export const INBOX_ATTACHMENT_TYPES = ['pdf', 'png', 'jpg', 'jpeg', 'txt', 'csv'] as const
export const INBOX_ATTACHMENT_MAX_FILES = 5
export const INBOX_ATTACHMENT_MAX_TOTAL_BYTES = 512 * 1024

export async function readConstructionInboxAttachments(
  files: File[],
): Promise<ConstructionInboxOutboundAttachment[]> {
  if (files.length > INBOX_ATTACHMENT_MAX_FILES) {
    throw new Error(`الحد ${INBOX_ATTACHMENT_MAX_FILES} ملفات في الرسالة.`)
  }
  let total = 0
  const out: ConstructionInboxOutboundAttachment[] = []
  for (const file of files) {
    const extension = file.name.split('.').pop()?.toLowerCase() || ''
    if (!INBOX_ATTACHMENT_TYPES.includes(extension as (typeof INBOX_ATTACHMENT_TYPES)[number])) {
      throw new Error(`نوع غير مسموح (${extension || 'بلا امتداد'}) — المسموح: ${INBOX_ATTACHMENT_TYPES.join('، ')}.`)
    }
    total += file.size
    if (!file.size || total > INBOX_ATTACHMENT_MAX_TOTAL_BYTES) {
      throw new Error('حجم المرفقات يتجاوز 512 كيلوبايت لكل رسالة — أرسل ملفًا أصغر أو رابطًا.')
    }
    const buffer = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (let i = 0; i < buffer.length; i += 1) binary += String.fromCharCode(buffer[i])
    out.push({ filename: file.name, content: btoa(binary) })
  }
  return out
}

/** Downloads a captured supplier attachment; the API never hands out a CDN URL. */
export async function downloadConstructionInboxFile(fileId: string): Promise<Blob> {
  const response = await fetch(
    `${apiBase()}/api/construction/inbox/files/${encodeURIComponent(fileId)}`,
    { headers: constructionHeaders({}) },
  )
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? 'المرفق غير موجود أو خارج نطاق شركتك.'
        : response.status === 409
          ? 'المرفق غير مخزَّن (نوع محجوب أو حجم كبير) — افتح البريد الأصلي.'
          : `تعذّر تنزيل المرفق (${response.status}).`,
    )
  }
  return response.blob()
}

/** One cause, one action — never a lumped «تعذّر الإرسال». */
export function inboxReplyErrorMessageAr(code: string): string {
  switch (code) {
    case 'INBOX_OWNER_REQUIRED':
      return 'لا يمكن الإرسال قبل استلام المحادثة — اضغط «استلام المحادثة» أولًا.'
    case 'INBOX_NEW_MESSAGE':
      return 'وصلت رسالة جديدة أثناء كتابتك — أعد تحميل المحادثة ثم أرسل.'
    case 'INBOX_NO_REPLY_ADDRESS':
      return 'لا يوجد عنوان رد محفوظ لهذا المورد — أضف بريد جهة الاتصال في بطاقة المورد.'
    case 'INBOX_SENDING_DISABLED':
      return 'البريد الصادر غير مهيّأ على خادم فرق، فلم تُرسل الرسالة. تواصل مع دعم فرق (رمز: إعداد البريد الصادر).'
    case 'SUPPLIER_SCOPE_REQUIRED':
      return 'لا يمكن إرفاق بنود هذا الطلب: لم يُقسّم على الموردين، وإرسال الكتيّب كاملًا ممنوع. قسّم البنود على الموردين أولًا.'
    case 'SUPPLIER_NO_SCOPED_LINES':
      return 'لا بنود مخصصة لهذا المورد في هذا الطلب.'
    case 'INBOX_FILES_TOO_LARGE':
      return 'المرفقات أكبر من الحد المسموح للإرسال (512 كيلوبايت لكل رسالة) — أرسلها على رسائل منفصلة أو اضغط الملف.'
    case 'INBOX_FILES_TOO_MANY':
      return `لا يمكن إرفاق أكثر من ${INBOX_ATTACHMENT_MAX_FILES} ملفات في الرسالة الواحدة.`
    case 'INBOX_FILE_TYPE_BLOCKED':
      return `نوع الملف غير مسموح — المسموح ${INBOX_ATTACHMENT_TYPES.join('، ')} فقط.`
    case 'INBOX_INVALID_FILES':
      return 'مرفق غير مقبول أو تالف — أعد اختيار الملف.'
    case 'INBOX_SEALED':
      return 'الطلب بظرف مختوم — لا مراسلات قبل فتح المظاريف.'
    case 'INBOX_REPLY_CHANNEL_MISMATCH':
      return 'آخر رسالة وصلت على قناة أخرى — الرد يجب أن يكون على نفس القناة.'
    case 'INBOX_SEND_IN_PROGRESS':
      return 'هناك إرسال جارٍ لنفس الرسالة — انتظر النتيجة قبل إعادة المحاولة.'
    case 'INBOX_RECONCILIATION_REQUIRED':
      return 'تعذّر تأكيد الإرسال السابق — راجع بريد info@ قبل إعادة الإرسال لتجنّب التكرار.'
    case 'INBOX_CORRESPONDENCE_DISABLED':
      return 'المراسلات موقوفة على خادم فرق، فلم تُرسل الرسالة. تواصل مع دعم فرق.'
    default:
      return `تعذّر تنفيذ الطلب (${code}).`
  }
}

export type ConstructionGmailStatus = {
  state?: string
  checked_at?: string | null
  completed_at?: string | null
  enabled?: boolean
  connected?: boolean
  allowed?: boolean
  configured?: boolean
  synchronization_enabled?: boolean
  error?: string
  sync?: {
    state?: string
    captured_count?: number
    ambiguous_count?: number
    checked_at?: string | null
    /** TOKEN_INVALID = key absent/wrong length · SYNC_FAILED = wrong key value or provider error. */
    failure_code?: string | null
  }
}

/** One cause, one action — never a lumped «construction disabled» message. */
export function gmailErrorMessageAr(code: string): string {
  switch (code) {
    case 'GMAIL_NOT_CONFIGURED':
      return 'ربط Gmail غير مهيّأ على خادم فرق بعد، فلا يمكن إتمامه من هنا. تواصل مع دعم فرق.'
    case 'GMAIL_FORBIDDEN':
      return 'هذا الحساب ليس مالك صندوق بريد الشركة. ادخل بحساب مدير الشركة لربط البريد أو الرد منه.'
    case 'GMAIL_INVALID_STATE':
      return 'انتهت صلاحية جلسة الربط أو لم تُحفظ كعكة المتصفح على أصل الـ callback — ابدأ الربط من جديد من هذا الزر (يتطلب نشر Farq API الحديث).'
    case 'GMAIL_CONSENT_DECLINED':
      return 'تم رفض الموافقة على شاشة Google — أعد المحاولة ووافق بحساب info@farq.sa.'
    case 'GMAIL_WRONG_MAILBOX':
      return 'تمت الموافقة بحساب غير info@farq.sa — سجّل الخروج من Google ثم أعد الربط بحساب الشركة.'
    case 'GMAIL_INCOMPLETE_CONSENT':
      return 'الموافقة ناقصة الصلاحيات (قراءة + إرسال) — أعد الربط ووافق على كل الصلاحيات المطلوبة.'
    case 'GMAIL_PROVIDER_ERROR':
      return 'Google رفض التبادل مؤقتًا — أعد المحاولة بعد قليل.'
    case 'GMAIL_TEMPORARILY_UNAVAILABLE':
      return 'خدمة ربط Gmail غير متاحة مؤقتًا على الـ API — أعد المحاولة، وإن تكرر راجع سجلات Farq API.'
    default:
      return `تعذّر ربط Gmail (${code}).`
  }
}

export async function getConstructionGmailStatus() {
  return request<ConstructionGmailStatus>('/api/construction/inbox/gmail/status')
}

/** Build allowlisted return_to for Gmail OAuth callback → this app's inbox. */
export function buildConstructionGmailReturnTo(): string {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('view', 'inbox')
  return url.toString()
}

/**
 * Starts Google OAuth. Prefer `launch_url` (www.farq.sa sets the Secure cookie
 * on the registered callback host) then Google consent; API redirects back to
 * return_to with ?gmail=connected|error. Never expose client secrets here.
 */
export async function startConstructionGmailConnect(returnTo = buildConstructionGmailReturnTo()) {
  return request<{ url: string; launch_url?: string }>('/api/construction/inbox/gmail/connect', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ return_to: returnTo }),
  })
}

/** Prefer channel label for UI badges from invitation contact fields. */
export function invitePreferredChannel(invite: {
  supplier_id?: string
  supplier?: {
    id?: string
    email?: string | null
    whatsapp?: string | null
    phone?: string | null
  }
}): 'EMAIL' | 'WHATSAPP' | 'HARAJ' {
  const id = String(invite.supplier?.id || invite.supplier_id || '')
  if (isHarajSellerExternalKey(id)) return 'HARAJ'
  if (String(invite.supplier?.email || '').trim()) return 'EMAIL'
  if (String(invite.supplier?.whatsapp || invite.supplier?.phone || '').trim()) return 'WHATSAPP'
  return 'EMAIL'
}

export function formatChannelLabel(channel: string): string {
  const key = String(channel || '').toUpperCase()
  if (key === 'EMAIL') return 'بريد'
  if (key === 'WHATSAPP') return 'واتساب'
  if (key === 'HARAJ') return 'حراج'
  return channel || '—'
}

export function formatDispatchAttemptStatus(status: string): string {
  const key = String(status || '').toUpperCase()
  if (key === 'SENT' || key === 'DELIVERED') return 'أُرسل (قبول المزوّد)'
  if (key.startsWith('SKIPPED')) return 'تخطّي'
  if (key === 'FAILED' || key === 'DELIVERY_FAILED' || key === 'NOT_SENT') return 'فشل / لم يُرسل'
  if (key.includes('MANUAL')) return 'يتطلب إرسالًا يدويًا'
  if (key.includes('EMAIL_PREFERRED')) return 'تفضيل البريد'
  return status || '—'
}

/** One uploaded supplier list — what «تراجع» reverses and the badge points at. */
export type SupplierImportBatch = {
  id: string
  filename?: string | null
  label?: string | null
  created_at?: string
  created_by_label?: string | null
  row_count?: number
  inserted_count?: number
  matched_count?: number
  rejected_count?: number
  status?: 'COMMITTED' | 'REVERTED'
  reverted_at?: string | null
  live_supplier_count?: number
}

export type SupplierImportOutcome = {
  row_number: number
  name: string
  outcome: 'INSERT' | 'MATCH' | 'REJECT'
  matched_on?: 'email' | 'whatsapp' | 'cr_number' | 'name_city' | null
  matched_supplier_id?: string | null
  matched_supplier_name?: string | null
  duplicate_of_row?: number | null
  reasons?: Array<{ code: string; message_ar: string }>
}

export type SupplierImportResult = {
  dry_run: boolean
  dedupe_scope: string
  batch: SupplierImportBatch | null
  row_count: number
  insert_count: number
  match_count: number
  reject_count: number
  rows: SupplierImportOutcome[]
  imported_count: number
}

export type SupplierImportInput = {
  /** Line number in the uploaded file, echoed back on every outcome. */
  row_number?: number
  name_ar: string
  name_en?: string
  city?: string
  email?: string
  whatsapp?: string
  contact_name?: string
  supplied_items?: string
  cr_number?: string
}

/** The server caps a single call at 500 rows; a larger file is sent in chunks. */
export const SUPPLIER_IMPORT_CHUNK = 500

/**
 * Ask the API what the upload would do, without writing anything.
 *
 * `dedupe_scope: 'DIRECTORY'` is the whole reason this is safe to run against a
 * directory of ~11.7k suppliers — it compares each uploaded row against every
 * supplier the account can already see, not just against its own past imports.
 */
export async function dryRunSupplierImport(
  suppliers: SupplierImportInput[],
  options: { filename?: string; label?: string } = {},
) {
  return request<SupplierImportResult>('/api/construction/suppliers/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      suppliers,
      dry_run: true,
      dedupe_scope: 'DIRECTORY',
      filename: options.filename,
      label: options.label,
    }),
  })
}

/**
 * Commit the upload. `batchId` joins a continuation chunk to the batch the
 * first chunk opened, so a file larger than the cap is still one reversible
 * upload even though each chunk committed in its own transaction.
 */
export async function commitSupplierImport(
  suppliers: SupplierImportInput[],
  options: { filename?: string; label?: string; batchId?: string | null; createdByLabel?: string } = {},
) {
  return request<SupplierImportResult>('/api/construction/suppliers/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      suppliers,
      dry_run: false,
      dedupe_scope: 'DIRECTORY',
      filename: options.filename,
      label: options.label,
      batch_id: options.batchId || undefined,
      created_by_label: options.createdByLabel,
    }),
  })
}

export async function listSupplierImportBatches() {
  return request<{ batches: SupplierImportBatch[] }>('/api/construction/suppliers/import-batches')
}

export async function revertSupplierImportBatch(batchId: string) {
  return request<{ batch: SupplierImportBatch; deactivated_count: number }>(
    `/api/construction/suppliers/import-batches/${encodeURIComponent(batchId)}/revert`,
    { method: 'POST' },
  )
}

/**
 * Ask the directory which suppliers can serve these items.
 *
 * `lines` carries the RESOLVER'S OWN ANSWER for each item, which is the whole
 * reason this signature changed. The API's intent-keyed supplier map can only
 * be reached through `lines`, and the answer it needs — a `canonical_intent_id`
 * the ontology recognises — can only be produced here, where the resolver
 * lives. Without it the API falls back to its own vocabulary, which names the
 * same product differently and misses every lookup.
 *
 * A line with no resolvable name sends `ontology_resolution: null`, which the
 * API reads as ABSENT and answers on its own weaker path. That is a fallback,
 * not a verdict about the line.
 */
export async function matchConstructionSuppliers(payload: {
  item_ids?: string[]
  farq_spec_ids?: string[]
  city?: string
  limit?: number
  lines?: Array<{
    line_key: string
    farq_spec_id: string
    name_ar?: string
    name_en?: string
  }>
  include_inferred?: boolean
}) {
  const lines = payload.lines?.length ? withOntologyResolution(payload.lines) : undefined
  return request<{
    matches?: Array<{
      item?: { farq_spec_id?: string; name_ar?: string }
      suppliers?: Array<Record<string, unknown>>
    }>
    suppliers?: Array<Record<string, unknown>>
  }>('/api/construction/suppliers/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lines ? { ...payload, lines } : payload),
  })
}

/**
 * Suppliers attached to a SUGGESTION (map- or model-named). Never a confirmed
 * product match, so `rfq_eligible` is false and the badge names the source.
 */
function suggestionSuppliers(list: Array<Record<string, unknown>> | undefined, evidence: string) {
  // One business listed twice (two directory rows, same name) is one choice,
  // not two. The server returns at most 12; all of them are listed so the
  // count on the card is the count the buyer can actually see.
  const seenIds = new Set<string>()
  const seenNames = new Set<string>()
  return (list || [])
    .filter((s) => {
      const id = String(s.id || '').trim()
      if (!id || seenIds.has(id)) return false
      const name = String(s.name_ar || s.name_en || '').replace(/\s+/g, ' ').trim().toLowerCase()
      if (name && seenNames.has(name)) return false
      seenIds.add(id)
      if (name) seenNames.add(name)
      return true
    })
    .slice(0, 12)
    .map((s) => {
      const channels = (s.contact_channels || {}) as { email?: boolean; whatsapp?: boolean; haraj?: boolean }
      const id = String(s.id || '')
      const isHaraj =
        isHarajSellerExternalKey(id) ||
        String(s.source_system || s.source || '') === 'HARAJ' ||
        Boolean(channels.haraj)
      return {
        id,
        name_ar: s.name_ar as string | undefined,
        name_en: s.name_en as string | undefined,
        city: (s.city as string | undefined) || undefined,
        evidence,
        channel: channels.email ? 'بريد' : isHaraj ? 'حراج' : 'واتساب',
        rfq_eligible: false,
      }
    })
}

/**
 * Farq `POST /api/construction/boq/match` expects `{ rows: [{ key, name, ... }] }`
 * (see api/lib/construction/boq-catalog-matching.js). UI historically sent `lines`
 * with `line_key`/`name_ar` — that always 400s.
 */
export async function matchConstructionBoqCatalog(payload: {
  lines?: Array<{
    line_key: string
    name_ar?: string
    name_en?: string
    quantity?: number
    uom?: string
    spec?: string
  }>
  rows?: Array<{
    key: string
    name?: string
    name_en?: string
    specification?: string
    category?: string
    brand?: string
  }>
}): Promise<{ rows: BoqCatalogMatchRow[]; matches?: BoqCatalogMatchRow[] }> {
  const baseRows =
    payload.rows?.length
      ? payload.rows.slice(0, 200)
      : (payload.lines || []).slice(0, 200).map((line) => ({
          key: line.line_key,
          name: line.name_ar || '',
          name_en: line.name_en,
          specification: line.spec,
        }))
  // The resolver's own answer rides on every row. `/boq/match` is the endpoint
  // this screen actually calls, and the server has no paired resolver of its
  // own, so without this the ontology's name for a line never reaches the one
  // place that could read the supplier map for it. A server that does not know
  // the field ignores it (parseBoqMatchRows copies known keys only).
  const rows = baseRows.map((row) => ({
    ...row,
    ontology_resolution: buildOntologyResolution(row.name || row.name_en || ''),
  }))

  const data = await request<{
    rows?: Array<{
      key?: string
      kind?: string
      match?: {
        farq_spec_id?: string
        name_ar?: string
        name_en?: string
        rfq_eligible_supplier_ids?: string[]
        rfq_eligible_supplier_count?: number
        suppliers?: Array<Record<string, unknown>>
      } | null
      candidates?: Array<{
        farq_spec_id?: string
        name_ar?: string
        name_en?: string
        rfq_eligible_supplier_ids?: string[]
        rfq_eligible_supplier_count?: number
        suppliers?: Array<Record<string, unknown>>
      }>
      ai_suggestion?: {
        intent?: string
        family?: string | null
        supplier_count?: number
        zero_reason?: string | null
        suppliers?: Array<Record<string, unknown>>
      } | null
      map_suggestion?: {
        intent?: string
        family?: string | null
        answered_by?: string | null
        supplier_count?: number
        zero_reason?: string | null
        suppliers?: Array<Record<string, unknown>>
      } | null
    }>
  }>('/api/construction/boq/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
    timeoutMs: CONSTRUCTION_BOQ_MATCH_TIMEOUT_MS,
  })

  const mapped: BoqCatalogMatchRow[] = (data.rows || []).map((row) => {
    // ONLY a confirmed `match` counts. Farq deliberately separates `match` from
    // `candidates`; taking `candidates[0]` collapsed that distinction and is how
    // ten unrelated PPE lines on ELE-RFQ-51D17AF6 all acquired the OSB spec id
    // and were relabelled «ألواح أو إس بي». An unmatched line stays unmatched
    // and is sent under its own description instead.
    const chosen = row.match || null
    const eligibleIds = new Set(
      (chosen?.rfq_eligible_supplier_ids || []).map((id) => String(id)),
    )
    // Farq pads match.suppliers with non-eligible rows. Prefer eligible ids;
    // otherwise keep contactable channels including Haraj sellers.
    const suppliersRaw = (chosen?.suppliers || []).filter((s) => {
      const id = String(s.id || '').trim()
      if (!id) return false
      const source = String(s.source_system || s.source || '')
      const isHaraj = isHarajSellerExternalKey(id) || source === 'HARAJ'
      if (eligibleIds.size > 0) return eligibleIds.has(id)
      const channels = (s.contact_channels || {}) as {
        email?: boolean
        whatsapp?: boolean
        haraj?: boolean
      }
      return Boolean(channels.email || channels.whatsapp || channels.haraj || isHaraj)
    })
    return {
      line_key: String(row.key || ''),
      key: row.key,
      farq_spec_id: chosen?.farq_spec_id ?? null,
      name_ar: chosen?.name_ar,
      name_en: chosen?.name_en,
      match_kind: row.kind,
      kind: row.kind,
      /** Unconfirmed candidates, for diagnostics only — never a match. */
      candidate_count: row.candidates?.length || 0,
      rfq_eligible_supplier_ids: [...eligibleIds],
      rfq_eligible_supplier_count:
        chosen?.rfq_eligible_supplier_count ?? eligibleIds.size,
      suppliers: suppliersRaw.slice(0, 8).map((s) => {
        const channels = (s.contact_channels || {}) as {
          email?: boolean
          whatsapp?: boolean
          haraj?: boolean
        }
        const id = String(s.id || '')
        const isHaraj =
          isHarajSellerExternalKey(id) ||
          String(s.source_system || s.source || '') === 'HARAJ' ||
          Boolean(channels.haraj)
        return {
          id,
          name_ar: s.name_ar as string | undefined,
          name_en: s.name_en as string | undefined,
          city: (s.city as string | undefined) || undefined,
          // «دليل منتج» only when the server returned product evidence for this
          // supplier; otherwise the honest statement is that the catalog listed it.
          evidence:
            Array.isArray((s.product_match as { evidence?: unknown[] } | undefined)?.evidence) &&
            ((s.product_match as { evidence?: unknown[] }).evidence as unknown[]).length > 0
              ? 'دليل منتج'
              : 'من الكتالوج',
          channel: channels.email ? 'بريد' : isHaraj ? 'حراج' : 'واتساب',
          rfq_eligible: eligibleIds.size ? eligibleIds.has(id) : true,
        }
      }),
      ...(row.map_suggestion && row.map_suggestion.intent
        ? {
            map_suggestion: {
              intent: String(row.map_suggestion.intent),
              family: row.map_suggestion.family ?? null,
              answered_by: row.map_suggestion.answered_by ?? null,
              supplier_count: Number(row.map_suggestion.supplier_count) || 0,
              zero_reason: row.map_suggestion.zero_reason ?? null,
              // The ontology named the material; the map supplied the seller.
              suppliers: suggestionSuppliers(row.map_suggestion.suppliers, 'خريطة فرق'),
            },
          }
        : {}),
      ...(row.ai_suggestion && row.ai_suggestion.intent
        ? {
            ai_suggestion: {
              intent: String(row.ai_suggestion.intent),
              family: row.ai_suggestion.family ?? null,
              supplier_count: Number(row.ai_suggestion.supplier_count) || 0,
              zero_reason: row.ai_suggestion.zero_reason ?? null,
              // The model named the material; the map supplied the seller.
              suppliers: suggestionSuppliers(row.ai_suggestion.suppliers, 'تسمية آلية'),
            },
          }
        : {}),
    }
  })

  return { rows: mapped, matches: mapped }
}

export async function parseConstructionBoqPdf(file: File): Promise<{
  rows: (string | number)[][]
  item_count: number
  job_id?: string
}> {
  const submit = await request<{
    job_id: string
    status: 'QUEUED' | 'COMPLETE'
    rows?: (string | number)[][]
    item_count?: number
  }>('/api/construction/boq/parse-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/pdf' },
    body: file,
  })

  if (submit.status === 'COMPLETE' && submit.rows) {
    return {
      rows: submit.rows,
      item_count: submit.item_count ?? submit.rows.length,
      job_id: submit.job_id,
    }
  }

  const deadline = Date.now() + 600_000
  for (;;) {
    await new Promise((r) => setTimeout(r, 1000))
    const job = await request<{
      status: string
      rows?: (string | number)[][]
      item_count?: number
      error?: string | null
    }>(`/api/construction/boq/extraction/${encodeURIComponent(submit.job_id)}`)
    if (job.status === 'COMPLETE') {
      return {
        rows: job.rows ?? [],
        item_count: job.item_count ?? job.rows?.length ?? 0,
        job_id: submit.job_id,
      }
    }
    if (job.status === 'FAILED') {
      throw new ConstructionApiError(
        job.error || 'تعذرت قراءة جدول الكميات من PDF',
        500,
        'BOQ_EXTRACTION_FAILED',
      )
    }
    if (Date.now() >= deadline) {
      throw new ConstructionApiError(
        'انتهت مهلة تحليل PDF — ارفع صفحات جدول الكميات وحدها أو استخدم Excel.',
        504,
        'BOQ_EXTRACTION_TIMEOUT',
      )
    }
  }
}

/**
 * Supplier portal paths, kept as named constants because they are a CONTRACT
 * with `api/routes/construction.js` and a silent mismatch here is invisible
 * until a supplier tries to submit and gets a 404.
 *
 * The API mounts:
 *   GET  /supplier/portal/:token
 *   POST /supplier/portal/:token/quotes   ← plural
 */
export function supplierPortalPath(token: string): string {
  return `/api/construction/supplier/portal/${encodeURIComponent(token)}`
}

export function supplierQuoteSubmitPath(token: string): string {
  return `${supplierPortalPath(token)}/quotes`
}

/**
 * Read an invitation by its one-use link token.
 *
 * `auth: 'supplier'` — no buyer session, no demo header. A supplier is not a
 * buyer user, and this route has no authorizer by design.
 */
export async function getPublicSupplierInvite(token: string) {
  return request<PublicSupplierInvite>(supplierPortalPath(token), { auth: 'supplier' })
}

export async function submitPublicSupplierQuote(
  token: string,
  payload: Record<string, unknown>,
) {
  return request<Record<string, unknown>>(supplierQuoteSubmitPath(token), {
    auth: 'supplier',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

/** Map Farq RFQ status → UI filter buckets used by this Make app. */
export function mapRfqUiStatus(
  status: string,
  awardId?: string | null,
): 'draft' | 'active' | 'awarded' | 'closed' {
  if (awardId || status === 'AWARDED') return 'awarded'
  if (status === 'CLOSED' || status === 'CANCELLED') return 'closed'
  if (String(status).includes('DRAFT')) return 'draft'
  return 'active'
}

export function formatRfqApiStatus(status: string): string {
  const key = String(status || '').toUpperCase()
  if (key === 'DRAFT_NOT_SENT') return 'مسودة — دعوات جاهزة دون إرسال بريد/واتساب'
  if (key.includes('DRAFT')) return 'مسودة'
  if (key === 'DISPATCHING') return 'جارٍ الإرسال'
  if (key === 'SENT' || key === 'AWAITING_RESPONSES') return 'بانتظار العروض'
  if (key === 'CLOSED') return 'مغلق'
  if (key === 'AWARDED') return 'تمت الترسية'
  return status || '—'
}

export function formatInviteDeliveryStatus(status: string): string {
  const key = String(status || '').toUpperCase()
  if (key === 'PENDING' || key === 'NOT_SENT') return 'لم يُرسل بعد'
  if (key === 'SENT' || key === 'DELIVERED') return 'أُرسل'
  if (key === 'FAILED') return 'فشل الإرسال'
  if (key === 'OPENED' || key === 'READ') return 'فُتح الرابط'
  return status || '—'
}

export function formatInviteResponseStatus(status: string): string {
  const key = String(status || '').toUpperCase()
  if (key === 'AWAITING_QUOTE' || key === 'PENDING') return 'بانتظار الرد'
  if (key === 'QUOTED' || key === 'RESPONDED') return 'وصل عرض'
  if (key === 'DECLINED') return 'رفض'
  if (key === 'EXPIRED') return 'منتهٍ'
  return status || '—'
}

/** Build العروض / المراسلات rows from live RFQ invitations (+ comparison quotes when any). */
export function mapInvitationsToOfferRows(
  rfq: ConstructionRfq,
  comparison?: ConstructionComparison | null,
): Array<{
  id: string
  inviteId: string
  supplierId: string
  supplierName: string
  status: 'complete' | 'partial' | 'pending'
  deliveryStatus: string
  responseStatus: string
  itemsPriced: number
  itemsTotal: number
  amount: string
  delivery: string
  shipping: string
  dispatchAttempts: ConstructionInvitation['dispatch_attempts']
  quoteVersionId?: string
}> {
  const lineCount =
    rfq.current_version?.payload?.lines?.length ||
    comparison?.quote_matrix?.requested_line_count ||
    0
  const quotesBySupplier = new Map(
    (comparison?.supplier_responses || []).map((row) => [
      String(row.supplier.id || ''),
      row,
    ]),
  )
  const coverageBySupplier = new Map(
    (comparison?.quote_matrix?.supplier_summaries || []).map((row) => [
      String(row.supplier_id),
      row.coverage,
    ]),
  )

  return (rfq.invitations || []).map((invite) => {
    const supplierId = String(invite.supplier?.id || invite.supplier_id || '')
    const quote = quotesBySupplier.get(supplierId)
    const coverage = coverageBySupplier.get(supplierId)
    const responseKey = String(invite.response_status || '').toUpperCase()
    const quoted =
      responseKey === 'QUOTED' ||
      responseKey === 'RESPONDED' ||
      Boolean(quote?.offer?.quoteVersionId || quote?.offer?.offerId)
    const priced = coverage?.priced ?? (quoted ? lineCount : 0)
    const total =
      quote?.offer?.totals?.total ??
      quote?.offer?.totals?.goods_total ??
      quote?.offer?.totals?.subtotal
    let status: 'complete' | 'partial' | 'pending' = 'pending'
    // QUOTED in invitations is enough — don't hide offers when comparison matrix is empty.
    if (quoted && (coverage?.complete === true || priced >= lineCount || lineCount === 0 || !coverage)) {
      status = 'complete'
    } else if (quoted || priced > 0) {
      status = 'partial'
    }

    const attempts = invite.dispatch_attempts || []
    return {
      id: invite.id,
      inviteId: invite.id,
      supplierId,
      supplierName: String(
        invite.supplier?.name_ar || invite.supplier?.name_en || supplierId || 'مورد',
      ),
      status,
      deliveryStatus: invite.delivery_status,
      responseStatus: invite.response_status,
      itemsPriced: priced,
      itemsTotal: lineCount,
      amount: total != null ? formatSar(Number(total)).replace(' ر.س', '') : quoted ? 'وصل عرض' : '—',
      delivery: '—',
      shipping: '—',
      dispatchAttempts: attempts,
      quoteVersionId: String(quote?.offer?.quoteVersionId || quote?.offer?.offerId || '') || undefined,
    }
  })
}

export function formatRfqTitle(rfq: Pick<ConstructionRfqSummary, 'delivery' | 'engineering_department' | 'buyer' | 'id'>): string {
  const site = rfq.delivery?.site_address || rfq.delivery?.city
  const dept = rfq.engineering_department?.label_ar
  const company = rfq.buyer?.company_name
  if (site && dept) return `${dept} — ${site}`
  if (site) return site
  if (dept) return dept
  if (company) return company
  return `طلب ${rfq.id.slice(0, 8)}`
}

/** Matches Farq `departmentReference` — e.g. ELE-RFQ-51D17AF6. */
export function formatRfqReference(
  rfqId?: string | null,
  department?: { code?: string; key?: string } | string | null,
): string {
  const raw = String(rfqId || '').trim()
  if (!raw) return '—'
  const shortId = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(raw)
    ? raw.slice(0, 8).toUpperCase()
    : raw.replace(/^rfq-?/i, '').toUpperCase()
  const codeMap: Record<string, string> = {
    CIVIL: 'CIV',
    CIV: 'CIV',
    ARCHITECTURAL: 'ARC',
    ARC: 'ARC',
    ELECTRICAL: 'ELE',
    ELE: 'ELE',
    MECHANICAL: 'MEC',
    MEC: 'MEC',
  }
  const rawDept =
    typeof department === 'string'
      ? department
      : department?.code || department?.key || ''
  const code = codeMap[String(rawDept).trim().toUpperCase()] || ''
  return code ? `${code}-RFQ-${shortId}` : `RFQ-${shortId}`
}

export function formatSar(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return `${Number(value).toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ر.س`
}

export function formatArDate(value?: string | null): string {
  if (!value) return '—'
  const ts = Date.parse(value)
  if (Number.isNaN(ts)) return value
  return new Date(ts).toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
