export type ChannelAvailability = boolean | null

/** Missing or malformed API fields are unknown, never an explicit OFF state. */
export function channelAvailability(value: unknown): ChannelAvailability {
  return typeof value === 'boolean' ? value : null
}

export function whatsAppChannelDetail(
  enabled: ChannelAvailability,
  metaReady: ChannelAvailability,
): string {
  if (enabled == null) return 'تعذّر التحقق من حالة القناة؛ لا نعرف إن كانت مهيّأة أو متوقفة.'
  if (enabled) return 'جاهز للإرسال للموردين الذين وافقوا على المراسلة عبر واتساب'
  if (metaReady === true) return 'الحساب مهيّأ لدى Meta لكن القناة موقوفة على خادم فرق'
  if (metaReady === false) return 'غير مهيأ بحسب حالة الخادم'
  return 'حالة إعداد Meta غير متاحة؛ لا نعرف سبب توقف القناة.'
}
