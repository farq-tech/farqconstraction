export type WhatsAppDeliveryState =
  | 'READ'
  | 'DELIVERED'
  | 'ACCEPTED'
  | 'FAILED'
  | 'UNCONFIRMED'

export type WhatsAppDeliveryPresentation = {
  status: 'sent' | 'failed'
  code: 'SENT' | 'DELIVERY_FAILED'
  detail: string
}

/**
 * Keep the send-progress row honest about the distinction between Meta
 * accepting a message and WhatsApp reporting delivery or read receipts.
 */
export function presentWhatsAppDelivery(
  state: WhatsAppDeliveryState | null | undefined,
  errorTitle?: string | null,
): WhatsAppDeliveryPresentation {
  switch (state) {
    case 'READ':
      return { status: 'sent', code: 'SENT', detail: 'واتساب · وصل للمورد وقرأه' }
    case 'DELIVERED':
      return { status: 'sent', code: 'SENT', detail: 'واتساب · وصل للمورد' }
    case 'ACCEPTED':
      return { status: 'sent', code: 'SENT', detail: 'واتساب · قبلته Meta، بانتظار تأكيد التسليم' }
    case 'FAILED':
      return {
        status: 'failed',
        code: 'DELIVERY_FAILED',
        detail: `واتساب · قبلته Meta ثم تعذر تسليمه${errorTitle ? ` · ${errorTitle}` : ''}`,
      }
    case 'UNCONFIRMED':
    default:
      return { status: 'sent', code: 'SENT', detail: 'واتساب · قبلته Meta، لم يصل تأكيد التسليم بعد' }
  }
}

/** A settings label for the most recent company-scoped attempt and receipt. */
export function whatsappDeliveryEvidenceLabel(
  state?: WhatsAppDeliveryState | null,
  attemptStatus?: string,
  trackingAvailable?: boolean,
): string {
  if (state === 'READ') return 'وصل وقرأه المورد'
  if (state === 'DELIVERED') return 'وصل إلى المورد'
  if (state === 'FAILED') return 'فشل التسليم بحسب إيصال Meta'
  if (state === 'ACCEPTED') return 'قبلته Meta؛ لم يؤكد الوصول بعد'
  if (state === 'UNCONFIRMED') return 'لا يوجد إيصال حاسم'
  if (attemptStatus === 'SENT' && trackingAvailable === false) return 'قبلته Meta؛ تتبع الإيصالات غير مهيّأ'
  if (attemptStatus === 'SENT') return 'قبلته Meta؛ لا يوجد تأكيد تسليم بعد'
  if (attemptStatus) return `حالة المحاولة: ${attemptStatus}`
  return 'لا توجد محاولة إرسال مسجلة'
}
