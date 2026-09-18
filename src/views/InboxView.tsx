import { useCallback, useEffect, useRef, useState } from 'react'
import type { NavProps } from '../types'
import { apiUnreachableAdvice } from '../api/apiBase'
import {
  buildConstructionGmailReturnTo,
  constructionRateLimitSec,
  getConstructionGmailStatus,
  getConstructionInboxStatus,
  isOutboundInviteSnapshot,
  listConstructionInboxThreads,
  startConstructionGmailConnect,
  type ConstructionGmailStatus,
  type ConstructionInboxStatus,
  type ConstructionInboxThread,
  type ConstructionInboxThreadsResult,
} from '../api/constructionClient'
import { useProcurement } from '../procurementContext'
import { ChatPane } from '../components/inbox/ChatPane'
import { ConversationList, type InboxTab } from '../components/inbox/ConversationList'
import { useFillViewport } from '../components/inbox/useFillViewport'

function readGmailReturnQuery(): { status: string | null; error: string | null } {
  try {
    const params = new URLSearchParams(window.location.search)
    return {
      status: params.get('gmail'),
      error: params.get('gmail_error'),
    }
  } catch {
    return { status: null, error: null }
  }
}

function clearGmailReturnQuery() {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('gmail') && !url.searchParams.has('gmail_error')) return
    url.searchParams.delete('gmail')
    url.searchParams.delete('gmail_error')
    // Keep view=inbox so refresh stays on the inbox surface.
    if (!url.searchParams.get('view')) url.searchParams.set('view', 'inbox')
    window.history.replaceState({}, '', url.toString())
  } catch {
    /* ignore */
  }
}

/** How long «ربط Gmail» stays shut after a failed attempt. */
const CONNECT_COOLDOWN_MS = 3000

function flagLabel(on: boolean | undefined, unknown = false): { text: string; className: string } {
  if (unknown) return { text: 'غير معروف', className: 'bg-neutral-100 text-neutral-500' }
  if (on) return { text: 'مفعّل', className: 'bg-[#CFF5DC] text-[#1a7a45]' }
  return { text: 'معطّل / غير جاهز', className: 'bg-amber-50 text-amber-800' }
}

function gmailFlagAr(value: boolean | undefined): string {
  if (value === true) return 'نعم'
  if (value === false) return 'لا'
  return 'غير معروف'
}

function applyInboxTab(
  tab: InboxTab,
  rows: ConstructionInboxThread[],
): ConstructionInboxThread[] {
  if (tab === 'needs_reply') return rows.filter((t) => Boolean(t.needs_reply))
  if (tab === 'sent') return rows.filter((t) => isOutboundInviteSnapshot(t))
  // وارد: supplier replies / conversations — never outbound invite snapshots
  return rows.filter((t) => !isOutboundInviteSnapshot(t))
}

function displayTotal(
  tab: InboxTab,
  visible: ConstructionInboxThread[],
  result: ConstructionInboxThreadsResult | null,
): number {
  const counts = result?.follow_up_counts
  if (tab === 'needs_reply') {
    return counts?.action ?? result?.total_count ?? visible.length
  }
  if (tab === 'sent') {
    return counts?.unanswered ?? visible.length
  }
  // وارد ≈ الكل − دعوات مرسلة بلا وارد
  if (counts?.all != null && counts?.unanswered != null) {
    return Math.max(0, counts.all - counts.unanswered)
  }
  return visible.length
}

export type InboxViewProps = NavProps & {
  /**
   * Conversation to open on arrival. The `'inbox-thread'` route passes the
   * context's `selectedThreadId` here, so a deep link lands on the same
   * two-pane screen with that chat already open.
   */
  initialThreadId?: string | null
}

/**
 * «المراسلات» as a tablet chat app: the conversation list and the open chat
 * side by side from `lg` (iPad landscape) up, one pane at a time below it.
 * Picking a conversation is local state, not a route change — a route change
 * would remount this screen and re-read the list, the inbox status and the
 * Gmail status on every tap, against an API that rate-limits at 60/min.
 */
export function InboxView({ navigate, initialThreadId = null }: InboxViewProps) {
  const { openRfq, setSelectedOfferId } = useProcurement()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const viewport = useFillViewport(rootRef)
  /** Invitation id of the chat showing in the chat pane. */
  const [activeId, setActiveId] = useState<string | null>(initialThreadId)
  /** The mailbox/Gmail status panel takes the chat pane's place while open. */
  const [showStatus, setShowStatus] = useState(false)
  /** Bumped by «إعادة المحاولة»: re-runs the same reads, adds no new ones. */
  const [reloadKey, setReloadKey] = useState(0)
  const [status, setStatus] = useState<ConstructionInboxStatus | null>(null)
  const [gmail, setGmail] = useState<ConstructionGmailStatus | null>(null)
  const [gmailError, setGmailError] = useState<string | null>(null)
  /** Seconds left on the server's limiter — never conflated with «غير متصل». */
  const [rateLimitSec, setRateLimitSec] = useState<number | null>(null)
  /**
   * The limiter refused the last status read, so we simply do not know the
   * state. Outlives the countdown: when it expires we still have no reading,
   * and falling back to «غير متصل» would be the same lie one second later.
   */
  const [gmailStatusUnread, setGmailStatusUnread] = useState(false)
  const [gmailBusy, setGmailBusy] = useState(false)
  /**
   * Guards «ربط Gmail» against a second attempt. A ref, not `gmailBusy`: state
   * updates are async, so rapid clicks all pass a state check and each one used
   * to cost a connect POST plus a status GET.
   */
  const connectInFlight = useRef(false)
  /** Brief hold after a failed attempt, so repeat-clicking can't re-spam it. */
  const [connectCooldown, setConnectCooldown] = useState(false)
  const cooldownTimer = useRef<number | null>(null)
  const [gmailConnectNote, setGmailConnectNote] = useState<string | null>(null)
  const [gmailReturnBanner, setGmailReturnBanner] = useState<{
    kind: 'connected' | 'error'
    detail?: string
  } | null>(null)
  const [threads, setThreads] = useState<ConstructionInboxThread[]>([])
  const [threadMeta, setThreadMeta] = useState<ConstructionInboxThreadsResult | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** Default وارد — not «الكل» which mixes DISPATCH invite spam from the API. */
  const [tab, setTab] = useState<InboxTab>('inbound')

  const applyGmailStatus = (g: ConstructionGmailStatus) => {
    setGmail(g)
    setGmailError(null)
    setRateLimitSec(null)
    setGmailStatusUnread(false)
  }

  const applyGmailFailure = (err: Error) => {
    const wait = constructionRateLimitSec(err)
    if (wait != null) {
      // Keep the last known status. A rate limit says nothing about the
      // mailbox, and blanking it here is exactly what made this panel report
      // the owner as disconnected while he was in fact connected.
      setRateLimitSec(wait)
      setGmailStatusUnread(true)
      return
    }
    setGmail(null)
    setGmailError(err.message)
    setRateLimitSec(null)
    setGmailStatusUnread(false)
  }

  const reloadGmail = () =>
    getConstructionGmailStatus().then(applyGmailStatus).catch(applyGmailFailure)

  /**
   * Keeps «ربط Gmail» shut for a moment after a failed attempt. A second click
   * in the same second cannot change why the first one failed, and each attempt
   * costs a connect POST plus a status GET — that pair, repeated, is what filled
   * the owner's console.
   */
  const beginConnectCooldown = () => {
    setConnectCooldown(true)
    if (cooldownTimer.current != null) window.clearTimeout(cooldownTimer.current)
    cooldownTimer.current = window.setTimeout(() => {
      connectInFlight.current = false
      setConnectCooldown(false)
      cooldownTimer.current = null
    }, CONNECT_COOLDOWN_MS)
  }

  useEffect(
    () => () => {
      if (cooldownTimer.current != null) window.clearTimeout(cooldownTimer.current)
    },
    [],
  )

  // Counts the limiter down so «أعد المحاولة بعد كذا» stays true, and clears
  // itself at zero. Deliberately not a refetch: nothing here re-requests on its
  // own, so a refused call can never feed the next one.
  useEffect(() => {
    if (rateLimitSec == null || rateLimitSec <= 0) return
    const id = window.setTimeout(() => setRateLimitSec((s) => (s == null || s <= 1 ? null : s - 1)), 1000)
    return () => window.clearTimeout(id)
  }, [rateLimitSec])

  useEffect(() => {
    const returned = readGmailReturnQuery()
    if (returned.status === 'connected') {
      setGmailReturnBanner({ kind: 'connected' })
      setShowStatus(true)
      clearGmailReturnQuery()
    } else if (returned.status === 'error') {
      setGmailReturnBanner({
        kind: 'error',
        detail: returned.error || undefined,
      })
      setShowStatus(true)
      clearGmailReturnQuery()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    // API accepts only needs_reply | all. «all» unions dispatch_attempts as threads
    // (preview «دعوة طلب عرض مرسلة», kind_hint=DISPATCH). We always fetch `all`
    // (except needs_reply tab uses server filter) then separate وارد / مرسل client-side.
    const apiFilter = tab === 'needs_reply' ? 'needs_reply' : 'all'
    // Deliberately not part of the Promise.all below: the Gmail panel must keep
    // its own result even when the thread list fails, otherwise one unrelated
    // error blanks the connection state and the panel starts guessing.
    getConstructionGmailStatus()
      .then((g) => {
        if (!cancelled) applyGmailStatus(g)
      })
      .catch((err: Error) => {
        if (!cancelled) applyGmailFailure(err)
      })

    Promise.all([
      getConstructionInboxStatus(),
      listConstructionInboxThreads({ filter: apiFilter }),
    ])
      .then(([inboxStatus, threadResult]) => {
        if (cancelled) return
        setStatus(inboxStatus)
        setThreadMeta(threadResult)
        const raw = threadResult.threads || []
        const visible = applyInboxTab(tab, raw)
        setThreads(visible)
        setTotal(displayTotal(tab, visible, threadResult))
      })
      .catch((err: Error) => {
        if (cancelled) return
        const wait = constructionRateLimitSec(err)
        setError(err.message)
        // A rate limit must not blank the counters or invite a flag hunt; the
        // banner below says «حدّ سرعة» and keeps whatever we already had.
        if (wait != null) {
          setRateLimitSec(wait)
          return
        }
        setRateLimitSec(null)
        setStatus(null)
        setThreads([])
        setThreadMeta(null)
        setTotal(0)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tab, reloadKey])

  const handleGmailConnect = async () => {
    if (connectInFlight.current) return
    connectInFlight.current = true
    setGmailBusy(true)
    setGmailConnectNote(null)
    setGmailReturnBanner(null)
    try {
      const result = await startConstructionGmailConnect(buildConstructionGmailReturnTo())
      if (!result.launch_url) {
        // Old API build: no /launch bridge, and it rejects the signed return_to
        // state. Starting Google here would dead-end, so stop and say why.
        throw new Error(
          'ربط بريد Gmail غير متاح من هذه الصفحة حاليًا. تواصل مع فرق لإتمام الربط.',
        )
      }
      // launch_url sets the Secure cookie on www.farq.sa (Google callback host).
      const url = new URL(result.launch_url)
      const isLaunch =
        url.origin === 'https://www.farq.sa' &&
        url.pathname === '/_api/api/construction/inbox/gmail/launch'
      if (!isLaunch) {
        throw new Error('رابط بدء الربط غير متوقع — أُلغيت العملية.')
      }
      window.location.assign(url.toString())
    } catch (err) {
      const wait = constructionRateLimitSec(err)
      setGmailConnectNote(
        err instanceof Error
          ? err.message
          : 'تعذّر بدء الربط من هذا التطبيق',
      )
      setGmailBusy(false)
      // Releases `connectInFlight` when it expires — not here.
      beginConnectCooldown()
      if (wait != null) {
        // The refusal was a rate limit, so re-reading the status would be
        // refused too. That pair — connect then status — is what filled the
        // console: one click cost two requests and taught us nothing.
        setRateLimitSec(wait)
        return
      }
      void reloadGmail()
    }
  }

  const enabled = Boolean(status?.enabled)
  const receiving = Boolean(status?.receiving_configured)
  const correspondence = Boolean(status?.correspondence_enabled)
  const gmailCanConnect =
    Boolean(gmail?.allowed && gmail?.configured && !gmail?.connected) && !gmailError

  /** One honest cause + one action, instead of a single lumped message. */
  const gmailDiagnosis = (():
    | { title: string; action: string; tone: 'ok' | 'warn' | 'info' }
    | null => {
    // First, before any state guess: a rate limit is a temporary speed cap. It
    // is not «غير متصل» and not «غير مهيأ», and must never be dressed as either.
    if (rateLimitSec != null) {
      return {
        tone: 'warn',
        title: `تجاوزنا حد المحاولات على الـ API — أعد المحاولة بعد ${rateLimitSec} ثانية.`,
        action:
          'حدّ سرعة مؤقّت على كل مسارات /api/construction (60 طلبًا في الدقيقة لكل عنوان IP)، وليس انقطاعًا في ربط Gmail ولا نقصًا في الإعدادات. الحالة المعروضة أعلاه هي آخر قراءة ناجحة إن وُجدت.',
      }
    }
    if (gmailStatusUnread && !gmail) {
      return {
        tone: 'warn',
        title: 'انتهت مدة الانتظار لكن حالة Gmail لم تُقرأ بعد — غير معروفة، وليست «غير متصلة».',
        action: 'اضغط «إعادة قراءة الحالة» لمحاولة واحدة. لا نعيد الطلب تلقائيًا حتى لا نستهلك حدّ السرعة من جديد.',
      }
    }
    if (gmailError) {
      if (gmailError.includes('CONSTRUCTION_API_UNREACHABLE') || gmailError.includes('لا يمكن الوصول')) {
        return {
          tone: 'warn',
          title: 'الـ API غير قابل للوصول من هذا التطبيق.',
          action: apiUnreachableAdvice(),
        }
      }
      if (gmailError.includes('401') || gmailError.includes('AUTH')) {
        return {
          tone: 'warn',
          title: 'الجلسة غير مصادَقة لواجهة البناء.',
          action: 'سجّل الدخول بحساب مالك الشركة لإدارة ربط البريد.',
        }
      }
      return { tone: 'warn', title: 'تعذّر قراءة حالة Gmail.', action: gmailError }
    }
    if (!gmail) return null
    if (gmail.connected) {
      const sync = gmail.sync
      const failure = String(sync?.failure_code || '')
      const captured = Number(sync?.captured_count || 0)
      const ambiguous = Number(sync?.ambiguous_count || 0)
      if (!gmail.synchronization_enabled) {
        return {
          tone: 'info',
          title: 'التفويض محفوظ، لكن المزامنة مُطفأة — لا تُجلب أي رسالة.',
          action: 'فعّل CONSTRUCTION_GMAIL_SYNC_ENABLED=1 على نفس الـ API الذي يخدم هذا التطبيق، وأعد تشغيله.',
        }
      }
      if (gmail.configured === false) {
        // The progress row is shared across API instances; one lacking Google
        // credentials cannot refresh a token, so it must not borrow that state.
        return {
          tone: 'warn',
          title: 'التفويض محفوظ، لكن هذا الـ API لا يملك بيانات Google فلا ينفّذ المزامنة بنفسه.',
          action: 'اضبط CONSTRUCTION_GMAIL_CLIENT_ID و CLIENT_SECRET و TOKEN_KEY على هذا الـ API (نفس قيم الخادم الذي أنشأ التفويض)، وأعد تشغيله. أي حالة «تعمل» أدناه كتبها خادم آخر.',
        }
      }
      if (failure === 'TOKEN_INVALID') {
        return {
          tone: 'warn',
          title: 'المزامنة مفعّلة لكنها تفشل في فك تشفير التفويض (TOKEN_INVALID).',
          action: 'CONSTRUCTION_GMAIL_TOKEN_KEY غائب أو بطول خاطئ على هذا الـ API — يلزم نفس القيمة التي شُفِّر بها الرمز المحفوظ، ويملكها المالك وحده.',
        }
      }
      if (failure === 'SYNC_FAILED') {
        return {
          tone: 'warn',
          title: 'المزامنة مفعّلة لكن المحاولة فشلت (SYNC_FAILED).',
          action: 'الاحتمال الأرجح أن CONSTRUCTION_GMAIL_TOKEN_KEY قيمة مختلفة عن التي شُفِّر بها الرمز، أو بيانات Google غير مطابقة — راجعها مع المالك.',
        }
      }
      if (failure) {
        return {
          tone: 'warn',
          title: `المزامنة متوقفة مؤقتًا (${failure}).`,
          action: 'ستُعاد المحاولة تلقائيًا. إن تكررت المشكلة تواصل مع فرق.',
        }
      }
      if (captured > 0) {
        return {
          tone: 'ok',
          title: `المزامنة تعمل — التُقطت ${captured} رسالة${ambiguous > 0 ? ` و${ambiguous} بلا مطابقة فريدة` : ''}.`,
          action: 'الرسائل المرتبطة بدعوة تظهر في «وارد» والجرس؛ غير الفريدة تبقى بانتظار ربط يدوي.',
        }
      }
      return {
        tone: 'info',
        title: 'المزامنة تعمل لكن لم تُطابق أي رسالة دعوةً حتى الآن (0 التقاط).',
        action: 'الرد يُربط فقط عبر Reply-To الموقّع، أو In-Reply-To لرسالة مُستوردة سابقًا، أو مرجع ELE-RFQ-… مع اسم مورد فريد. ردود مثل Zendesk بعنوان مُرسِل مختلف تبقى غير مربوطة.',
      }
    }
    if (gmail.allowed === false) {
      return {
        tone: 'warn',
        title: 'ممثّل الجلسة لا يطابق مالك الصندوق (actor mismatch).',
        action: 'ربط البريد يديره مالك الشركة. تواصل معه أو مع فرق.',
      }
    }
    if (gmail.configured === false) {
      return {
        tone: 'info',
        title: 'تفويض Gmail غير مهيّأ على الـ API (بيانات Google ناقصة).',
        action: 'ربط بريد Gmail غير مفعّل لهذه الشركة بعد. تواصل مع فرق لتفعيله.',
      }
    }
    return {
      tone: 'info',
      title: 'جاهز للربط من هذا التطبيق.',
      action: 'اضغط «ربط Gmail» ووافق بحساب info@farq.sa.',
    }
  })()

  const needsReplyCount = threadMeta?.follow_up_counts?.action
  const sentCount = threadMeta?.follow_up_counts?.unanswered

  // A deep link / notification can change the requested thread while mounted.
  useEffect(() => {
    if (initialThreadId) {
      setActiveId(initialThreadId)
      setShowStatus(false)
    }
  }, [initialThreadId])

  const handleSelect = (thread: ConstructionInboxThread) => {
    const rfqId = thread.request_context?.rfq_id
    // A conversation opens as a conversation, beside the list. The RFQ/offer
    // surfaces stay reachable from inside the chat header.
    if (thread.invite_id) {
      setSelectedOfferId(thread.invite_id)
      setActiveId(String(thread.invite_id))
      setShowStatus(false)
    } else if (rfqId) {
      openRfq(rfqId, 'offers')
    }
  }

  /**
   * The chat pane re-reads a thread after marking it read; its count of unread
   * inbound messages replaces the row's older `unread_count` so the badge does
   * not keep announcing messages the owner is looking at.
   */
  const handleUnreadKnown = useCallback((inviteId: string, unread: number) => {
    setThreads((rows) =>
      rows.some((row) => String(row.invite_id || '') === inviteId && Number(row.unread_count || 0) !== unread)
        ? rows.map((row) =>
            String(row.invite_id || '') === inviteId ? { ...row, unread_count: unread } : row,
          )
        : rows,
    )
  }, [])

  const closeDetail = () => {
    setActiveId(null)
    setShowStatus(false)
  }

  const detailOpen = showStatus || activeId != null
  const mailboxWarning = gmailDiagnosis?.tone === 'warn' ? gmailDiagnosis.title : null

  const statusPanel = (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 flex items-center gap-3 px-3 sm:px-4 py-3 bg-white border-b border-neutral-200">
        <button
          type="button"
          onClick={closeDetail}
          aria-label="رجوع إلى قائمة المحادثات"
          className="flex-shrink-0 w-9 h-9 -ms-1 rounded-full flex items-center justify-center text-[#123F3A] hover:bg-neutral-100"
        >
          <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 4l6 6-6 6" />
          </svg>
        </button>
        <div className="min-w-0">
          <h2 className="text-base font-black text-[#0D1F1D]">حالة الصندوق وربط Gmail</h2>
          <p className="text-[11px] text-neutral-500 leading-relaxed">
            أي رد مورد يصل عبر Reply-To أو صندوق info@ (بعد ربط Gmail) — وليس قائمة دعوات الإرسال.
          </p>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-[#FAFAF8] px-3 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {loading && <p className="text-sm text-neutral-400 text-center py-10">جاري تحميل حالة الصندوق…</p>}

          {!loading && error && rateLimitSec == null && (
            // The flag checklist is for a real outage. Printing it for a rate
            // limit is what sends the reader chasing settings that are already
            // correct.
            <div role="alert" className="rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4">
              <div className="font-bold text-amber-900 text-sm mb-1">تعذّر قراءة الصندوق</div>
              <p className="text-xs text-amber-800 leading-relaxed mb-2 break-words">{error}</p>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                أعد المحاولة بعد قليل. إن استمرت المشكلة تواصل مع فرق. لا نعرض بيانات واردة غير حقيقية هنا.
              </p>
            </div>
          )}

          {!loading && status && (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {(
                [
                  ['الاستقبال', enabled && receiving],
                  ['المراسلات', correspondence],
                  ['العامل', Boolean(status.worker_enabled)],
                  ['الردود', Boolean(status.replying_allowed)],
                ] as [string, boolean][]
              ).map(([label, on]) => {
                const badge = flagLabel(on)
                return (
                  <div key={label} className="bg-white border border-neutral-100 rounded-2xl px-4 py-3">
                    <div className="text-xs text-neutral-400 mb-1">{label}</div>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${badge.className}`}>
                      {badge.text}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {!loading && (
          <div className="bg-white border border-neutral-100 rounded-2xl p-4">
            <div className="text-sm font-bold text-[#0D1F1D] mb-1">Gmail — info@farq.sa</div>
            {gmailReturnBanner?.kind === 'connected' && (
              <p className="text-xs text-[#1a7a45] font-semibold mb-2 leading-relaxed">
                اكتمل ربط Google من هذا التطبيق. حدّث الحالة أدناه إن لزم.
              </p>
            )}
            {gmailReturnBanner?.kind === 'error' && (
              <p className="text-xs text-amber-800 mb-2 leading-relaxed">
                فشل إكمال ربط Gmail
                {gmailReturnBanner.detail ? ` (${gmailReturnBanner.detail})` : ''}. أعد المحاولة من الزر أدناه —
                لا أسرار Google في الواجهة.
              </p>
            )}
            {gmail && !gmailError ? (
              <p className="text-xs text-neutral-500 mb-2 leading-relaxed">
                مسموح للمالك: {gmailFlagAr(gmail.allowed)} · مهيّأ (OAuth):{' '}
                {gmailFlagAr(gmail.configured)} · متصل: {gmailFlagAr(gmail.connected)}
                {gmail.sync?.state
                  ? ` · المزامنة: ${gmail.sync.state}`
                  : gmail.state
                    ? ` · الحالة: ${gmail.state}`
                    : ''}
                {rateLimitSec != null ? ' — آخر قراءة ناجحة (الحالة الآن محدودة بحدّ السرعة)' : ''}
              </p>
            ) : gmailStatusUnread ? (
              // No successful read, so we say we don't know — we do NOT say
              // «غير متصل».
              <p className="text-xs text-amber-800 mb-2 leading-relaxed">
                حالة Gmail غير معروفة الآن بسبب حدّ السرعة — لم نتمكّن من قراءتها، وهذا لا يعني أن الربط منقطع.
              </p>
            ) : !gmail && !gmailError ? (
              <p className="text-xs text-neutral-400 mb-2">لم تُجلب حالة Gmail.</p>
            ) : null}
            {gmailDiagnosis && (
              <div
                className={`rounded-xl px-3 py-2 mb-3 ${
                  gmailDiagnosis.tone === 'ok'
                    ? 'bg-[#CFF5DC]/40'
                    : gmailDiagnosis.tone === 'warn'
                      ? 'bg-amber-50'
                      : 'bg-neutral-50'
                }`}
              >
                <p
                  className={`text-xs font-bold leading-relaxed ${
                    gmailDiagnosis.tone === 'ok'
                      ? 'text-[#1a7a45]'
                      : gmailDiagnosis.tone === 'warn'
                        ? 'text-amber-900'
                        : 'text-[#0D1F1D]'
                  }`}
                >
                  {gmailDiagnosis.title}
                </p>
                <p className="text-[11px] text-neutral-600 leading-relaxed mt-1">
                  الإجراء: {gmailDiagnosis.action}
                </p>
              </div>
            )}
            {gmail?.connected ? (
              <p className="text-xs text-neutral-500 leading-relaxed">
                الربط يلتقط ردود <bdi>info@farq.sa</bdi> ويربطها بدعوة RFQ عند تطابق فريد: Reply-To الموقّع،
                In-Reply-To، مرجع ELE-RFQ-…، أو اسم المورد في From (مثل Zendesk). التطابق الغامض لا يُستورد،
                والمزامنة لا تعمل قبل تفعيل CONSTRUCTION_GMAIL_SYNC_ENABLED.
              </p>
            ) : (
              <>
                <p className="text-xs text-neutral-500 leading-relaxed mb-3">
                  اضغط «ربط Gmail» هنا ووافق بحساب <bdi>info@farq.sa</bdi> على شاشة Google. مسار Resend على
                  replies.farq.sa يبقى يعمل بالتوازي.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    // Blocked while a connect is in flight, while the limiter is
                    // counting down, and while the status is unknown — starting
                    // OAuth on a guess is how the storm began.
                    disabled={
                      gmailBusy ||
                      connectCooldown ||
                      rateLimitSec != null ||
                      gmailStatusUnread ||
                      gmail?.configured === false
                    }
                    onClick={handleGmailConnect}
                    className="px-4 py-2 bg-[#123F3A] text-white text-xs font-bold rounded-lg disabled:opacity-50"
                  >
                    {rateLimitSec != null
                      ? `حدّ السرعة — بعد ${rateLimitSec} ثانية`
                      : gmailBusy
                        ? 'جارٍ فتح Google…'
                        : connectCooldown
                          ? 'تعذّرت المحاولة — انتظر لحظة'
                          : 'ربط Gmail'}
                  </button>
                  {rateLimitSec == null && (gmailStatusUnread || gmailError) && (
                    <button
                      type="button"
                      onClick={() => void reloadGmail()}
                      className="px-4 py-2 border border-neutral-200 text-[#123F3A] text-xs font-bold rounded-lg"
                    >
                      إعادة قراءة الحالة
                    </button>
                  )}
                </div>
                {gmailConnectNote && (
                  <p className="text-xs text-amber-800 mt-2 leading-relaxed">{gmailConnectNote}</p>
                )}
              </>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  )

  const emptyState =
    tab === 'sent' ? (
      <>
        <p className="text-sm text-neutral-500 mb-1">لا دعوات مرسلة ظاهرة في هذه الصفحة.</p>
        <p className="text-xs text-neutral-400 leading-relaxed">
          سجلات الإرسال تظهر أيضًا داخل تفاصيل كل RFQ وقائمة العروض والمراسلات.
        </p>
      </>
    ) : tab === 'needs_reply' ? (
      <>
        <p className="text-sm text-neutral-500 mb-1">لا محادثات تحتاج ردًا الآن.</p>
        <p className="text-xs text-neutral-400 leading-relaxed">
          يظهر العدد هنا فقط عند وصول رسالة واردة من المورد ولم تُعالَج بعد — وليس بعدد الدعوات المرسلة.
        </p>
      </>
    ) : (
      <>
        <p className="text-sm text-neutral-500 mb-1">لا ردود واردة من الموردين بعد.</p>
        <p className="text-xs text-neutral-400 leading-relaxed mb-3">
          {!enabled || !receiving
            ? 'صندوق الوارد غير جاهز على الـ API — راجع أعلام CONSTRUCTION_INBOX_* في «حالة الصندوق».'
            : 'هنا تظهر ردود الموردين بعد ربطها بدعوة: عبر Reply-To على replies.farq.sa، أو عبر مزامنة Gmail لصندوق info@farq.sa (بما فيها ردود Zendesk/CC عندما يتطابق مرجع ELE-RFQ-… أو اسم المورد بشكل فريد). دعوات «تم الإرسال» ليست واردًا — راجع تبويب مرسَل أو العروض.'}
        </p>
        {enabled && receiving && !gmail?.connected && !gmailStatusUnread && rateLimitSec == null && (
          <p className="text-xs text-amber-800 leading-relaxed bg-amber-50 rounded-xl px-3 py-2">
            لتظهر ردود مثل دهانات الجزيرة التي تصل إلى info@ دون Reply-To الموقّع: أكمل «ربط Gmail» من «حالة الصندوق»
            بحساب المالك، ثم أعد فتح الوارد لتشغيل المزامنة. المطابقات غير الفريدة تُرفض ولن تُختلق.
          </p>
        )}
      </>
    )

  return (
    <div
      ref={rootRef}
      // Until measured, a safe CSS guess; afterwards exactly the space the shell leaves.
      style={
        viewport.height != null
          ? { height: viewport.height, marginBottom: viewport.marginBottom }
          : { height: 'calc(100dvh - 8rem)' }
      }
      className="flex overflow-hidden bg-white lg:border-s border-neutral-200"
    >
      {/* First child = the right-hand pane in RTL, where Arabic WhatsApp keeps its list. */}
      <section
        aria-label="قائمة المحادثات"
        className={`${detailOpen ? 'hidden lg:flex' : 'flex'} flex-col min-h-0 w-full lg:w-[360px] xl:w-[400px] lg:flex-shrink-0 lg:border-e border-neutral-200`}
      >
        <ConversationList
          threads={threads}
          loading={loading}
          error={error}
          rateLimitSec={rateLimitSec}
          onRetry={() => setReloadKey((n) => n + 1)}
          tab={tab}
          onTabChange={setTab}
          needsReplyCount={needsReplyCount ?? null}
          sentCount={sentCount ?? null}
          total={error ? null : total}
          hasMore={Boolean(threadMeta?.next_cursor)}
          activeKey={activeId}
          onSelect={handleSelect}
          actions={
            <>
              <button
                type="button"
                onClick={() => navigate('offers')}
                className="text-[11px] font-bold text-[#123F3A] rounded-full px-2.5 py-1.5 hover:bg-neutral-100"
              >
                العروض
              </button>
              <button
                type="button"
                aria-pressed={showStatus}
                onClick={() => {
                  setShowStatus((open) => !open)
                  setActiveId(null)
                }}
                className={`relative text-[11px] font-bold rounded-full px-2.5 py-1.5 border ${
                  showStatus
                    ? 'bg-[#123F3A] text-white border-[#123F3A]'
                    : 'text-[#123F3A] border-neutral-200 hover:border-[#123F3A]/40'
                }`}
              >
                حالة الصندوق
                {mailboxWarning && (
                  <span className="absolute -top-0.5 -start-0.5 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-white" />
                )}
              </button>
            </>
          }
          alert={
            mailboxWarning && !showStatus ? (
              <button
                type="button"
                onClick={() => {
                  setShowStatus(true)
                  setActiveId(null)
                }}
                className="w-full text-start rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-[11px] text-amber-900 leading-relaxed hover:border-amber-300"
              >
                <span className="font-bold">تنبيه الصندوق: </span>
                {mailboxWarning}
              </button>
            ) : null
          }
          tabNote={
            !loading && !error && tab === 'sent' ? (
              <p className="text-[11px] text-neutral-500 mt-2 leading-relaxed">
                لقطات إرسال الدعوة («دعوة طلب عرض مرسلة») من `dispatch_attempts` — للمتابعة التفصيلية استخدم{' '}
                <button
                  type="button"
                  className="font-bold text-[#123F3A] hover:underline"
                  onClick={() => navigate('offers')}
                >
                  العروض والمراسلات
                </button>
                .
              </p>
            ) : null
          }
          emptyState={emptyState}
        />
      </section>

      <section
        aria-label="المحادثة"
        className={`${detailOpen ? 'flex' : 'hidden lg:flex'} flex-col flex-1 min-w-0 min-h-0`}
      >
        {showStatus ? (
          statusPanel
        ) : activeId ? (
          <ChatPane
            key={activeId}
            inviteId={activeId}
            onBack={closeDetail}
            onOpenRfq={(rfqId) => openRfq(rfqId, 'rfq-detail')}
            onUnreadKnown={handleUnreadKnown}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8 bg-[#F7F6F2]">
            <div className="w-20 h-20 rounded-full bg-[#CFF5DC] flex items-center justify-center mb-5" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="w-9 h-9 text-[#123F3A]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5h16v11H9l-5 4V5z" />
                <path d="M8 9h8M8 12h5" />
              </svg>
            </div>
            <h2 className="text-xl font-black text-[#0D1F1D] mb-2">اختر محادثة لعرضها هنا</h2>
            <p className="text-sm text-neutral-500 max-w-sm leading-relaxed">
              كل مورد في محادثة واحدة: ردوده ورسائلنا ومرفقاته بترتيبها، والأحدث في أعلى القائمة.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

export default InboxView
