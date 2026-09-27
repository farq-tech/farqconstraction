/**
 * THE SUPPLIER PORTAL'S ONE DOOR TO THE API.
 *
 * Everything the supplier screens send or read goes through here, so the
 * shapes of the session/chat routes (being built on the API branch
 * `feat/supplier-portal-session-chat`) can be adjusted in one place.
 *
 *   POST /api/construction/supplier/session                  {token}
 *   GET  /api/construction/supplier/requests
 *   GET  /api/construction/supplier/requests/:inviteId/messages
 *   POST /api/construction/supplier/requests/:inviteId/messages
 *   POST /api/construction/supplier/account/decline
 *   POST /api/construction/supplier/account/otp               {purpose, email?}
 *   POST /api/construction/supplier/account/otp/verify        {code, password?}
 *
 * When the session route is not there yet (404) or switched off (503 /
 * *_DISABLED), `openSession` answers `{ mode: 'legacy' }` and the portal keeps
 * working exactly as it does today on the token routes
 * (`GET/POST /supplier/portal/:token…`, in constructionClient).
 *
 * The session is a bearer for 12 hours, renewed by opening the same link. It is
 * held in memory and in this tab's sessionStorage, never in the URL, never
 * logged.
 */
import { apiBase } from './apiBase'
import { isBlockedWrite, READ_ONLY_MESSAGE } from './readOnlyMode'

// ─── Shapes the screens use ────────────────────────────────────────────────

export type AccountStatus = 'PROVISIONED' | 'ACTIVE' | 'DECLINED'

export type SupplierAccount = {
  status: AccountStatus
  has_password: boolean
  email: string | null
  phone: string | null
  password_set_at?: string | null
}

export type SupplierSession = {
  session: string
  expires_at: string | null
  supplier: { id: string; name_ar: string }
  account: SupplierAccount
}

export type TimelineKind =
  | 'SENT'
  | 'OPENED'
  | 'QUOTE_RECEIVED'
  | 'SUBMISSION_CLOSED'
  | 'ENVELOPES_OPENED'
  | 'AWARDED'
  | 'NOT_AWARDED'

export type TimelineState = 'DONE' | 'UPCOMING' | 'UNKNOWN'

export type TimelineStep = { kind: TimelineKind; state: TimelineState; at: string | null }

export type SupplierRequest = {
  invite_id: string
  buyer_company: string
  reference: string
  title: string
  deadline: string | null
  status_timeline: TimelineStep[]
  unread_count: number
  line_count: number | null
  quote_version: number | null
}

export type SupplierAttachment = {
  id: string | null
  filename: string
  content_type: string
  size: number | null
  /** A download link, when the API hands one out (signed; no header needed). */
  url: string | null
}

export type SupplierMessage = {
  id: string
  direction: 'IN' | 'OUT'
  channel: string
  body: string
  attachments: SupplierAttachment[]
  created_at: string | null
  read_at: string | null
  /** Set on platform-generated rows («أرسلتم نسخة جديدة من العرض»). */
  system_kind: string | null
  author: string | null
  client_message_id: string | null
}

export type OutboundAttachment = { filename: string; content_type: string; content: string; size: number }

export type OtpPurpose = 'SET_PASSWORD' | 'ADD_EMAIL' | 'CHANGE_EMAIL'

export class SupplierPortalError extends Error {
  status: number
  code: string
  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = 'SupplierPortalError'
    this.status = status
    this.code = code
  }
}

// ─── Normalizers: tolerant readers, one per shape ─────────────────────────

const TIMELINE_ORDER: TimelineKind[] = [
  'SENT',
  'OPENED',
  'QUOTE_RECEIVED',
  'SUBMISSION_CLOSED',
  'ENVELOPES_OPENED',
  'AWARDED',
  'NOT_AWARDED',
]

function str(value: unknown): string {
  return value == null ? '' : String(value)
}

function strOrNull(value: unknown): string | null {
  const text = str(value).trim()
  return text ? text : null
}

function num(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/** The API may wrap payloads (`{ok, data}`); read through that once, here. */
function unwrapData(payload: unknown): unknown {
  const r = record(payload)
  if ('data' in r && r.data !== undefined && !('session' in r) && !('messages' in r)) return r.data
  return payload
}

export function normalizeAccount(raw: unknown): SupplierAccount {
  const r = record(raw)
  const status = str(r.status).toUpperCase()
  return {
    status: status === 'ACTIVE' || status === 'DECLINED' ? status : 'PROVISIONED',
    has_password: r.has_password === true,
    email: strOrNull(r.email),
    phone: strOrNull(r.phone),
    password_set_at: strOrNull(r.password_set_at),
  }
}

export function normalizeSession(raw: unknown): SupplierSession {
  const r = record(unwrapData(raw))
  const supplier = record(r.supplier)
  const session = str(r.session || r.session_token || r.token).trim()
  if (!session) throw new SupplierPortalError('لم يصل رمز الجلسة من الخادم.', 500, 'SUPPLIER_SESSION_MISSING')
  return {
    session,
    expires_at: strOrNull(r.expires_at),
    supplier: { id: str(supplier.id), name_ar: str(supplier.name_ar || supplier.name_en) },
    account: normalizeAccount(r.account),
  }
}

/**
 * The status path, one row per known step, in the order the steps happen.
 * A step the API did not report is UNKNOWN — never assumed done. A DONE step
 * without a date stays DONE (the screen says so without inventing a date).
 */
export function normalizeTimeline(raw: unknown): TimelineStep[] {
  const list = Array.isArray(raw) ? raw : []
  const byKind = new Map<TimelineKind, TimelineStep>()
  for (const item of list) {
    const r = record(item)
    const kind = str(r.kind).toUpperCase() as TimelineKind
    if (!TIMELINE_ORDER.includes(kind)) continue
    const rawState = str(r.state).toUpperCase()
    const state: TimelineState = rawState === 'DONE' || rawState === 'UPCOMING' ? rawState : 'UNKNOWN'
    byKind.set(kind, { kind, state, at: strOrNull(r.at) })
  }
  return TIMELINE_ORDER.filter((kind) => byKind.has(kind)).map((kind) => byKind.get(kind) as TimelineStep)
}

export function normalizeRequest(raw: unknown): SupplierRequest {
  const r = record(raw)
  return {
    invite_id: str(r.invite_id || r.id),
    buyer_company: str(r.buyer_company || record(r.buyer).company_name),
    reference: str(r.reference || r.rfq_reference),
    title: str(r.title),
    deadline: strOrNull(r.deadline || r.quote_deadline),
    status_timeline: normalizeTimeline(r.status_timeline),
    unread_count: Math.max(0, num(r.unread_count) ?? 0),
    line_count: num(r.line_count),
    quote_version: num(r.quote_version),
  }
}

function normalizeAttachment(raw: unknown): SupplierAttachment {
  const r = record(raw)
  return {
    id: strOrNull(r.id || r.file_id),
    filename: str(r.filename || r.name) || 'مرفق',
    content_type: str(r.content_type || r.type),
    size: num(r.size ?? r.size_bytes),
    url: (() => {
      const url = strOrNull(r.url || r.download_url)
      if (!url) return null
      if (url.startsWith('/api/')) return `${apiBase()}${url}`
      return /^https:\/\//.test(url) ? url : null
    })(),
  }
}

export function normalizeMessage(raw: unknown): SupplierMessage {
  const r = record(raw)
  const direction = str(r.direction).toUpperCase() === 'OUT' ? 'OUT' : 'IN'
  return {
    id: str(r.id || r.client_message_id),
    direction,
    channel: str(r.channel || 'PORTAL').toUpperCase(),
    body: str(r.body),
    attachments: (Array.isArray(r.attachments) ? r.attachments : []).map(normalizeAttachment),
    created_at: strOrNull(r.created_at),
    read_at: strOrNull(r.read_at),
    system_kind: strOrNull(r.system_kind),
    author: strOrNull(r.author || r.author_name || r.sender_name),
    client_message_id: strOrNull(r.client_message_id),
  }
}

export function normalizeMessages(raw: unknown): SupplierMessage[] {
  const payload = unwrapData(raw)
  const list = Array.isArray(payload) ? payload : record(payload).messages
  return (Array.isArray(list) ? list : []).map(normalizeMessage)
}

// ─── Errors: one cause, one sentence ──────────────────────────────────────

const EXPIRED_CODES = new Set([
  'SUPPLIER_LINK_EXPIRED',
  'SUPPLIER_TOKEN_EXPIRED',
  'SUPPLIER_TOKEN_INVALID',
  'CONSTRUCTION_SUPPLIER_TOKEN_INVALID',
  'INVITE_NOT_FOUND',
])

export function supplierErrorMessageAr(status: number, code: string): string {
  if (code === 'SUPPLIER_SESSION_EXPIRED' || (status === 401 && !EXPIRED_CODES.has(code)))
    return 'انتهت الجلسة — افتح رابط الدعوة من جديد.'
  if (EXPIRED_CODES.has(code) || status === 410) return 'انتهت صلاحية هذا الرابط.'
  if (code === 'SUPPLIER_ACCOUNT_DECLINED') return 'ألغيتم الحساب — الرابط صالح لتقديم العرض فقط.'
  if (code === 'OTP_INVALID') return 'الرمز غير صحيح — تأكد منه وأعد المحاولة.'
  if (code === 'OTP_EXPIRED') return 'انتهت صلاحية الرمز — اطلب رمزاً جديداً.'
  if (code === 'OTP_RATE_LIMITED' || status === 429) return 'طلبات كثيرة — انتظر قليلاً ثم أعد المحاولة.'
  if (code === 'EMAIL_INVALID') return 'الإيميل غير صحيح.'
  if (code === 'EMAIL_TAKEN') return 'هذا الإيميل مسجّل لحساب آخر.'
  if (code === 'PASSWORD_TOO_SHORT' || code === 'PASSWORD_WEAK') return 'كلمة المرور قصيرة — 8 أحرف على الأقل.'
  if (code === 'MESSAGE_FILES_TOO_LARGE' || code === 'INBOX_FILES_TOO_LARGE')
    return 'المرفقات أكبر من 18 ميجابايت للرسالة — قسّمها على أكثر من رسالة.'
  if (code === 'MESSAGE_FILES_TOO_MANY' || code === 'INBOX_FILES_TOO_MANY') return 'الحد 10 ملفات في الرسالة.'
  if (code === 'MESSAGE_FILE_TYPE_BLOCKED' || code === 'INBOX_FILE_TYPE_BLOCKED') return 'نقبل ملفات PDF والصور فقط.'
  if (status === 0) return 'لا يوجد اتصال — تحقق من الإنترنت وأعد المحاولة.'
  if (status >= 500) return 'الخدمة غير متاحة مؤقتاً — أعد المحاولة بعد قليل.'
  return 'تعذّر إتمام الطلب — أعد المحاولة.'
}

/** Is this refusal "the new routes are not here", so the portal falls back to the token routes? */
export function isRouteUnavailable(status: number, code: string): boolean {
  if (status === 404 && !EXPIRED_CODES.has(code)) return true
  if (status === 501) return true
  if (/_DISABLED$/.test(code)) return true
  if (status === 503 && !code) return true
  return false
}

// ─── Transport ────────────────────────────────────────────────────────────

export type TransportRequest = {
  method: 'GET' | 'POST'
  path: string
  body?: unknown
  headers: Record<string, string>
  onProgress?: (fraction: number) => void
}
export type TransportResponse = { status: number; payload: unknown }
export type Transport = (req: TransportRequest) => Promise<TransportResponse>

const TIMEOUT_MS = 60_000

async function parseJson(text: string): Promise<unknown> {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** fetch for everything; XHR only when the caller wants upload progress. */
export const browserTransport: Transport = async (req) => {
  const url = `${apiBase()}${req.path}`
  const body = req.body === undefined ? undefined : JSON.stringify(req.body)
  if (req.onProgress && typeof XMLHttpRequest !== 'undefined' && body) {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest()
      xhr.open(req.method, url)
      for (const [k, v] of Object.entries(req.headers)) xhr.setRequestHeader(k, v)
      xhr.timeout = TIMEOUT_MS * 3
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) req.onProgress?.(Math.min(1, event.loaded / event.total))
      }
      xhr.onload = async () => resolve({ status: xhr.status, payload: await parseJson(xhr.responseText) })
      xhr.onerror = () => resolve({ status: 0, payload: null })
      xhr.ontimeout = () => resolve({ status: 0, payload: null })
      xhr.send(body)
    })
  }
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { method: req.method, headers: req.headers, body, signal: controller.signal })
    return { status: response.status, payload: await parseJson(await response.text()) }
  } catch {
    return { status: 0, payload: null }
  } finally {
    globalThis.clearTimeout(timer)
  }
}

// ─── Session storage ──────────────────────────────────────────────────────

export const SUPPLIER_SESSION_STORAGE_KEY = 'farq_supplier_session'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

// ─── The client ───────────────────────────────────────────────────────────

export type OpenSessionResult =
  | { mode: 'session'; session: SupplierSession }
  | { mode: 'legacy' }
  | { mode: 'expired'; message: string }

export type SupplierPortalClientOptions = {
  transport?: Transport
  storage?: StorageLike | null
  now?: () => number
}

export function createSupplierPortalClient(options: SupplierPortalClientOptions = {}) {
  const transport = options.transport || browserTransport
  const storage = options.storage === undefined ? defaultStorage() : options.storage
  const now = options.now || (() => Date.now())
  let current: SupplierSession | null = null

  function remember(session: SupplierSession | null) {
    current = session
    try {
      if (session) storage?.setItem(SUPPLIER_SESSION_STORAGE_KEY, JSON.stringify(session))
      else storage?.removeItem(SUPPLIER_SESSION_STORAGE_KEY)
    } catch {
      /* private mode: memory still holds it */
    }
  }

  function isLive(session: SupplierSession | null): session is SupplierSession {
    if (!session) return false
    if (!session.expires_at) return true
    const ts = Date.parse(session.expires_at)
    return Number.isNaN(ts) || ts > now()
  }

  /** The session this tab already holds, if it has not expired. */
  function stored(): SupplierSession | null {
    if (isLive(current)) return current
    try {
      const raw = storage?.getItem(SUPPLIER_SESSION_STORAGE_KEY)
      if (!raw) return null
      const parsed = normalizeSession(JSON.parse(raw))
      if (!isLive(parsed)) {
        remember(null)
        return null
      }
      current = parsed
      return parsed
    } catch {
      return null
    }
  }

  async function call<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    read: (payload: unknown) => T = (p) => p as T,
    extra: { auth?: boolean; onProgress?: (f: number) => void } = {},
  ): Promise<T> {
    if (method === 'POST' && isBlockedWrite(path, method)) {
      throw new SupplierPortalError(READ_ONLY_MESSAGE, 403, 'CONSTRUCTION_READ_ONLY')
    }
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (extra.auth !== false) {
      const session = stored()
      if (!session) throw new SupplierPortalError(supplierErrorMessageAr(401, 'SUPPLIER_SESSION_EXPIRED'), 401, 'SUPPLIER_SESSION_EXPIRED')
      headers.Authorization = `Bearer ${session.session}`
    }
    const { status, payload } = await transport({ method, path, body, headers, onProgress: extra.onProgress })
    const r = record(payload)
    const code = str(record(Array.isArray(r.errors) ? r.errors[0] : null).code || r.code || r.error)
    if (status === 0 || status >= 400 || r.ok === false) {
      if (status === 401 && extra.auth !== false) remember(null)
      throw new SupplierPortalError(supplierErrorMessageAr(status, code), status, code || `HTTP_${status}`)
    }
    return read(payload)
  }

  return {
    /** The session in hand (memory, then this tab's storage). */
    currentSession: stored,

    forget(): void {
      remember(null)
    },

    /**
     * Trade the link token for a 12-hour session (opening the link again renews
     * it). Falls back to `legacy` when the route is missing or switched off, and
     * to the session this tab already holds when the network is down.
     */
    async openSession(token: string): Promise<OpenSessionResult> {
      try {
        const session = await call('POST', '/api/construction/supplier/session', { token }, normalizeSession, { auth: false })
        remember(session)
        return { mode: 'session', session }
      } catch (err) {
        if (!(err instanceof SupplierPortalError)) throw err
        if (isRouteUnavailable(err.status, err.code)) return { mode: 'legacy' }
        if (err.status === 0) {
          const held = stored()
          if (held) return { mode: 'session', session: held }
          throw err
        }
        if (err.status === 401 || err.status === 403 || err.status === 410 || EXPIRED_CODES.has(err.code)) {
          remember(null)
          return { mode: 'expired', message: err.message }
        }
        throw err
      }
    },

    listRequests(): Promise<SupplierRequest[]> {
      return call('GET', '/api/construction/supplier/requests', undefined, (payload) => {
        const data = unwrapData(payload)
        const list = Array.isArray(data) ? data : record(data).requests
        return (Array.isArray(list) ? list : []).map(normalizeRequest).filter((row) => row.invite_id)
      })
    },

    listMessages(inviteId: string): Promise<SupplierMessage[]> {
      return call(
        'GET',
        `/api/construction/supplier/requests/${encodeURIComponent(inviteId)}/messages`,
        undefined,
        normalizeMessages,
      )
    },

    /**
     * Idempotent send: the same `client_message_id` on a retry makes the API
     * return the message it already stored instead of storing a second one.
     */
    sendMessage(
      inviteId: string,
      input: { body: string; attachments: OutboundAttachment[]; client_message_id: string },
      onProgress?: (fraction: number) => void,
    ): Promise<SupplierMessage> {
      return call(
        'POST',
        `/api/construction/supplier/requests/${encodeURIComponent(inviteId)}/messages`,
        {
          body: input.body,
          client_message_id: input.client_message_id,
          attachments: input.attachments.map(({ filename, content_type, content }) => ({ filename, content_type, content })),
        },
        (payload) => {
          const data = record(unwrapData(payload))
          return normalizeMessage('message' in data ? data.message : data)
        },
        { onProgress: input.attachments.length ? onProgress : undefined },
      )
    },

    async declineAccount(): Promise<SupplierAccount | null> {
      return call('POST', '/api/construction/supplier/account/decline', {}, (payload) => {
        const data = record(unwrapData(payload))
        return 'account' in data ? normalizeAccount(data.account) : null
      })
    },

    requestOtp(purpose: OtpPurpose, email?: string): Promise<{ sent_to: string | null; resend_after_sec: number }> {
      return call('POST', '/api/construction/supplier/account/otp', email ? { purpose, email } : { purpose }, (payload) => {
        const data = record(unwrapData(payload))
        return {
          sent_to: strOrNull(data.sent_to || data.email),
          resend_after_sec: Math.max(0, num(data.resend_after_sec) ?? 60),
        }
      })
    },

    verifyOtp(code: string, password?: string): Promise<SupplierAccount | null> {
      return call(
        'POST',
        '/api/construction/supplier/account/otp/verify',
        password ? { code, password } : { code },
        (payload) => {
          const data = record(unwrapData(payload))
          return 'account' in data ? normalizeAccount(data.account) : null
        },
      )
    },

    /**
     * «أرسل لي رابط جديد» on the expired screen. NOT in the agreed contract:
     * until the API mounts it, a 404 surfaces as a plain instruction.
     */
    async requestNewLink(token: string): Promise<{ sent_to: string | null }> {
      return call(
        'POST',
        '/api/construction/supplier/link/resend',
        { token },
        (payload) => ({ sent_to: strOrNull(record(unwrapData(payload)).sent_to) }),
        { auth: false },
      )
    },
  }
}

export type SupplierPortalClient = ReturnType<typeof createSupplierPortalClient>

let shared: SupplierPortalClient | null = null
export function supplierPortalClient(): SupplierPortalClient {
  if (!shared) shared = createSupplierPortalClient()
  return shared
}

// ─── Attachments ─────────────────────────────────────────────────────────

export const SUPPLIER_ATTACHMENT_MAX_FILES = 10
export const SUPPLIER_ATTACHMENT_MAX_TOTAL_BYTES = 18 * 1024 * 1024
const ALLOWED_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'heic', 'heif', 'gif']

export function isAllowedAttachment(file: { name: string; type?: string }): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  const type = String(file.type || '').toLowerCase()
  return type === 'application/pdf' || type.startsWith('image/') || ALLOWED_EXT.includes(ext)
}

/** Null when the set can be sent; otherwise the sentence that says why not. */
export function attachmentProblemAr(files: ReadonlyArray<{ name: string; size: number; type?: string }>): string | null {
  if (files.length > SUPPLIER_ATTACHMENT_MAX_FILES) return `الحد ${SUPPLIER_ATTACHMENT_MAX_FILES} ملفات في الرسالة.`
  if (files.some((file) => !isAllowedAttachment(file))) return 'نقبل ملفات PDF والصور فقط.'
  if (files.some((file) => !file.size)) return 'ملف فارغ — أعد اختياره.'
  const total = files.reduce((sum, file) => sum + file.size, 0)
  if (total > SUPPLIER_ATTACHMENT_MAX_TOTAL_BYTES) return 'المرفقات أكبر من 18 ميجابايت للرسالة — قسّمها على أكثر من رسالة.'
  return null
}

export function readAttachment(file: File): Promise<OutboundAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      resolve({
        filename: file.name,
        content_type: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'),
        content: String(reader.result).split(',', 2)[1] || '',
        size: file.size,
      })
    reader.onerror = () => reject(new Error('تعذر قراءة الملف — أعد اختياره.'))
    reader.readAsDataURL(file)
  })
}
