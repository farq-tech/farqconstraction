/**
 * Comparison economics for local Taseer. Latest offer per conversation only.
 * Never invents ratings, fees, or distances.
 */

export type CompareOffer = {
  id: string
  token: string
  amount?: string
  extraAmount?: string
  deliveryAmount?: string
  includesMaterials?: boolean
  includesAttendance?: boolean
  includesDelivery?: boolean
  appointment?: string
  submittedAt: string
}

export type CompareInvite = {
  token: string
  need: string
  sellerName?: string
  authorUsername?: string
  listingTitle?: string
  ratingValue?: number
  ratingCount?: number
  awardedAt?: string
}

export type CompareSupplier = {
  key: string
  name: string
  authorId?: string
  authorUsername?: string
  offers: CompareOffer[]
}

export type CompareRow = {
  token: string
  supplierKey: string
  name: string
  listingTitle?: string
  price: number | null
  extraAmount: number | null
  deliveryAmount: number | null
  finalCost: number | null
  includesMaterials?: boolean
  includesAttendance?: boolean
  includesDelivery?: boolean
  appointment?: string
  appointmentAt: number | null
  ratingValue: number | null
  ratingCount: number | null
  status: 'priced' | 'no-price' | 'awarded'
  statusLabel: string
  history: Array<{ amount?: string; submittedAt: string }>
  latestOfferId?: string
  replied: boolean
}

export type CompareFilter = 'all' | 'cheapest' | 'materials' | 'delivery' | 'fastest' | 'rating'

export type CompareSummary = {
  arrived: number
  cheapest: number | null
  cheapestComplete: number | null
  min: number | null
  max: number | null
  completeNote: string
}

const COMPLETE_NOTE =
  'التكلفة المكتملة = السعر المذكور + أي مبلغ إضافي أو توصيل مكتوب. إن كان الحضور أو المواد أو التوصيل مشمولاً بلا رسوم، لا نضيف رسماً من عندنا.'

export function parseMoney(raw?: string): number | null {
  if (!raw) return null
  const ascii = raw.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  const match = ascii.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
  if (!match) return null
  const n = Number(match[1])
  return Number.isFinite(n) ? n : null
}

export function parseAppointmentAt(raw?: string, now = Date.now()): number | null {
  if (!raw) return null
  const text = raw.trim()
  const iso = Date.parse(text)
  if (Number.isFinite(iso)) return iso
  if (/اليوم|الليله|الليلة/.test(text)) {
    const hm = /(\d{1,2})\s*[:.]\s*(\d{2})/.exec(text)
    const hour = hm ? Number(hm[1]) + (/م|مساء|pm/i.test(text) && Number(hm[1]) < 12 ? 12 : 0) : 19
    const minute = hm ? Number(hm[2]) : 0
    const d = new Date(now)
    d.setHours(hour, minute, 0, 0)
    return d.getTime()
  }
  if (/غدا|بكره|بكرة/.test(text)) return now + 86_400_000
  return null
}

function yesNo(value?: boolean): boolean | undefined {
  return value === true ? true : value === false ? false : undefined
}

function isComplete(row: Pick<CompareRow, 'price' | 'includesMaterials' | 'includesAttendance'>): boolean {
  return row.price != null && row.includesMaterials === true && row.includesAttendance === true
}

export function buildNeedComparison(
  need: string,
  invites: CompareInvite[],
  suppliers: CompareSupplier[],
  now = Date.now(),
): { need: string; rows: CompareRow[]; summary: CompareSummary } {
  const forNeed = invites.filter((invite) => invite.need === need)
  const rows: CompareRow[] = forNeed.map((invite) => {
    const supplier =
      suppliers.find((s) => s.offers.some((o) => o.token === invite.token)) ||
      suppliers.find((s) => s.authorUsername && s.authorUsername === invite.authorUsername)
    const history = (supplier?.offers || [])
      .filter((o) => o.token === invite.token)
      .slice()
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
    const latest = history[history.length - 1]
    const price = parseMoney(latest?.amount)
    const extraAmount = parseMoney(latest?.extraAmount)
    const deliveryAmount = parseMoney(latest?.deliveryAmount)
    const finalCost = price == null ? null : price + (extraAmount ?? 0) + (deliveryAmount ?? 0)
    const awarded = Boolean(invite.awardedAt)
    const replied = Boolean(latest)
    const status: CompareRow['status'] = awarded ? 'awarded' : price != null ? 'priced' : 'no-price'
    return {
      token: invite.token,
      supplierKey: supplier?.key || `taseer:token:${invite.token}`,
      name: supplier?.name || invite.sellerName || invite.authorUsername || 'بائع',
      listingTitle: invite.listingTitle,
      price,
      extraAmount,
      deliveryAmount,
      finalCost,
      includesMaterials: yesNo(latest?.includesMaterials),
      includesAttendance: yesNo(latest?.includesAttendance),
      includesDelivery: yesNo(latest?.includesDelivery),
      appointment: latest?.appointment,
      appointmentAt: parseAppointmentAt(latest?.appointment, now),
      ratingValue: typeof invite.ratingValue === 'number' ? invite.ratingValue : null,
      ratingCount: typeof invite.ratingCount === 'number' ? invite.ratingCount : null,
      status,
      statusLabel: awarded ? 'ترسية' : price != null ? 'عرض مؤكد' : replied ? 'لم يرسل سعرًا' : 'لم يرد',
      history: history.map((o) => ({ amount: o.amount, submittedAt: o.submittedAt })),
      latestOfferId: latest?.id,
      replied,
    }
  })

  const priced = rows.map((r) => r.price).filter((n): n is number => n != null)
  const complete = rows.filter(isComplete).map((r) => r.finalCost).filter((n): n is number => n != null)
  const summary: CompareSummary = {
    arrived: rows.filter((r) => r.price != null).length,
    cheapest: priced.length ? Math.min(...priced) : null,
    cheapestComplete: complete.length ? Math.min(...complete) : null,
    min: priced.length ? Math.min(...priced) : null,
    max: priced.length ? Math.max(...priced) : null,
    completeNote: COMPLETE_NOTE,
  }

  return { need, rows, summary }
}

function valueScore(row: CompareRow): number {
  let score = 0
  if (row.finalCost != null) score -= row.finalCost
  if (row.ratingValue != null) score += row.ratingValue * 20
  if (row.appointmentAt != null) score -= row.appointmentAt / 1_000_000_000
  if (row.includesMaterials === true) score += 15
  if (row.includesAttendance === true) score += 15
  if (row.includesDelivery === true) score += 15
  return score
}

export function applyCompareFilter(rows: CompareRow[], filter: CompareFilter): CompareRow[] {
  const copy = rows.slice()
  if (filter === 'materials') return copy.filter((r) => r.includesMaterials === true)
  if (filter === 'delivery') return copy.filter((r) => r.includesDelivery === true)
  if (filter === 'cheapest') {
    return copy.sort((a, b) => {
      if (a.price == null && b.price == null) return 0
      if (a.price == null) return 1
      if (b.price == null) return -1
      return a.price - b.price
    })
  }
  if (filter === 'fastest') {
    return copy.sort((a, b) => {
      if (a.appointmentAt == null && b.appointmentAt == null) return 0
      if (a.appointmentAt == null) return 1
      if (b.appointmentAt == null) return -1
      return a.appointmentAt - b.appointmentAt
    })
  }
  if (filter === 'rating') {
    return copy.sort((a, b) => {
      if (a.ratingValue == null && b.ratingValue == null) return 0
      if (a.ratingValue == null) return 1
      if (b.ratingValue == null) return -1
      return b.ratingValue - a.ratingValue
    })
  }
  return copy.sort((a, b) => valueScore(b) - valueScore(a))
}

export function formatSar(n: number | null): string {
  if (n == null) return '—'
  return `${n} ر.س`
}
