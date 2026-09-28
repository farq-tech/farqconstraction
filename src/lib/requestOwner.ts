/**
 * Who is responsible for a request (RFQ) or a booklet, and who may move it.
 *
 * Pure helpers so the header control's rules are tested without a DOM: the
 * owner line, whether the «نقل الملكية» control shows at all, and the sentence
 * said after a transfer.
 */
import type {
  ConstructionCompanyMember,
  ConstructionCompanyMembers,
  ConstructionOwner,
} from '../api/constructionClient'

export type OwnerSubject = 'rfq' | 'booklet'

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'مدير',
  PROCUREMENT: 'مشتريات',
  ENGINEER: 'مهندس',
}

export function roleLabel(role: string | null | undefined): string {
  const key = String(role || '').toUpperCase()
  return ROLE_LABELS[key] || key || '—'
}

/** The current owner's user id, from the owner object or the bare assignment. */
export function currentOwnerId(owner: ConstructionOwner | null | undefined, assignedUserId?: string | null): string | null {
  return owner?.user_id || assignedUserId || null
}

/**
 * «المسؤول: …» — the owner's email; falls back to the member list when the API
 * sent only the id, and to «غير محدد» when there is no owner.
 */
export function ownerLabel(
  owner: ConstructionOwner | null | undefined,
  assignedUserId?: string | null,
  members: ConstructionCompanyMember[] = [],
): string {
  if (owner?.email) return owner.email
  const id = currentOwnerId(owner, assignedUserId)
  const member = id ? members.find((m) => m.user_id === id) : undefined
  return member?.email || 'غير محدد'
}

/** The control renders only when GET /members says so (ADMIN). */
export function canTransferOwnership(members: ConstructionCompanyMembers | null | undefined): boolean {
  return members?.can_transfer === true
}

export function transferSuccessMessage(
  subject: OwnerSubject,
  toEmail: string,
  result: { booklet_id?: string | null; rfq_ids?: string[] } | null | undefined,
): string {
  if (subject === 'booklet') return `نُقلت ملكية الكراسة إلى ${toEmail}`
  if (result?.booklet_id) {
    const count = Array.isArray(result.rfq_ids) ? result.rfq_ids.length : 0
    return `نُقلت ملكية الكراسة كاملة إلى ${toEmail}${count > 1 ? ` (${count} طلبات)` : ''} — هذا الطلب دفعة منها`
  }
  return `نُقلت ملكية الطلب إلى ${toEmail}`
}
