/*
 * «مطابقة الموردين على مستوى الطلب» (supplier matching v2) — an opt-in
 * add-on (`supplier_match_v2`). The server reads the whole request (supply
 * only or supply & install, its packages), proposes specialist contractors
 * for an installed package, then each line's suppliers in the request city,
 * with the evidence and the channel that reaches them. Read-only.
 */

export const SUPPLIER_MATCH_V2_SERVICE = 'supplier_match_v2'

export type PlanChannel = 'WHATSAPP' | 'HARAJ' | 'EMAIL' | 'MOBILE_UNLINKED' | 'LANDLINE' | 'NONE'

export type PlanSupplier = {
  id: string
  name_ar: string
  city?: string | null
  district?: string | null
  city_relation?: string
  city_evidence_ar?: string
  channel: PlanChannel
  channel_ar: string
  sendable: boolean
  needs_mobile: boolean
  mobile_hint_ar?: string
  blocked_reason?: string
  blocked_reason_ar?: string
  tier: 'STRONG' | 'MEDIUM'
  kind?: 'CONTRACTOR' | 'FACTORY' | 'SUPPLIER'
  why_ar: string
  evidence?: Array<{ field: string; field_ar: string; term: string }>
  outcome?: string
  outcome_ar?: string
  invited?: boolean
  line_keys?: string[]
  duplicates?: number
}

export type PlanLane = {
  suppliers: PlanSupplier[]
  needs_mobile: PlanSupplier[]
  blocked: PlanSupplier[]
}

export type SupplierPlan = {
  version: string
  request: {
    scope: 'SUPPLY_ONLY' | 'SUPPLY_AND_INSTALL' | 'MIXED'
    scope_ar: string
    packages: Array<{ id: string; label_ar: string; line_keys: string[]; trades: string[] }>
    city?: string | null
    district?: string | null
    invited?: number
  }
  contractors: Array<PlanLane & { package: string; label_ar: string; line_keys: string[] }>
  lines: Array<PlanLane & {
    key: string
    name: string
    trade: string | null
    trade_label_ar?: string
    scope: string
    unclassified?: boolean
    counts: { sendable: number; needs_mobile: number; blocked: number }
  }>
  selection: Array<{ id: string; name_ar: string; channel: PlanChannel; line_keys: string[] }>
  totals: {
    sendable: number
    needs_mobile: number
    blocked: number
    selected: number
    by_channel?: Record<string, number>
    lines_without_supplier?: string[]
    unclassified_lines?: string[]
  }
}

const CHANNEL_CLASS: Record<PlanChannel, string> = {
  WHATSAPP: 'bg-emerald-50 text-emerald-700',
  HARAJ: 'bg-amber-50 text-amber-700',
  EMAIL: 'bg-sky-50 text-sky-700',
  MOBILE_UNLINKED: 'bg-rose-50 text-rose-700',
  LANDLINE: 'bg-rose-50 text-rose-700',
  NONE: 'bg-neutral-100 text-neutral-500',
}

export function channelClass(channel: PlanChannel): string {
  return CHANNEL_CLASS[channel] || CHANNEL_CLASS.NONE
}

/** «يحتاج رقم جوال» is never counted as a supplier who will receive the request. */
export function channelLabel(s: Pick<PlanSupplier, 'channel' | 'channel_ar'>): string {
  if (s.channel === 'LANDLINE' || s.channel === 'MOBILE_UNLINKED') return 'يحتاج رقم جوال'
  return s.channel_ar || s.channel
}

export function kindLabel(kind?: PlanSupplier['kind']): string | null {
  if (kind === 'CONTRACTOR') return 'مقاول/منفّذ'
  if (kind === 'FACTORY') return 'مصنع'
  return null
}

const CHANNEL_ORDER: PlanChannel[] = ['WHATSAPP', 'HARAJ', 'EMAIL', 'MOBILE_UNLINKED', 'LANDLINE']

/** «واتساب 120 · محادثة 300 · بريد 9 · يحتاج رقم جوال 40» */
export function channelSummary(byChannel: Record<string, number> | undefined): string {
  if (!byChannel) return ''
  const needs = (byChannel.MOBILE_UNLINKED || 0) + (byChannel.LANDLINE || 0)
  const parts: string[] = []
  for (const ch of CHANNEL_ORDER.slice(0, 3)) {
    if (byChannel[ch]) parts.push(`${channelLabel({ channel: ch, channel_ar: ch === 'WHATSAPP' ? 'واتساب' : ch === 'HARAJ' ? 'محادثة' : 'بريد' })} ${byChannel[ch]}`)
  }
  if (needs) parts.push(`يحتاج رقم جوال ${needs}`)
  return parts.join(' · ')
}

/** A service-off answer (403 CONSTRUCTION_SERVICE_DISABLED) hides the panel silently. */
export function isPlanServiceOff(error: unknown): boolean {
  const e = error as { status?: number; code?: string; message?: string } | null
  return e?.status === 403 || e?.code === 'CONSTRUCTION_SERVICE_DISABLED' || /CONSTRUCTION_SERVICE_DISABLED/.test(String(e?.message || ''))
}
