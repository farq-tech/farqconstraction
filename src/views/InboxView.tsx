import { useEffect, useRef, useState } from 'react'
import type { NavProps } from '../types'
import {
  buildConstructionGmailReturnTo,
  constructionRateLimitSec,
  formatArDate,
  getConstructionGmailStatus,
  getConstructionInboxStatus,
  inboxThreadSupplierLabel,
  isOutboundInviteSnapshot,
  listConstructionInboxThreads,
  startConstructionGmailConnect,
  type ConstructionGmailStatus,
  type ConstructionInboxStatus,
  type ConstructionInboxThread,
  type ConstructionInboxThreadsResult,
} from '../api/constructionClient'
import { useProcurement } from '../procurementContext'

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

type InboxTab = 'inbound' | 'needs_reply' | 'sent'

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

export function InboxView({ navigate }: NavProps) {
  const { openRfq, setSelectedOfferId, openInboxThread } = useProcurement()
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
      clearGmailReturnQuery()
    } else if (returned.status === 'error') {
      setGmailReturnBanner({
        kind: 'error',
        detail: returned.error || undefined,
      })
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
  }, [tab])

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
          'الـ API الذي يخدم هذا التطبيق نسخة قديمة بلا جسر /launch — يلزم نشر Farq API المحدّث قبل إتمام الربط من هنا.',
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
          action: 'شغّل Farq API واضبط VITE_API_PROXY_TARGET عليه، ثم أعد تحميل الصفحة.',
        }
      }
      if (gmailError.includes('401') || gmailError.includes('AUTH')) {
        return {
          tone: 'warn',
          title: 'الجلسة غير مصادَقة لواجهة البناء.',
          action: 'محليًا: CONSTRUCTION_DEMO_MODE=1 على الـ API. للإنتاج: VITE_FARQ_ACCESS_TOKEN لمالك info@farq.sa.',
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
          action: 'ستُعاد المحاولة تلقائيًا؛ إن تكرر الرمز راجع سجلات Farq API.',
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
        action: 'اجعل CONSTRUCTION_GMAIL_OWNER_ACTOR_ID مساويًا لـ CONSTRUCTION_DEMO_BUYER_USER_ID على الـ API، أو استخدم VITE_FARQ_ACCESS_TOKEN لمالك info@farq.sa.',
      }
    }
    if (gmail.configured === false) {
      return {
        tone: 'info',
        title: 'تفويض Gmail غير مهيّأ على الـ API (بيانات Google ناقصة).',
        action: 'اضبط على الـ API: CONSTRUCTION_GMAIL_ENABLED، CONSTRUCTION_GMAIL_CLIENT_ID، CLIENT_SECRET، TOKEN_KEY، OWNER_ACTOR_ID. لا علاقة للأمر بـ CONSTRUCTION_DB_URL أو أعلام القراءة/الكتابة.',
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

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-black text-[#0D1F1D]">صندوق الوارد</h1>
          <p className="text-sm text-neutral-500 mt-1">
            أي رد مورد يصل عبر Reply-To أو صندوق info@ (بعد ربط Gmail) — وليس قائمة دعوات الإرسال.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('offers')}
          className="text-xs font-semibold text-[#123F3A] hover:underline"
        >
          العروض والمراسلات ←
        </button>
      </div>

      {loading && (
        <div className="text-center py-16 text-neutral-400 text-sm">جاري تحميل حالة الصندوق…</div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4 mb-6">
          <div className="font-bold text-amber-900 text-sm mb-1">
            {rateLimitSec != null ? 'تجاوزنا حد المحاولات' : 'تعذّر قراءة الصندوق'}
          </div>
          <p className="text-xs text-amber-800 leading-relaxed mb-2">{error}</p>
          {/* The flag checklist below is for a real outage. Printing it for a
              rate limit is what sends the reader chasing settings that are
              already correct. */}
          <p className={`text-[11px] text-amber-700 leading-relaxed ${rateLimitSec != null ? 'hidden' : ''}`}>
            إن ظهر أن الاستقبال معطّل على الـ API، فعّل على Railway (أسماء فقط): `CONSTRUCTION_INBOX_ENABLED`,
            `CONSTRUCTION_CORRESPONDENCE_ENABLED`, `CONSTRUCTION_INBOX_DOMAIN`, `CONSTRUCTION_INBOX_ROUTING_SECRET`,
            `CONSTRUCTION_INBOX_WEBHOOK_SECRET`, `CONSTRUCTION_INBOX_RESEND_API_KEY`. لا نختلق بيانات واردة هنا.
          </p>
        </div>
      )}

      {!loading && status && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
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
        <div className="bg-white border border-neutral-100 rounded-2xl p-4 mb-6">
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

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(
          [
            ['inbound', 'وارد', null as number | null],
            ['needs_reply', 'تحتاج ردًا', needsReplyCount ?? null],
            ['sent', 'مرسَل', sentCount ?? null],
          ] as const
        ).map(([id, label, badge]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5 ${
              tab === id
                ? 'bg-[#123F3A] text-white'
                : 'bg-white border border-neutral-100 text-neutral-500'
            }`}
          >
            {label}
            {badge != null && badge > 0 && (
              <span
                className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${
                  tab === id ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {badge}
              </span>
            )}
          </button>
        ))}
        <span className="text-xs text-neutral-400 ms-auto">
          {tab === 'sent' ? `${total} دعوة مرسلة` : `${total} محادثة`}
        </span>
      </div>

      {!loading && !error && tab === 'sent' && (
        <p className="text-[11px] text-neutral-500 mb-3 leading-relaxed">
          لقطات إرسال الدعوة («دعوة طلب عرض مرسلة») من `dispatch_attempts` — للمتابعة التفصيلية استخدم{' '}
          <button type="button" className="font-bold text-[#123F3A] hover:underline" onClick={() => navigate('offers')}>
            العروض والمراسلات
          </button>
          .
        </p>
      )}

      {!loading && !error && threads.length === 0 && (
        <div className="text-center py-14 bg-white border border-neutral-100 rounded-2xl px-4">
          {tab === 'sent' ? (
            <>
              <p className="text-sm text-neutral-500 mb-1">لا دعوات مرسلة ظاهرة في هذه الصفحة.</p>
              <p className="text-xs text-neutral-400 max-w-md mx-auto leading-relaxed">
                سجلات الإرسال تظهر أيضًا داخل تفاصيل كل RFQ وقائمة العروض والمراسلات.
              </p>
            </>
          ) : tab === 'needs_reply' ? (
            <>
              <p className="text-sm text-neutral-500 mb-1">لا محادثات تحتاج ردًا الآن.</p>
              <p className="text-xs text-neutral-400 max-w-md mx-auto leading-relaxed">
                يظهر العدد هنا فقط عند وصول رسالة واردة من المورد ولم تُعالَج بعد — وليس بعدد الدعوات المرسلة.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-neutral-500 mb-1">لا ردود واردة من الموردين بعد.</p>
              <p className="text-xs text-neutral-400 max-w-md mx-auto leading-relaxed mb-3">
                {!enabled || !receiving
                  ? 'صندوق الوارد غير جاهز على الـ API — راجع أعلام CONSTRUCTION_INBOX_* أعلاه.'
                  : 'هنا تظهر ردود الموردين بعد ربطها بدعوة: عبر Reply-To على replies.farq.sa، أو عبر مزامنة Gmail لصندوق info@farq.sa (بما فيها ردود Zendesk/CC عندما يتطابق مرجع ELE-RFQ-… أو اسم المورد بشكل فريد). دعوات «تم الإرسال» ليست واردًا — راجع تبويب مرسَل أو العروض.'}
              </p>
              {enabled && receiving && !gmail?.connected && !gmailStatusUnread && rateLimitSec == null && (
                <p className="text-xs text-amber-800 max-w-md mx-auto leading-relaxed bg-amber-50 rounded-xl px-3 py-2">
                  لتظهر ردود مثل دهانات الجزيرة التي تصل إلى info@ دون Reply-To الموقّع: أكمل «ربط Gmail» أعلاه بحساب
                  المالك، ثم أعد فتح الوارد لتشغيل المزامنة. المطابقات غير الفريدة تُرفض ولن تُختلق.
                </p>
              )}
            </>
          )}
        </div>
      )}

      <div className="space-y-2">
        {threads.map((thread) => {
          const name = inboxThreadSupplierLabel(thread)
          const rfqId = thread.request_context?.rfq_id
          const outbound = isOutboundInviteSnapshot(thread)
          return (
            <button
              key={String(thread.invite_id || `${thread.supplier_id}-${thread.last_received_at}`)}
              type="button"
              onClick={() => {
                // A conversation opens as a conversation. The RFQ/offer surfaces
                // stay reachable from inside the thread.
                if (thread.invite_id) {
                  setSelectedOfferId(thread.invite_id)
                  openInboxThread(String(thread.invite_id))
                } else if (rfqId) {
                  openRfq(rfqId, 'offers')
                }
              }}
              className="w-full text-right bg-white border border-neutral-100 rounded-2xl px-4 py-3 hover:border-[#123F3A]/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-[#0D1F1D] text-sm truncate">{name}</div>
                  <div className="text-xs text-neutral-500 mt-0.5 truncate">
                    {thread.locked
                      ? 'مغلق (ظرف مختوم)'
                      : outbound
                        ? 'دعوة طلب عرض مرسلة (صادر)'
                        : thread.subject || thread.preview || 'بدون عنوان'}
                  </div>
                  {thread.request_context?.reference && (
                    <div className="text-[10px] text-neutral-400 mt-0.5">
                      <bdi>{thread.request_context.reference}</bdi>
                    </div>
                  )}
                </div>
                <div className="text-left flex-shrink-0">
                  {thread.needs_reply && (
                    <span className="inline-block bg-amber-50 text-amber-800 text-[10px] font-bold rounded-full px-1.5 py-0.5 mb-1">
                      تحتاج ردًا
                    </span>
                  )}
                  {(thread.unread_count || 0) > 0 && (
                    <span className="inline-block bg-[#123F3A] text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 mb-1 ms-1">
                      {thread.unread_count}
                    </span>
                  )}
                  <div className="text-[10px] text-neutral-400">
                    {formatArDate(thread.last_received_at)}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default InboxView
