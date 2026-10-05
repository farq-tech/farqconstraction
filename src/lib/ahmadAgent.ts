import {
  askAhmad, getAhmadBooklets, listBuyerRfqs, getConstructionReports,
  getConstructionRfq, getConstructionComparison, getConstructionBooklet,
  listConstructionInboxThreads, getConstructionInboxThread, replyToConstructionInboxThread,
  type ConstructionInboxThread, type ConstructionInboxThreadDetail,
} from '../api/constructionClient'
import { listConstructionSuppliers } from '../api/constructionSuppliers'
import { farqSession } from '../api/farqSession'
import { linesFromManualText } from './rfqCart'

export type AhmadAction =
  | { kind: 'create'; label: string; lines?: ReturnType<typeof linesFromManualText>; userId?: string }
  | { kind: 'reply'; label: string; inviteId: string; recipient: string; text: string; channel: 'EMAIL' | 'WHATSAPP' | 'HARAJ' | 'PORTAL'; parentId: string | null; idempotencyKey: string; userId: string }
export type AhmadAnswer = { text: string; action?: AhmadAction }
export type AhmadScope = { rfqId?: string | null; bookletId?: string | null }
export function normalizeAhmadText(text: string) {
  return text.toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim()
}
const count = (value: number) => value.toLocaleString('en-US')
const supplierName = (t: ConstructionInboxThread) => t.supplier_name_ar || t.supplier_name_en || t.request_context?.supplier_name_ar || t.request_context?.supplier_name || t.supplier_id || ''

/** Follow every page; never mistake a first-page preview for all correspondence. */
export async function loadAhmadThreads(scope: AhmadScope = {}) {
  const threads: ConstructionInboxThread[] = []
  const ids = new Set<string>()
  const cursors = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await listConstructionInboxThreads({ filter: 'all', rfq_id: scope.rfqId, cursor })
    for (const t of page.threads) {
      const key = t.invite_id
      if (key && !ids.has(key)) { threads.push(t); ids.add(key) }
    }
    cursor = page.next_cursor || undefined
    if (cursor && cursors.has(cursor)) throw new Error('تعذّر تحميل بقية المراسلات. أعد المحاولة.')
    if (cursor) cursors.add(cursor)
  } while (cursor)
  return threads
}

/** A write is prepared from exact user text and an unambiguous, permitted thread. */
export async function prepareAhmadReply(recipient: string, text: string, scope: AhmadScope): Promise<AhmadAnswer> {
  const q = normalizeAhmadText(recipient)
  const threads = await loadAhmadThreads(scope)
  const exact = threads.filter(t => normalizeAhmadText(supplierName(t)) === q || t.invite_id === recipient)
  const matches = exact.length ? exact : threads.filter(t => normalizeAhmadText(supplierName(t)).includes(q))
  if (!matches.length) return { text: 'ما لقيت محادثة بهذا الاسم. اكتب اسم المورد كما يظهر في المراسلات.' }
  if (matches.length > 1) return { text: `لقيت أكثر من محادثة. حدّد رقم المحادثة مع اسم المورد:\n${matches.map(t => `${supplierName(t)} · ${t.request_context?.reference || 'طلب'} · ${t.invite_id}`).join('\n')}\nاكتب: أرسل إلى رقم المحادثة: نص الرسالة` }
  const t = matches[0]
  const detail = await getConstructionInboxThread(t.invite_id!)
  if (detail.can_reply !== true) return { text: 'حسابك لا يملك صلاحية الرد على هذه المحادثة حاليًا. افتح المراسلات لمراجعة مسؤول الطلب.' }
  const channel = detail.reply_channel
  if (!['EMAIL', 'WHATSAPP', 'HARAJ', 'PORTAL'].includes(channel || '')) return { text: 'ما قدرت أحدّد قناة إرسال متاحة لهذه المحادثة. راجعها في المراسلات.' }
  if (channel === 'WHATSAPP' && detail.whatsapp_window_open !== true) return { text: 'نافذة الرد بالواتساب مغلقة. افتح المراسلات لاختيار قناة متاحة.' }
  const userId = farqSession.getUser()?.id
  if (!userId) throw new Error('سجّل الدخول أولًا.')
  return { text: 'جهزت الرسالة للمراجعة. اضغط تأكيد الإرسال لإرسالها.', action: {
    kind: 'reply', label: 'تأكيد الإرسال', inviteId: t.invite_id!, recipient: `${supplierName(t)} · ${detail.reply_recipient || channel}`,
    text, channel: channel as 'EMAIL' | 'WHATSAPP' | 'HARAJ' | 'PORTAL', parentId: detail.last_message_id || null,
    idempotencyKey: crypto.randomUUID(), userId,
  } }
}

export async function executeAhmadReply(action: Extract<AhmadAction, { kind: 'reply' }>): Promise<string> {
  if (farqSession.getUser()?.id !== action.userId) throw new Error('تغيّر الحساب. جهّز الرسالة من جديد.')
  const result = await replyToConstructionInboxThread(action.inviteId, {
    idempotency_key: action.idempotencyKey, text: action.text, channel: action.channel, parent_message_id: action.parentId,
  })
  const state = result.state.toUpperCase()
  if (state === 'SENT') return 'أُرسلت الرسالة وقبلها مزوّد الإرسال. تابع وصولها من المراسلات.'
  if (state === 'SENDING' || state === 'PREPARED' || state === 'QUEUED') return 'الرسالة قيد الإرسال. تابع حالتها من المراسلات.'
  throw new Error(state === 'UNKNOWN' ? 'نتيجة الإرسال غير مؤكدة. راجع المراسلات قبل إعادة المحاولة.' : 'لم تُرسل الرسالة. راجع المراسلات لمعرفة سبب الرفض.')
}

function messageText(detail: ConstructionInboxThreadDetail) {
  const lines = detail.messages.map(m => `${m.created_at || ''} · ${m.direction === 'INBOUND' ? 'المورد' : 'فريقك'}: ${m.body_text || m.subject || '(مرفق بدون نص)'}${m.files?.length ? `\nالمرفقات: ${m.files.map(f => f.filename || f.id).join('، ')}` : ''}`)
  return lines.join('\n\n') + (detail.older_than ? '\n\nتوجد رسائل أقدم؛ افتح المحادثة لعرضها.' : '')
}

export async function askAhmadAgent(message: string, history: { role: string; text: string }[], scope: AhmadScope = {}): Promise<AhmadAnswer> {
  const q = normalizeAhmadText(message)
  const send = message.match(/^(?:أرسل|ارسل|رسل|ابعث)\s+(?:رسالة\s+)?(?:إلى|الى|لـ|ل)\s*(.+?)\s*[:：]\s*([\s\S]+)$/)
  if (send) return prepareAhmadReply(send[1].trim(), send[2].trim(), scope)
  if (/^(انشئ|انشي|سوي|سو|افتح|جهز|ابي انشئ|ابي اسوي).*(كراسه|طلب شراء|طلب تسعير)/.test(q)) {
    const body = message.split(/[:：]/).slice(1).join(':').trim()
    if (body) {
      const lines = linesFromManualText(body)
      if (lines.length) return { text: `جهزت ${lines.length} بندًا لمسودة الكراسة. راجعها ثم أكد الإضافة؛ تقدر تكمل اختيار الموردين من الطلب.`, action: { kind: 'create', label: 'إنشاء مسودة بهذه البنود', lines, userId: farqSession.getUser()?.id } }
      return { text: 'اكتب كل بند في سطر والكمية أولًا، مثل:\nأنشئ كراسة:\n20 كيس أسمنت\n6 سخانات 80 لتر' }
    }
    return { text: 'أفتح لك إنشاء الكراسة؛ ارفع الملف أو أضف البنود والكميات، ثم راجعها وحدّد الموردين. تظل مسودة حتى تؤكد الإرسال.', action: { kind: 'create', label: 'إنشاء كراسة جديدة' } }
  }
  if (/^(ارسل|رسل|ابعث)/.test(q)) return { text: 'حدّد المورد ونص الرسالة بهذا الشكل:\nأرسل إلى اسم المورد: نص الرسالة\nأعرضها لك للمراجعة قبل الإرسال.' }

  const wantsCount = /كم|عدد|احصا|ملخص/.test(q)
  if (wantsCount && /كراس/.test(q)) {
    const { booklets } = await getAhmadBooklets()
    return { text: `عندك ${count(booklets.length)} كراسة في حساب الشركة.\nالمصدر: الكراسات، محدث الآن.` }
  }
  if (wantsCount && /مورد/.test(q) && !/عرض|طلب|مشارك|ردود|ردوا/.test(q)) {
    const result = await listConstructionSuppliers({ limit: 1 })
    return { text: `دليل الموردين المتاح لحسابك فيه ${count(result.total)} مورد.\nالمصدر: دليل الموردين، محدث الآن.` }
  }
  if (wantsCount && /طلب/.test(q) && !/عرض|بند/.test(q)) {
    const data = await listBuyerRfqs()
    return { text: `عندك ${count(data.summary.rfq_count)} طلب تسعير، منها ${count(data.summary.draft_count)} مسودة و${count(data.summary.sent_count)} مرسل.\nالمصدر: الطلبات.` }
  }
  if (wantsCount && /بند|عرض|توفير|وفر/.test(q)) {
    const r = await getConstructionReports({ rfqId: scope.rfqId })
    return { text: `${scope.rfqId ? 'الطلب المفتوح' : 'حساب الشركة'}:\n${count(r.totals.lines)} بند، ${count(r.totals.priced_lines)} بند له أسعار، ${count(r.totals.line_offers_total)} سعر بند، ${count(r.totals.quoted)} عرض مورد.\nالتوفير المحتمل: ${count(r.savings.potential)} ر.س، المحقق: ${count(r.savings.realized)} ر.س.\nالمصدر: التقارير. التوفير المحتمل تقديري.` }
  }
  if (/رسائل|رسايل|مراسل|محادث/.test(q)) {
    const threads = await loadAhmadThreads(scope)
    const requested = q.match(/(?:رسائل|رسايل|محادثه|مراسلات)\s+(?:مع\s+|من\s+)?(.+)/)?.[1]
    const selected = requested ? threads.filter(t => normalizeAhmadText(supplierName(t)).includes(requested)) : []
    if (selected.length === 1) {
      const detail = await getConstructionInboxThread(selected[0].invite_id!)
      return { text: `${supplierName(selected[0])}:\n${messageText(detail) || 'لا توجد رسائل في المحادثة.'}` }
    }
    if (requested && !/كل|موجود|عند|فيه/.test(requested) && selected.length === 0) return { text: 'ما لقيت محادثة بهذا الاسم. اكتب: رسائل اسم المورد.' }
    return { text: `المراسلات المتاحة${scope.rfqId ? ' للطلب المفتوح' : ' لحسابك'}: ${count(threads.length)} محادثة.\n${threads.slice(0, 20).map(t => `${supplierName(t)} · ${t.request_context?.reference || ''}\n${t.preview || 'لا يوجد نص معاينة'}`).join('\n\n')}${threads.length > 20 ? '\n\nهذه أحدث 20 محادثة. حدّد اسم المورد لقراءة رسائله.' : ''}` }
  }

  // Each source fails independently; unknown data stays unknown rather than zero.
  const sources = {
    booklets: () => getAhmadBooklets(), requests: () => listBuyerRfqs(),
    suppliers: () => listConstructionSuppliers({ limit: 10 }), reports: () => getConstructionReports({ rfqId: scope.rfqId }),
    correspondence: () => listConstructionInboxThreads({ filter: 'all', rfq_id: scope.rfqId }),
    ...(scope.rfqId ? { selectedRequest: () => getConstructionRfq(scope.rfqId!), comparison: () => getConstructionComparison(scope.rfqId!) } : {}),
    ...(scope.bookletId ? { selectedBooklet: () => getConstructionBooklet(scope.bookletId!) } : {}),
  }
  const keys = Object.keys(sources) as (keyof typeof sources)[]
  const results = await Promise.allSettled(keys.map(k => sources[k]!()))
  const context: Record<string, unknown> = { scope, fetched_at: new Date().toISOString(), unavailable: [] }
  results.forEach((r, i) => { if (r.status === 'fulfilled') context[keys[i]] = r.value; else (context.unavailable as string[]).push(keys[i]) })
  try { return { text: await askAhmad(message, history, scope.rfqId, context) } }
  catch {
    return { text: 'المحادثة الذكية لا تستجيب حاليًا. تقدر تسألني مباشرة: كم كراسة؟ كم مورد؟ كم طلب؟ ملخص العروض؟ رسائل اسم المورد؟ أو أرسل إلى اسم المورد: نص الرسالة. وأقدر أفتح لك إنشاء كراسة جديدة.' }
  }
}
