import { useEffect, useRef, useState } from 'react'
import type { BOQItem } from '../types'
import { XIcon } from '../icons'
import {
  ConstructionApiError,
  countHarajSupplierIds,
  createConstructionRfq,
  getConstructionRfq,
  invitePreferredChannel,
  isHarajSellerExternalKey,
  matchConstructionBoqCatalog,
  prepareConstructionWhatsAppLink,
  sendConstructionRfqInvite,
  fetchConstructionWhatsAppPricing,
  DEFAULT_DELIVERY_CITY,
  type ConstructionInvitation,
} from '../api/constructionClient'
import { resolveRfqSupplierIds } from '../api/constructionSuppliers'
import {
  buildRfqLinesFromItems,
  buildRfqPackagesFromSelection,
  dominantEngineeringDepartment,
} from '../lib/rfqPackages'
import { useProcurement } from '../procurementContext'
import { farqSession } from '../api/farqSession'
import { loadCompanyProfile } from '../lib/companyProfile'
import { getSession } from '../store/session'
import { cleanLineName, parseQty, readQty } from '../lib/sendGuards'

interface SendModalProps {
  items: BOQItem[]
  selectedByItem: Record<number, string[]>
  projectName: string
  searchingItems: number
  onClose: () => void
  onSent: (rfqId: string) => void
  onFailed: () => void
}

type InviteRowStatus = 'pending' | 'sending' | 'sent' | 'wa_ready' | 'failed' | 'skipped'

type InviteProgressRow = {
  inviteId: string
  supplierId: string
  name: string
  channel: 'EMAIL' | 'WHATSAPP' | 'HARAJ'
  status: InviteRowStatus
  detail?: string
  code?: string
  waUrl?: string
  startedAt?: number
  finishedAt?: number
}

type LiveProgress = {
  step: string
  index: number
  total: number
  supplierName: string
  channel: 'EMAIL' | 'WHATSAPP' | 'HARAJ' | 'SETUP'
  batchStartedAt: number
  lastActivityAt: number
  inviteStartedAt: number | null
}

const SEND_INVITE_TIMEOUT_MS = 90_000
/** Overlap RTTs; Resend server already paces ~600ms between provider calls. */
const EMAIL_CONCURRENCY = 3
const WA_CONCURRENCY = 3
const STALL_EMAIL_MS = 15_000
const STALL_WA_MS = 15_000
const STALL_HARAJ_MS = 25_000
const STALL_SETUP_MS = 20_000

const DEPARTMENT_CHOICES: Array<{ key: string; label: string }> = [
  { key: 'CIVIL', label: 'المدني والإنشائي' },
  { key: 'ARCHITECTURAL', label: 'المعماري' },
  { key: 'ELECTRICAL', label: 'الكهربائي' },
  { key: 'MECHANICAL', label: 'الميكانيكي' },
]

function statusLabel(status: InviteRowStatus): string {
  if (status === 'pending') return 'بانتظار'
  if (status === 'sending') return 'جارٍ…'
  if (status === 'sent') return 'أُرسل'
  if (status === 'wa_ready') return 'رابط واتساب جاهز'
  if (status === 'failed') return 'فشل'
  return 'تخطّي'
}

function channelAr(channel: LiveProgress['channel'] | InviteProgressRow['channel']): string {
  if (channel === 'EMAIL') return 'بريد'
  if (channel === 'HARAJ') return 'حراج'
  if (channel === 'WHATSAPP') return 'واتساب'
  return 'تحضير'
}

function formatElapsed(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m <= 0) return `${s}ث`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatClock(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return '—'
  }
}

function stallThreshold(channel: LiveProgress['channel']): number {
  if (channel === 'HARAJ') return STALL_HARAJ_MS
  if (channel === 'WHATSAPP') return STALL_WA_MS
  if (channel === 'EMAIL') return STALL_EMAIL_MS
  return STALL_SETUP_MS
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (err instanceof ConstructionApiError && err.code === 'CONSTRUCTION_REQUEST_TIMEOUT') return true
  if (err instanceof Error && /abort|timeout|مهلة/i.test(err.message)) return true
  return false
}

/** Run async work over items with a fixed concurrency pool. */
async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  shouldStop: () => boolean,
): Promise<void> {
  let next = 0
  const runners = Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, async () => {
    while (next < items.length) {
      if (shouldStop()) return
      const i = next
      next += 1
      await worker(items[i]!, i)
    }
  })
  await Promise.all(runners)
}

export function SendModal({
  items,
  selectedByItem,
  projectName,
  searchingItems,
  onClose,
  onSent,
  onFailed,
}: SendModalProps) {
  const { setSelectedRfqId } = useProcurement()
  // Defaults come from what the buyer saved in الإعدادات, not from constants.
  const [deadline, setDeadline] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + loadCompanyProfile().defaultDeadlineDays)
    return d.toISOString().slice(0, 10)
  })
  const [site, setSite] = useState(() => loadCompanyProfile().defaultDeliveryCity || DEFAULT_DELIVERY_CITY)
  // Suppliers asked when quotes close and whether installation is included.
  const [quoteDeadline, setQuoteDeadline] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 5); return d.toISOString().slice(0, 10)
  })
  const [quoteDeadlineTime, setQuoteDeadlineTime] = useState('17:00')
  const [requestType, setRequestType] = useState<'SUPPLY_ONLY' | 'SUPPLY_AND_INSTALL'>('SUPPLY_ONLY')
  /** Fast path: EMAIL+WA first; defer Haraj (20s pacing) unless user opts in. */
  // Haraj goes out in the same batch by default (owner, 2026-09-18).
  const [fastEmailFirst, setFastEmailFirst] = useState(false)
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<'form' | 'sending' | 'done'>('form')
  const [error, setError] = useState<string | null>(null)
  const [rfqId, setRfqId] = useState<string | null>(null)
  const [rows, setRows] = useState<InviteProgressRow[]>([])
  const [live, setLive] = useState<LiveProgress | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const cancelRef = useRef(false)
  const activeAbortsRef = useRef(new Set<AbortController>())
  const [cancelRequested, setCancelRequested] = useState(false)
  const [deferredHaraj, setDeferredHaraj] = useState<ConstructionInvitation[]>([])
  // Suppliers with no email: the account holder confirms the paid WhatsApp send
  // (count × price) or gets WhatsApp Web links instead.
  const [waConfirm, setWaConfirm] = useState<{ count: number; price: number; category: string } | null>(null)
  const waConfirmResolve = useRef<((paid: boolean) => void) | null>(null)
  const answerWaConfirm = (paid: boolean) => {
    const resolve = waConfirmResolve.current
    waConfirmResolve.current = null
    setWaConfirm(null)
    resolve?.(paid)
  }

  // Work with nothing to buy is never put in front of a supplier.
  const readyItems = items.filter((i) => !i.workOnly && (selectedByItem[i.id] || []).length > 0)
  const selectedSupplierIds = [...new Set(readyItems.flatMap((i) => selectedByItem[i.id] || []))]

  // Everything that must stop a send is decided BEFORE the button, where the
  // buyer can still fix it — not discovered by a supplier afterwards.
  const badQtyItems = readyItems.filter((i) => readQty(String(i.qty)) === null)
  const badNameItems = readyItems.filter((i) => cleanLineName(i.name).replace(/[^\p{L}]/gu, '').length < 2)
  const readIssue = getSession().readIssue
  const [partialAcknowledged, setPartialAcknowledged] = useState(false)
  const guessedDepartment = dominantEngineeringDepartment(readyItems)
  const [department, setDepartment] = useState<string>(guessedDepartment || '')

  // Who gets what, by name, before the first real email leaves.
  const recipients = (() => {
    const byId = new Map<string, { name: string; channel: string; lines: number }>()
    for (const item of readyItems) {
      for (const id of selectedByItem[item.id] || []) {
        const known = item.suppliers.find((s) => s.id === id)
        const entry = byId.get(id) || { name: known?.name || id, channel: known?.channel || '', lines: 0 }
        entry.lines += 1
        byId.set(id, entry)
      }
    }
    return [...byId.values()].sort((a, b) => b.lines - a.lines)
  })()

  const sendBlockers: string[] = []
  if (readIssue?.kind === 'invalid') sendBlockers.push(`قراءة هذه الكراسة غير صالحة للإرسال: ${readIssue.detail}`)
  if (badQtyItems.length)
    sendBlockers.push(
      `كمية غير مقروءة في ${badQtyItems.length} بندًا: ${badQtyItems.slice(0, 3).map((i) => `«${cleanLineName(i.name).slice(0, 40) || i.id}»`).join('، ')}${badQtyItems.length > 3 ? '…' : ''}. ألغِ اختيار مورديها أو صحّح الكراسة.`,
    )
  if (badNameItems.length) sendBlockers.push(`اسم غير مقروء في ${badNameItems.length} بندًا (رقم ${badNameItems.slice(0, 5).map((i) => i.id).join('، ')}).`)
  if (!department) sendBlockers.push('اختر القسم الهندسي لهذا الطلب: لم نستطع تحديده من البنود.')
  if (!quoteDeadline) sendBlockers.push('حدّد آخر موعد لاستلام العروض.')
  else if (deadline && quoteDeadline >= deadline) sendBlockers.push('آخر موعد لاستلام العروض يجب أن يسبق موعد التوريد.')
  if (readIssue?.kind === 'partial' && !partialAcknowledged) sendBlockers.push('أكّد أنك تعلم أن القراءة ناقصة.')
  const harajSelected = countHarajSupplierIds(selectedSupplierIds)

  useEffect(() => {
    if (phase !== 'sending') return
    const id = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [phase])

  const touchActivity = (patch: Partial<LiveProgress> & Pick<LiveProgress, 'step'>) => {
    setLive((prev) => {
      const base: LiveProgress = prev || {
        step: patch.step,
        index: 0,
        total: 0,
        supplierName: '—',
        channel: 'SETUP',
        batchStartedAt: Date.now(),
        lastActivityAt: Date.now(),
        inviteStartedAt: null,
      }
      return { ...base, ...patch, lastActivityAt: Date.now() }
    })
    setNowTick(Date.now())
  }

  /** Each in-flight invite gets its own controller so parallel email isn't aborted by siblings. */
  const beginAbortable = () => {
    const controller = new AbortController()
    activeAbortsRef.current.add(controller)
    const release = () => activeAbortsRef.current.delete(controller)
    controller.signal.addEventListener('abort', release, { once: true })
    return controller
  }

  const abortAllInFlight = () => {
    for (const controller of activeAbortsRef.current) {
      controller.abort()
    }
    activeAbortsRef.current.clear()
  }

  const updateRow = (inviteId: string, patch: Partial<InviteProgressRow>) => {
    setRows((prev) => prev.map((row) => (row.inviteId === inviteId ? { ...row, ...patch } : row)))
  }

  const requestCancel = () => {
    cancelRef.current = true
    setCancelRequested(true)
    if (waConfirmResolve.current) answerWaConfirm(false)
    abortAllInFlight()
    touchActivity({ step: 'إلغاء… إيقاف الطلبات الجارية فورًا' })
  }

  const requestClose = () => {
    if (busy) {
      requestCancel()
      return
    }
    if (phase === 'sending') return
    onClose()
  }

  const sendOneEmail = async (
    createdId: string,
    invite: ConstructionInvitation,
    index: number,
    total: number,
  ): Promise<'sent' | 'failed' | 'cancelled'> => {
    if (cancelRef.current) return 'cancelled'
    const name = String(invite.supplier?.name_ar || invite.supplier?.name_en || 'مورد')
    const startedAt = Date.now()
    touchActivity({
      step: `بريد ${index + 1}/${total}`,
      index: index + 1,
      total,
      supplierName: name,
      channel: 'EMAIL',
      inviteStartedAt: startedAt,
    })
    updateRow(invite.id, {
      status: 'sending',
      detail: 'إرسال بريد…',
      startedAt,
      finishedAt: undefined,
    })
    const ctrl = beginAbortable()
    try {
      const updated = await sendConstructionRfqInvite(createdId, invite.id, {
        sendConsent: false,
        timeoutMs: SEND_INVITE_TIMEOUT_MS,
        signal: ctrl.signal,
      })
      activeAbortsRef.current.delete(ctrl)
      // The API answers 200 whatever the provider did; the invite in the reply
      // carries the truth. «أُرسل» only when the email was actually accepted.
      const row = (updated?.invitations || []).find((r) => r.id === invite.id)
      const email = (row?.dispatch_attempts || []).find((a) => a.channel === 'EMAIL')
      const delivered = email ? email.status === 'SENT' : row?.delivery_status === 'SENT'
      if (!delivered) {
        const why = email?.failure_code || row?.delivery_status || 'NOT_SENT'
        updateRow(invite.id, {
          status: 'failed',
          detail: why === 'SKIPPED_NO_RECIPIENT' ? 'لا بريد لهذا المورد' : `لم يُرسل البريد · ${why}`,
          code: why,
          finishedAt: Date.now(),
        })
        return 'failed'
      }
      updateRow(invite.id, {
        status: 'sent',
        detail: 'بريد · قبله مزود البريد',
        code: 'SENT',
        finishedAt: Date.now(),
      })
      touchActivity({
        step: `بريد تم ${index + 1}/${total}`,
        index: index + 1,
        total,
        supplierName: name,
        channel: 'EMAIL',
        inviteStartedAt: startedAt,
      })
      return 'sent'
    } catch (err) {
      activeAbortsRef.current.delete(ctrl)
      if (cancelRef.current || isAbortError(err)) {
        updateRow(invite.id, {
          status: 'skipped',
          detail: 'أُلغي / مهلة',
          code:
            err instanceof ConstructionApiError && err.code === 'CONSTRUCTION_REQUEST_TIMEOUT'
              ? 'TIMEOUT'
              : 'CANCELLED',
          finishedAt: Date.now(),
        })
        return 'cancelled'
      }
      updateRow(invite.id, {
        status: 'failed',
        detail: err instanceof Error ? err.message : 'فشل البريد',
        code: err instanceof ConstructionApiError ? err.code : 'SEND_FAILED',
        finishedAt: Date.now(),
      })
      return 'failed'
    }
  }

  const prepareOneWa = async (
    createdId: string,
    invite: ConstructionInvitation,
    index: number,
    total: number,
  ): Promise<'wa_ready' | 'sent' | 'failed' | 'cancelled'> => {
    if (cancelRef.current) return 'cancelled'
    const name = String(invite.supplier?.name_ar || invite.supplier?.name_en || 'مورد')
    const startedAt = Date.now()
    touchActivity({
      step: `واتساب ${index + 1}/${total}`,
      index: index + 1,
      total,
      supplierName: name,
      channel: 'WHATSAPP',
      inviteStartedAt: startedAt,
    })
    updateRow(invite.id, {
      status: 'sending',
      detail: 'تجهيز رابط واتساب…',
      startedAt,
    })
    const ctrl = beginAbortable()
    try {
      const link = await prepareConstructionWhatsAppLink(createdId, invite.id, {
        signal: ctrl.signal,
        timeoutMs: SEND_INVITE_TIMEOUT_MS,
      })
      activeAbortsRef.current.delete(ctrl)
      if (link.url) {
        updateRow(invite.id, {
          status: 'wa_ready',
          waUrl: link.url,
          detail: 'رابط جاهز — افتحه بعد انتهاء الدفعة',
          code: 'MANUAL_WHATSAPP',
          finishedAt: Date.now(),
        })
        return 'wa_ready'
      }
      updateRow(invite.id, {
        status: 'failed',
        detail: 'تعذّر تجهيز الرابط',
        code: 'WA_LINK_EMPTY',
        finishedAt: Date.now(),
      })
      return 'failed'
    } catch (err) {
      activeAbortsRef.current.delete(ctrl)
      const code = err instanceof ConstructionApiError ? err.code : ''
      if (cancelRef.current || isAbortError(err)) {
        updateRow(invite.id, {
          status: 'skipped',
          detail: 'أُلغي',
          code: 'CANCELLED',
          finishedAt: Date.now(),
        })
        return 'cancelled'
      }
      if (code === 'CONSTRUCTION_EMAIL_PREFERRED') {
        const emailResult = await sendOneEmail(createdId, invite, index, total)
        return emailResult === 'sent' ? 'sent' : emailResult
      }
      updateRow(invite.id, {
        status: 'failed',
        detail: err instanceof Error ? err.message : 'فشل واتساب',
        code: code || 'WA_FAILED',
        finishedAt: Date.now(),
      })
      return 'failed'
    }
  }

  const sendOneWaPaid = async (
    createdId: string,
    invite: ConstructionInvitation,
    index: number,
    total: number,
  ): Promise<'wa_ready' | 'sent' | 'failed' | 'cancelled'> => {
    if (cancelRef.current) return 'cancelled'
    const name = String(invite.supplier?.name_ar || invite.supplier?.name_en || 'مورد')
    const startedAt = Date.now()
    touchActivity({ step: `واتساب ${index + 1}/${total}`, index: index + 1, total, supplierName: name, channel: 'WHATSAPP', inviteStartedAt: startedAt })
    updateRow(invite.id, { status: 'sending', detail: 'إرسال واتساب من رقم فرق…', startedAt })
    const ctrl = beginAbortable()
    try {
      const updated = await sendConstructionRfqInvite(createdId, invite.id, {
        sendConsent: false,
        whatsappPaid: true,
        timeoutMs: SEND_INVITE_TIMEOUT_MS,
        signal: ctrl.signal,
      })
      activeAbortsRef.current.delete(ctrl)
      const row = (updated?.invitations || []).find((r) => r.id === invite.id)
      const wa = (row?.dispatch_attempts || []).find((a) => a.channel === 'WHATSAPP')
      if (wa?.status === 'SENT') {
        updateRow(invite.id, { status: 'sent', detail: 'واتساب · أُرسل من رقم فرق', code: 'SENT', finishedAt: Date.now() })
        return 'sent'
      }
      // Not sent (cap reached, number refused…): fall back to a WhatsApp Web link.
      return prepareOneWa(createdId, invite, index, total)
    } catch (err) {
      activeAbortsRef.current.delete(ctrl)
      if (cancelRef.current || isAbortError(err)) {
        updateRow(invite.id, { status: 'skipped', detail: 'أُلغي', code: 'CANCELLED', finishedAt: Date.now() })
        return 'cancelled'
      }
      return prepareOneWa(createdId, invite, index, total)
    }
  }

  const sendOneHaraj = async (
    createdId: string,
    invite: ConstructionInvitation,
    index: number,
    total: number,
  ): Promise<'sent' | 'failed' | 'cancelled'> => {
    if (cancelRef.current) return 'cancelled'
    const name = String(invite.supplier?.name_ar || invite.supplier?.name_en || 'مورد')
    const supplierId = String(invite.supplier?.id || invite.supplier_id || '')
    const startedAt = Date.now()
    touchActivity({
      step: `حراج ${index + 1}/${total} (قد ينتظر ≥20ث)`,
      index: index + 1,
      total,
      supplierName: name,
      channel: 'HARAJ',
      inviteStartedAt: startedAt,
    })
    updateRow(invite.id, {
      status: 'sending',
      detail: 'حراج — تباعد ≥20ث بين الرسائل أمر طبيعي',
      startedAt,
    })
    const ctrl = beginAbortable()
    try {
      await sendConstructionRfqInvite(createdId, invite.id, {
        sendConsent: false,
        harajLimit: isHarajSellerExternalKey(supplierId) ? 1 : undefined,
        timeoutMs: SEND_INVITE_TIMEOUT_MS,
        signal: ctrl.signal,
      })
      activeAbortsRef.current.delete(ctrl)
      updateRow(invite.id, {
        status: 'sent',
        detail: 'حراج · قبول المزوّد',
        code: 'SENT',
        finishedAt: Date.now(),
      })
      return 'sent'
    } catch (err) {
      activeAbortsRef.current.delete(ctrl)
      if (cancelRef.current || isAbortError(err)) {
        const timedOut =
          err instanceof ConstructionApiError && err.code === 'CONSTRUCTION_REQUEST_TIMEOUT'
        updateRow(invite.id, {
          status: timedOut && !cancelRef.current ? 'failed' : 'skipped',
          detail: timedOut ? 'انتهت المهلة (90ث)' : 'أُلغي',
          code: timedOut ? 'TIMEOUT' : 'CANCELLED',
          finishedAt: Date.now(),
        })
        return timedOut && !cancelRef.current ? 'failed' : 'cancelled'
      }
      updateRow(invite.id, {
        status: 'failed',
        detail: err instanceof Error ? err.message : 'فشل حراج',
        code: err instanceof ConstructionApiError ? err.code : 'SEND_FAILED',
        finishedAt: Date.now(),
      })
      return 'failed'
    }
  }

  const runDispatchPipeline = async (
    createdId: string,
    invites: ConstructionInvitation[],
    opts: { sendHaraj: boolean },
  ) => {
    const emailInvites = invites.filter((i) => invitePreferredChannel(i) === 'EMAIL')
    const waInvites = invites.filter((i) => invitePreferredChannel(i) === 'WHATSAPP')
    const harajInvites = invites.filter((i) => invitePreferredChannel(i) === 'HARAJ')

    let sent = 0
    let failed = 0
    let waPrepared = 0
    let cancelled = false

    const totalWork =
      emailInvites.length +
      waInvites.length +
      (opts.sendHaraj ? harajInvites.length : 0)

    touchActivity({
      step: `مسار سريع: بريد (${emailInvites.length}) ← واتساب (${waInvites.length}) ← حراج (${opts.sendHaraj ? harajInvites.length : 0} ${opts.sendHaraj ? '' : 'مؤجّل'})`,
      index: 0,
      total: Math.max(totalWork, invites.length),
      channel: 'SETUP',
      supplierName: '—',
      inviteStartedAt: null,
    })

    // 1) EMAIL in parallel (server still respects ~600ms Resend pacing).
    if (emailInvites.length) {
      await mapPool(
        emailInvites,
        EMAIL_CONCURRENCY,
        async (invite, index) => {
          if (cancelRef.current) {
            cancelled = true
            return
          }
          const result = await sendOneEmail(createdId, invite, index, emailInvites.length)
          if (result === 'sent') sent += 1
          else if (result === 'failed') failed += 1
          else cancelled = true
        },
        () => cancelRef.current,
      )
    }

    if (cancelRef.current) {
      for (const invite of [...waInvites, ...harajInvites]) {
        updateRow(invite.id, {
          status: 'skipped',
          detail: 'أُلغي قبل الإرسال',
          code: 'CANCELLED',
        })
      }
      return { sent, failed, waPrepared, cancelled: true, deferredHaraj: [] as ConstructionInvitation[] }
    }

    // 2) WhatsApp. Paid send from Farq's number only after the account holder
    // confirms the total; otherwise WhatsApp Web links (no window.open).
    let waPaid = false
    if (waInvites.length) {
      const pricing = await fetchConstructionWhatsAppPricing()
      if (pricing.enabled && pricing.price_sar && !cancelRef.current) {
        touchActivity({ step: `بانتظار موافقتك على واتساب (${waInvites.length})`, index: 0, total: waInvites.length, channel: 'WHATSAPP', supplierName: '—', inviteStartedAt: null })
        waPaid = await new Promise<boolean>((resolve) => {
          waConfirmResolve.current = resolve
          setWaConfirm({ count: waInvites.length, price: pricing.price_sar!, category: pricing.category || '' })
        })
      }
    }
    if (waInvites.length && !cancelRef.current) {
      await mapPool(
        waInvites,
        WA_CONCURRENCY,
        async (invite, index) => {
          if (cancelRef.current) {
            cancelled = true
            return
          }
          const result = waPaid
            ? await sendOneWaPaid(createdId, invite, index, waInvites.length)
            : await prepareOneWa(createdId, invite, index, waInvites.length)
          if (result === 'wa_ready') waPrepared += 1
          else if (result === 'sent') sent += 1
          else if (result === 'failed') failed += 1
          else cancelled = true
        },
        () => cancelRef.current,
      )
    }

    if (cancelRef.current) {
      for (const invite of harajInvites) {
        updateRow(invite.id, { status: 'skipped', detail: 'أُلغي', code: 'CANCELLED' })
      }
      return { sent, failed, waPrepared, cancelled: true, deferredHaraj: [] }
    }

    // 3) Haraj last (sequential — server 20s pacing) or defer in fast mode.
    if (!opts.sendHaraj && harajInvites.length) {
      for (const invite of harajInvites) {
        updateRow(invite.id, {
          status: 'skipped',
          detail: 'مؤجّل — وضع الإرسال السريع (بريد أولًا). يمكنك إرسال حراج لاحقًا.',
          code: 'DEFERRED_FAST_MODE',
        })
      }
      setDeferredHaraj(harajInvites)
      return { sent, failed, waPrepared, cancelled, deferredHaraj: harajInvites }
    }

    for (let i = 0; i < harajInvites.length; i += 1) {
      if (cancelRef.current) {
        cancelled = true
        for (let j = i; j < harajInvites.length; j += 1) {
          updateRow(harajInvites[j]!.id, {
            status: 'skipped',
            detail: 'أُلغي',
            code: 'CANCELLED',
          })
        }
        break
      }
      const result = await sendOneHaraj(createdId, harajInvites[i]!, i, harajInvites.length)
      if (result === 'sent') sent += 1
      else if (result === 'failed') failed += 1
      else {
        cancelled = true
        for (let j = i + 1; j < harajInvites.length; j += 1) {
          updateRow(harajInvites[j]!.id, {
            status: 'skipped',
            detail: 'أُلغي',
            code: 'CANCELLED',
          })
        }
        break
      }
    }

    return { sent, failed, waPrepared, cancelled, deferredHaraj: [] as ConstructionInvitation[] }
  }

  const handleSendHarajDeferred = async () => {
    if (!rfqId || !deferredHaraj.length || busy) return
    cancelRef.current = false
    setCancelRequested(false)
    setBusy(true)
    setPhase('sending')
    setError(null)
    const batchStartedAt = Date.now()
    setLive({
      step: 'إرسال حراج المؤجّل…',
      index: 0,
      total: deferredHaraj.length,
      supplierName: '—',
      channel: 'HARAJ',
      batchStartedAt,
      lastActivityAt: batchStartedAt,
      inviteStartedAt: null,
    })
    for (const invite of deferredHaraj) {
      updateRow(invite.id, { status: 'pending', detail: 'في طابور حراج…', code: undefined })
    }
    try {
      const result = await runDispatchPipeline(rfqId, deferredHaraj, { sendHaraj: true })
      setDeferredHaraj([])
      setPhase('done')
      if (result.cancelled) {
        setError(`توقّف إرسال حراج. أُرسل ${result.sent} · فشل ${result.failed}.`)
      } else if (result.failed > 0) {
        setError(`حراج جزئي: أُرسل ${result.sent} · فشل ${result.failed}.`)
      } else {
        touchActivity({
          step: 'اكتمل حراج المؤجّل',
          channel: 'HARAJ',
          index: deferredHaraj.length,
          total: deferredHaraj.length,
          supplierName: '—',
          inviteStartedAt: null,
        })
      }
    } finally {
      setBusy(false)
      setCancelRequested(false)
      activeAbortsRef.current.clear()
    }
  }

  const handleSend = async () => {
    cancelRef.current = false
    setCancelRequested(false)
    setBusy(true)
    setPhase('sending')
    setError(null)
    setRows([])
    setRfqId(null)
    setDeferredHaraj([])
    const batchStartedAt = Date.now()
    setLive({
      step: 'مطابقة البنود…',
      index: 0,
      total: 0,
      supplierName: '—',
      channel: 'SETUP',
      batchStartedAt,
      lastActivityAt: batchStartedAt,
      inviteStartedAt: null,
    })

    try {
      if (sendBlockers.length) throw new Error(sendBlockers[0])
      touchActivity({ step: 'مطابقة البنود مع كتالوج Farq…', channel: 'SETUP', index: 0, total: 0 })
      // Only the lines that still have no spec id are worth asking about.
      // `buildRfqLinesFromItems` reads `item.farqSpecId` first and falls back to
      // `specIdForLine` only when it is empty, so re-asking about a line the
      // upload already resolved cannot change the RFQ — it just pays for a
      // second multi-megabyte answer on the screen the buyer is waiting on.
      // What remains is what the fallback is actually for: an upload whose match
      // call failed, and lines past the upload's 80-line match cap.
      const needSpecId = readyItems.filter((item) => !item.farqSpecId)
      const matchPayload = {
        lines: needSpecId.map((item) => ({
          line_key: item.lineKey || `line-${item.id}`,
          name_ar: item.name,
          quantity: parseQty(item.qty),
          uom: item.unit || undefined,
          // The tender's technical column, which the upload sends and this call
          // used to drop even though the item carries it. Without it the fallback
          // answers a poorer question than the upload did and can name a
          // different material: on a hot/cold water line it returned pvc-pipe
          // where the upload, reading the spec, returned ppr-pipes — a pool of
          // suppliers that cannot quote the item. Sending it makes both calls ask
          // the same thing, so they cannot disagree.
          spec: item.spec,
        })),
      }
      const matched = needSpecId.length
        ? await matchConstructionBoqCatalog(matchPayload).catch(() => null)
        : null
      touchActivity({ step: 'اكتملت المطابقة — تجهيز البنود…', channel: 'SETUP' })
      const matchRows = matched?.rows || matched?.matches || []
      const byKey = new Map(matchRows.map((row) => [row.line_key, row]))

      // A line is sent under ITS OWN name whether or not the catalog matched it.
      const lines = buildRfqLinesFromItems(
        // The name a supplier reads is the booklet's own, minus glyphs the PDF
        // could not map (U+0000 and friends).
        readyItems.map((item) => ({ ...item, name: cleanLineName(item.name) })),
        {
          specIdForLine: (key) => byKey.get(key)?.farq_spec_id,
          uomForLine: (key) => byKey.get(key)?.uom,
          parseQty,
        },
      )

      if (!lines.length) {
        throw new Error('لا توجد بنود جاهزة للإرسال. اختر بنداً واحداً على الأقل.')
      }

      touchActivity({ step: 'تصفية الموردين القابلين للتواصل…', channel: 'SETUP' })
      const rfqSupplierIds = await resolveRfqSupplierIds(selectedSupplierIds)
      if (rfqSupplierIds.length < 2) {
        throw new Error(
          rfqSupplierIds.length === 0
            ? 'لا يوجد موردون قابلون للتواصل ضمن الاختيار.'
            : 'يلزم اختيار موردين اثنين على الأقل قابلين للتواصل.',
        )
      }

      // Per-supplier packages: each invite receives only lines the buyer picked
      // that supplier for — never the full booklet (Jazeera Paints leak).
      const contactable = new Set(rfqSupplierIds)
      const packageItems = readyItems.filter((item) => {
        const key = item.lineKey || `line-${item.id}`
        return lines.some((line) => line.line_key === key)
      })
      const selectedForPackages: Record<number, string[]> = {}
      for (const item of packageItems) {
        selectedForPackages[item.id] = (selectedByItem[item.id] || []).filter((id) =>
          contactable.has(String(id)),
        )
      }
      const { packages: draftPackages } = buildRfqPackagesFromSelection({
        items: packageItems,
        selectedByItem: selectedForPackages,
        fallbackDepartment: department,
      })
      const packages = draftPackages.filter((entry) => entry.selected_supplier_ids.length > 0)
      if (!packages.length) {
        throw new Error(
          'لا توجد بنود مربوطة بموردين قابلين للتواصل. اختر موردين لكل بند قبل الإرسال.',
        )
      }
      const packageLineKeys = new Set(packages.flatMap((entry) => entry.line_keys))
      const scopedLines = lines.filter((line) => packageLineKeys.has(String(line.line_key)))
      const packageSupplierIds = [
        ...new Set(packages.flatMap((entry) => entry.selected_supplier_ids)),
      ]
      if (packageSupplierIds.length < 2) {
        throw new Error('يلزم أن يظهر موردان على الأقل ضمن حزم البنود المختارة.')
      }
      if (!scopedLines.length) {
        throw new Error('تعذر بناء نطاق البنود للموردين المختارين.')
      }

      const harajLimit = countHarajSupplierIds(packageSupplierIds)
      touchActivity({
        step: `إنشاء الطلب (${packageSupplierIds.length} موردًا)…`,
        channel: 'SETUP',
        total: packageSupplierIds.length,
      })

      const company = loadCompanyProfile()
      const buyerUser = farqSession.getUser()
      const createBody: Record<string, unknown> = {
        manual_send: true,
        send_consent: false,
        engineering_department: department,
        selected_supplier_ids: packageSupplierIds,
        delivery: {
          city: site,
          site_address: projectName.trim() ? `${projectName.trim()} — ${site}` : site,
          required_date: deadline,
          unloading_requirement: 'SUPPLIER_UNLOAD',
          delivery_required: true,
        },
        commercial_terms: { currency: 'SAR', payment_terms: 'BANK_TRANSFER' },
        quote_deadline: quoteDeadline,
        quote_deadline_time: quoteDeadlineTime,
        request_type: requestType,
        // The person sending is the person signed in. This block used to carry
        // «عميل تجريبي» on every real request.
        buyer: {
          company_name: company.name,
          contact_name: buyerUser?.displayName?.trim() || buyerUser?.email?.trim() || company.name,
          email: buyerUser?.email?.trim() || company.email,
          phone: company.phone,
          city: company.city,
          ...(company.legalName ? { legal_name: company.legalName } : {}),
          ...(company.crNumber ? { cr_number: company.crNumber } : {}),
          ...(company.vatNumber ? { vat_number: company.vatNumber } : {}),
          ...(company.nationalAddress ? { national_address: company.nationalAddress } : {}),
        },
        lines: scopedLines,
        packages,
      }
      if (harajLimit > 0) createBody.haraj_limit = harajLimit

      const createCtrl = beginAbortable()
      const created = await createConstructionRfq(createBody, {
        signal: createCtrl.signal,
        timeoutMs: SEND_INVITE_TIMEOUT_MS,
      })
      setRfqId(created.id)
      setSelectedRfqId(created.id)
      touchActivity({ step: 'جلب الدعوات…', channel: 'SETUP' })

      const detail = await getConstructionRfq(created.id)
      const invites = detail.invitations || []
      if (!invites.length) {
        throw new Error('أُنشئ الطلب لكن بلا دعوات.')
      }

      setRows(
        invites.map((invite) => ({
          inviteId: invite.id,
          supplierId: String(invite.supplier?.id || invite.supplier_id || ''),
          name: String(invite.supplier?.name_ar || invite.supplier?.name_en || 'مورد'),
          channel: invitePreferredChannel(invite),
          status: 'pending' as const,
        })),
      )

      const result = await runDispatchPipeline(created.id, invites, {
        sendHaraj: !fastEmailFirst,
      })

      setPhase('done')
      setLive((prev) =>
        prev
          ? {
              ...prev,
              step: result.cancelled ? 'توقّف الإرسال' : 'اكتملت الدفعة',
              lastActivityAt: Date.now(),
              inviteStartedAt: null,
            }
          : prev,
      )

      if (result.cancelled) {
        setError(
          `توقّف الإرسال. أُرسل ${result.sent} · واتساب ${result.waPrepared} · فشل ${result.failed}.`,
        )
        return
      }
      if (invites.length > 0 && result.sent === 0 && result.waPrepared === 0) {
        setError('تعذّر إرسال أي دعوة. راجع أكواد الفشل في الجدول. النافذة تبقى مفتوحة.')
        return
      }
      if (result.failed > 0 || result.deferredHaraj.length > 0) {
        setError(
          [
            result.failed > 0
              ? `جزئي: أُرسل ${result.sent} · واتساب ${result.waPrepared} · فشل ${result.failed}.`
              : `تم البريد/واتساب: أُرسل ${result.sent} · واتساب ${result.waPrepared}.`,
            result.deferredHaraj.length
              ? `${result.deferredHaraj.length} حراج مؤجّل — اضغط «إرسال حراج الآن» أو تابع للمراسلات.`
              : '',
          ]
            .filter(Boolean)
            .join(' '),
        )
        return
      }
      if (result.waPrepared > 0) {
        touchActivity({
          step: `روابط واتساب جاهزة (${result.waPrepared}) — افتحها ثم تابع`,
          channel: 'WHATSAPP',
          index: invites.length,
          total: invites.length,
          supplierName: '—',
          inviteStartedAt: null,
        })
        return
      }
      onSent(created.id)
    } catch (err) {
      setPhase('done')
      if (isAbortError(err) || cancelRef.current) {
        setError('أُلغي الطلب أو انتهت المهلة أثناء التحضير.')
      } else if (err instanceof ConstructionApiError && err.code === 'CONSTRUCTION_SUPPLIER_INVALID') {
        setError('مورد أو أكثر غير صالح للإرسال.')
      } else if (
        err instanceof ConstructionApiError &&
        err.code === 'CONSTRUCTION_HARAJ_LIMIT_REQUIRED'
      ) {
        setError('يلزم تمرير haraj_limit عند اختيار بائعي حراج.')
      } else {
        setError(err instanceof Error ? err.message : 'فشل إنشاء الطلب')
      }
      setLive((prev) =>
        prev
          ? { ...prev, step: 'توقّف بسبب خطأ', lastActivityAt: Date.now(), inviteStartedAt: null }
          : prev,
      )
    } finally {
      setBusy(false)
      setCancelRequested(false)
      activeAbortsRef.current.clear()
    }
  }

  const sentCount = rows.filter((r) => r.status === 'sent').length
  const failedCount = rows.filter((r) => r.status === 'failed').length
  const waCount = rows.filter((r) => r.status === 'wa_ready').length
  const deferredCount = rows.filter((r) => r.code === 'DEFERRED_FAST_MODE').length
  const canContinue = Boolean(rfqId) && phase === 'done' && (sentCount > 0 || waCount > 0)

  const idleMs = live ? nowTick - live.lastActivityAt : 0
  const inviteMs = live?.inviteStartedAt != null ? nowTick - live.inviteStartedAt : null
  const batchMs = live ? nowTick - live.batchStartedAt : 0
  const stallMs = live ? stallThreshold(live.channel) : STALL_SETUP_MS
  const isStalled = phase === 'sending' && live != null && idleMs >= stallMs

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={requestClose} />
      <div className="relative w-full sm:max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl animate-fade-up mx-auto">
        <div className="px-6 py-5 border-b border-neutral-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-xl font-black text-[#0D1F1D]">
            {phase === 'sending'
              ? live && live.total > 0
                ? `جارٍ الإرسال ${live.index}/${live.total}`
                : 'جارٍ الإرسال…'
              : phase === 'done'
                ? 'نتيجة الإرسال'
                : 'جاهز للإرسال'}
          </h2>
          <button type="button" onClick={requestClose} className="p-1 text-neutral-400 hover:text-neutral-600">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          {phase === 'form' && (
            <>
              <div className="bg-[#f0faf7] rounded-2xl p-4 mb-5">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-2xl font-black text-[#123F3A]">{readyItems.length}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">بندًا</div>
                  </div>
                  <div>
                    <div className="text-2xl font-black text-[#123F3A]">{selectedSupplierIds.length}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">موردًا</div>
                  </div>
                  <div>
                    <div className="text-2xl font-black text-amber-600">{searchingItems}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">قيد البحث</div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 mb-4">
                <div>
                  <label className="text-xs text-neutral-500 mb-1 block">موقع التسليم</label>
                  <input
                    value={site}
                    onChange={(e) => setSite(e.target.value)}
                    className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#123F3A]"
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-500 mb-1 block">موعد الاستلام</label>
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#123F3A]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs text-neutral-500 mb-1 block">آخر موعد لاستلام العروض</label>
                  <input type="date" value={quoteDeadline} onChange={(e) => setQuoteDeadline(e.target.value)} className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#123F3A]" />
                </div>
                <div>
                  <label className="text-xs text-neutral-500 mb-1 block">الساعة</label>
                  <input type="time" value={quoteDeadlineTime} onChange={(e) => setQuoteDeadlineTime(e.target.value)} className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#123F3A]" />
                </div>
              </div>
              <div className="mb-4">
                <label className="text-xs text-neutral-500 mb-1 block">نوع الطلب</label>
                <select value={requestType} onChange={(e) => setRequestType(e.target.value as 'SUPPLY_ONLY' | 'SUPPLY_AND_INSTALL')} className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#123F3A] bg-white">
                  <option value="SUPPLY_ONLY">توريد مواد فقط — دون تركيب</option>
                  <option value="SUPPLY_AND_INSTALL">توريد وتركيب</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="text-xs text-neutral-500 mb-1 block">القسم الهندسي (يظهر في رقم الطلب عند المورد)</label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#123F3A] bg-white"
                >
                  {!guessedDepartment && <option value="">اختر القسم…</option>}
                  {DEPARTMENT_CHOICES.map((d) => (
                    <option key={d.key} value={d.key}>{d.label}</option>
                  ))}
                </select>
              </div>

              <div className="mb-4 rounded-xl border border-neutral-200">
                <div className="px-3 py-2 text-xs font-bold text-[#0D1F1D] border-b border-neutral-100">
                  سيصل الطلب إلى هؤلاء ({recipients.length}) — كل مورد يرى بنوده فقط
                </div>
                <ul className="max-h-40 overflow-y-auto divide-y divide-neutral-100">
                  {recipients.map((r, i) => (
                    <li key={`${r.name}-${i}`} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                      <span className="truncate text-[#0D1F1D]">{r.name}</span>
                      <span className="flex-shrink-0 text-neutral-500">{r.lines} بندًا{r.channel ? ` · ${r.channel}` : ''}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {readIssue?.kind === 'partial' && (
                <label className="flex items-start gap-3 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1 accent-[#123F3A]"
                    checked={partialAcknowledged}
                    onChange={(e) => setPartialAcknowledged(e.target.checked)}
                  />
                  <span className="text-xs text-amber-900 leading-relaxed">
                    قراءة ناقصة: {readIssue.detail} أعلم ذلك وأرسل المقروء فقط.
                  </span>
                </label>
              )}

              {sendBlockers.filter((b) => b !== 'أكّد أنك تعلم أن القراءة ناقصة.').length > 0 && (
                <div className="mb-4 rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700 leading-relaxed space-y-1">
                  {sendBlockers.filter((b) => b !== 'أكّد أنك تعلم أن القراءة ناقصة.').map((b) => (
                    <div key={b}>{b}</div>
                  ))}
                </div>
              )}

              <label className="flex items-start gap-3 mb-4 rounded-xl border border-neutral-100 bg-white px-3 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 accent-[#123F3A]"
                  checked={fastEmailFirst}
                  onChange={(e) => setFastEmailFirst(e.target.checked)}
                />
                <span>
                  <span className="block text-sm font-bold text-[#0D1F1D]">إرسال سريع: بريد أولًا</span>
                  <span className="block text-[11px] text-neutral-500 leading-relaxed mt-0.5">
                    يرسل البريد وواتساب ويؤجّل حراج لزر منفصل. بدون هذا الخيار يُرسل حراج تلقائيًا في نفس الدفعة بعدهما.
                  </span>
                </span>
              </label>

              {harajSelected > 0 && (
                <p className="text-xs text-[#123F3A] mb-4 leading-relaxed bg-[#f0faf7] rounded-xl px-3 py-2">
                  {harajSelected} بائع حراج —{' '}
                  {fastEmailFirst
                    ? 'سيُؤجَّلون لزر منفصل بعد البريد.'
                    : `يُرسلون تلقائيًا بعد البريد وواتساب، رسالة كل 20 ثانية (قرابة ${Math.max(1, Math.ceil((harajSelected * 20) / 60))} دقيقة). أبقِ الصفحة مفتوحة حتى ينتهي.`}
                </p>
              )}
            </>
          )}

          {phase === 'sending' && waConfirm && (
            <div className="mb-4 rounded-2xl border-2 border-[#123F3A]/30 bg-[#f0faf7] p-4" role="alertdialog" aria-live="assertive">
              <p className="text-sm font-bold text-[#0D1F1D] mb-1">
                {waConfirm.count} {waConfirm.count === 1 ? 'مورد ليس لديه' : 'موردين ليس لديهم'} بريد إلكتروني
              </p>
              <p className="text-xs text-neutral-700 leading-relaxed mb-3">
                نرسل لهم طلب التسعير على واتساب من رقم فرق مع رابط تقديم العرض. تكلفة الرسالة{' '}
                <span className="font-bold">{waConfirm.price.toFixed(2)} ريال</span>، والإجمالي{' '}
                <span className="font-bold text-[#123F3A]">{(waConfirm.count * waConfirm.price).toFixed(2)} ريال</span>{' '}
                ({waConfirm.count} × {waConfirm.price.toFixed(2)}). السعر من Meta وقد يتغير.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => answerWaConfirm(true)}
                  className="flex-1 py-3 bg-[#123F3A] text-white font-bold rounded-xl text-sm hover:bg-[#1a5c54]"
                >
                  موافق، أرسل ({(waConfirm.count * waConfirm.price).toFixed(2)} ريال)
                </button>
                <button
                  type="button"
                  onClick={() => answerWaConfirm(false)}
                  className="flex-1 py-3 bg-white border border-neutral-200 text-[#0D1F1D] font-bold rounded-xl text-sm hover:border-[#123F3A]/40"
                >
                  لا، جهّز روابط واتساب ويب
                </button>
              </div>
            </div>
          )}

          {phase === 'sending' && live && (
            <div
              className={`mb-4 rounded-2xl border px-4 py-3 ${
                isStalled ? 'border-amber-200 bg-amber-50' : 'border-[#d7efe6] bg-[#f0faf7]'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-sm font-black text-[#0D1F1D]">
                  {live.total > 0 ? `${live.index} / ${live.total}` : 'تحضير…'}
                </div>
                <div className="text-[11px] font-mono text-neutral-500">إجمالي {formatElapsed(batchMs)}</div>
              </div>
              <div className="text-sm font-semibold text-[#123F3A] truncate">
                {live.supplierName !== '—' ? live.supplierName : live.step}
              </div>
              <div className="text-xs text-neutral-500 mt-1 leading-relaxed">
                القناة: <span className="font-bold text-[#0D1F1D]">{channelAr(live.channel)}</span>
                {inviteMs != null && (
                  <>
                    {' '}
                    · هذه الدعوة: <span className="font-mono">{formatElapsed(inviteMs)}</span>
                  </>
                )}
                <br />
                آخر نشاط: <span className="font-mono">{formatClock(live.lastActivityAt)}</span>
                {' · '}
                منذ {formatElapsed(idleMs)}
              </div>
              <div className="text-[11px] text-neutral-500 mt-2">{live.step}</div>
              {isStalled && (
                <div className="mt-2 text-xs font-semibold text-amber-900 leading-relaxed">
                  {live.channel === 'HARAJ'
                    ? 'قد يكون متوقفًا أو ينتظر حراج (تباعد ≥20ث) — انتظر أو ألغِ.'
                    : 'لا نشاط منذ فترة — شبكة/API قد يكون معلّقًا. يمكنك الإلغاء.'}
                </div>
              )}
              {cancelRequested && (
                <div className="mt-2 text-xs font-semibold text-amber-800">جارٍ الإلغاء…</div>
              )}
            </div>
          )}

          {(phase === 'sending' || phase === 'done') && rows.length > 0 && (
            <div className="mb-4 space-y-2">
              {rfqId && (
                <p className="text-[11px] text-neutral-400 font-mono break-all">طلب: {rfqId}</p>
              )}
              {rows.map((row) => (
                <div
                  key={row.inviteId}
                  className={`flex items-start justify-between gap-3 border rounded-xl px-3 py-2.5 ${
                    row.status === 'sending' ? 'border-amber-200 bg-amber-50/40' : 'border-neutral-100'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#0D1F1D] truncate">{row.name}</div>
                    <div className="text-[11px] text-neutral-400 mt-0.5">
                      {channelAr(row.channel)}
                      {row.code ? ` · ${row.code}` : ''}
                      {row.detail ? ` · ${row.detail}` : ''}
                      {row.status === 'sending' && row.startedAt != null
                        ? ` · ${formatElapsed(nowTick - row.startedAt)}`
                        : ''}
                    </div>
                    {row.waUrl && (
                      <a
                        href={row.waUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block mt-1 text-[11px] font-bold text-[#123F3A] underline"
                      >
                        فتح واتساب ويب
                      </a>
                    )}
                  </div>
                  <span
                    className={`flex-shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      row.status === 'sent' || row.status === 'wa_ready'
                        ? 'bg-[#CFF5DC] text-[#1a7a45]'
                        : row.status === 'failed'
                          ? 'bg-red-50 text-red-700'
                          : row.status === 'sending'
                            ? 'bg-amber-50 text-amber-800'
                            : row.code === 'DEFERRED_FAST_MODE'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {row.code === 'DEFERRED_FAST_MODE' ? 'مؤجّل' : statusLabel(row.status)}
                  </span>
                </div>
              ))}
              {phase === 'done' && (
                <p className="text-xs text-neutral-500 pt-1">
                  أُرسل {sentCount} · واتساب {waCount} · فشل {failedCount}
                  {deferredCount > 0 ? ` · حراج مؤجّل ${deferredCount}` : ''}
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700 leading-relaxed">
              {error}
            </div>
          )}

          <div className="space-y-2">
            {phase === 'form' && (
              <button
                type="button"
                disabled={busy || sendBlockers.length > 0}
                onClick={handleSend}
                className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm disabled:opacity-50"
              >
                {fastEmailFirst ? 'إنشاء وإرسال سريع (بريد أولًا)' : 'إنشاء وإرسال كل القنوات'}
              </button>
            )}
            {phase === 'sending' && (
              <button
                type="button"
                onClick={requestCancel}
                className="w-full py-3 text-sm font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl"
              >
                {cancelRequested ? 'جارٍ الإلغاء…' : 'إلغاء الإرسال الآن'}
              </button>
            )}
            {phase === 'done' && deferredHaraj.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={handleSendHarajDeferred}
                className="w-full py-3 text-sm font-bold text-[#123F3A] border border-[#123F3A] rounded-xl disabled:opacity-50"
              >
                إرسال حراج الآن ({deferredHaraj.length}) — بطيء ≥20ث لكل بائع
              </button>
            )}
            {canContinue && (
              <button
                type="button"
                onClick={() => onSent(rfqId!)}
                className="w-full py-3.5 bg-[#123F3A] text-white font-bold rounded-xl text-sm"
              >
                متابعة إلى المراسلات
              </button>
            )}
            {phase === 'done' && !canContinue && (
              <button
                type="button"
                onClick={onFailed}
                className="w-full py-3 text-sm font-semibold text-neutral-500"
              >
                إغلاق
              </button>
            )}
            {phase === 'done' && canContinue && (failedCount > 0 || deferredCount > 0) && (
              <button
                type="button"
                onClick={onFailed}
                className="w-full py-2 text-sm font-semibold text-neutral-400"
              >
                إغلاق دون متابعة
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
