import type { OutcomeNotice, OutcomeNoticeResult } from '../api/constructionClient'

/** The badge beside each supplier. */
export const OUTCOME_LABELS: Record<string, string> = {
  AWARDED: 'اعتُمد عرضه',
  NOT_SELECTED: 'لم يُختر هذه المرة',
  CLOSED_NO_AWARD: 'أُغلق الطلب بدون شراء',
}

/** Why a send did not go, in the buyer's words. */
export const RESULT_LABELS: Record<string, string> = {
  ALREADY_NOTIFIED: 'سبق إبلاغه بنتيجة هذا الطلب',
  TEXT_CHANGED: 'تغيّر النص منذ عرضه — راجع النص الجديد ثم وافق عليه',
  NOT_A_QUOTING_SUPPLIER: 'لم يقدّم عرضاً على هذا الطلب',
  NO_FREE_CHANNEL: 'لا توجد قناة مجانية',
  DECLINED: 'اعتذر عن هذا الطلب — لا نراسله',
  WHATSAPP_WINDOW_CLOSED: 'انتهت نافذة واتساب المجانية (٢٤ ساعة)',
  INBOX_PORTAL_UNAVAILABLE: 'بوابة المورد غير متاحة',
  INBOX_NEW_MESSAGE: 'وصلت رسالة جديدة من المورد — راجع المحادثة أولاً',
  INBOX_REPLY_CHANNEL_MISMATCH: 'المورد راسلنا من قناة أخرى',
  INBOX_OWNER_REQUIRED: 'مراسلات هذا الطلب مسندة لزميل آخر',
}

/** Only drafts that are ready and whose full text is on screen can be approved. */
export function sendable(notices: OutcomeNotice[]): OutcomeNotice[] {
  return notices.filter((n) => n.state === 'READY' && Boolean(n.content_hash) && n.text.trim().length > 0)
}

/** The request body for the approved drafts: the hash binds each to the text shown. */
export function approvalsFor(notices: OutcomeNotice[], supplierIds?: string[]): Array<{ supplier_id: string; content_hash: string }> {
  const wanted = supplierIds ? new Set(supplierIds) : null
  return sendable(notices)
    .filter((n) => !wanted || wanted.has(n.supplier_id))
    .map((n) => ({ supplier_id: n.supplier_id, content_hash: n.content_hash as string }))
}

export function resultLabel(result: OutcomeNoticeResult): string {
  if (result.state === 'SENT') return 'أُرسلت'
  if (result.state === 'UNKNOWN') return 'نتيجة الإرسال غير مؤكدة — لن نعيد الإرسال تلقائياً'
  const reason = String(result.reason || '')
  return RESULT_LABELS[reason] || result.reason_label_ar || (result.state === 'FAILED' ? 'تعذّر الإرسال — لم يصل شيء للمورد' : 'لم تُرسل')
}

export function counts(notices: OutcomeNotice[]) {
  return {
    ready: notices.filter((n) => n.state === 'READY').length,
    sent: notices.filter((n) => n.state === 'SENT').length,
    blocked: notices.filter((n) => n.state === 'BLOCKED').length,
  }
}
