/**
 * The company's team, for its administrators: who is in, who is invited, and
 * inviting or removing someone. Backed by /api/business/team and
 * /api/business/invitations, gated on the server exactly as sending an
 * invitation is (organization OWNER/ADMIN or the sector's ADMIN).
 */
import { apiBase } from './apiBase'
import { farqSession } from './farqSession'

const SECTOR = 'construction'

export type TeamContext = { organizationId: string; organizationName: string; canManage: boolean }
export type TeamMember = {
  membership_id: string
  email: string
  display_name: string | null
  organization_role: string
  sector_role: string | null
  construction_role: string | null
  status: string
  last_sign_in_at: string | null
  is_me: boolean
}
export type TeamInvitation = { id: string; email: string; organization_role: string; sector_role: string; status: string; expires_at: string }
export type Team = { members: TeamMember[]; invitations: TeamInvitation[]; seats: { limit: number | null; used: number } }

/** What the administrator picks, and what it means on the server. */
export const ACCESS_LEVELS = [
  { id: 'admin', label: 'مدير: كل شيء ويضيف حسابات', organizationRole: 'ADMIN', sectorRole: 'ADMIN' },
  { id: 'procurement', label: 'مشتريات: يرفع الكراسات ويرسل الطلبات', organizationRole: 'MEMBER', sectorRole: 'EDITOR' },
  { id: 'viewer', label: 'مشاهدة فقط', organizationRole: 'MEMBER', sectorRole: 'VIEWER' },
] as const
export type AccessLevel = (typeof ACCESS_LEVELS)[number]['id']

const ERRORS: Record<string, string> = {
  MEMBER_LIMIT_REACHED: 'لا مقاعد متبقية في باقة الشركة. أزل عضوًا أو ألغِ دعوة معلّقة أولًا.',
  BUSINESS_INVITATION_INVALID: 'البريد غير صحيح.',
  BUSINESS_MEMBER_ADMIN_REQUIRED: 'هذه الصفحة لمدير الشركة فقط.',
  BUSINESS_PERMISSION_REQUIRED: 'هذه الصفحة لمدير الشركة فقط.',
  BUSINESS_OWNER_PROTECTED: 'لا يمكن إزالة مالك الشركة.',
  BUSINESS_SELF_REMOVAL: 'لا يمكنك إزالة نفسك.',
  BUSINESS_OWNER_REQUIRED: 'إزالة مدير آخر للمالك فقط.',
  BUSINESS_INVITATION_ROLE_ABOVE_INVITER: 'لا يمكنك منح صلاحية أعلى من صلاحيتك.',
  BUSINESS_INVITATION_ACCESS_REVOKED: 'لا تملك صلاحية منح هذا المستوى.',
}

async function call<T>(path: string, init: RequestInit = {}, context?: TeamContext): Promise<T> {
  const token = farqSession.getAccessToken()
  const response = await fetch(`${apiBase()}/api/business${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(context ? { 'x-farq-organization-id': context.organizationId, 'x-farq-sector': SECTOR } : {}),
    },
  })
  const payload = (await response.json().catch(() => null)) as
    | { data?: T; errors?: Array<{ code?: string; message?: string }>; message?: string }
    | null
  if (!response.ok) {
    const code = payload?.errors?.[0]?.code || ''
    throw new Error(ERRORS[code] || payload?.errors?.[0]?.message || payload?.message || `HTTP ${response.status}`)
  }
  return (payload?.data ?? payload) as T
}

/** The construction company this account belongs to, and whether it may manage the team. */
export async function loadTeamContext(): Promise<TeamContext | null> {
  const data = await call<{ organizations?: Array<{ id: string; name: string; role: string; subscriptions?: Array<{ sectorCode: string; status: string; grant?: { role?: string } }> }> }>('/context')
  for (const org of data?.organizations || []) {
    const sub = (org.subscriptions || []).find((s) => s.sectorCode === SECTOR && s.status === 'ACTIVE')
    if (!sub) continue
    return {
      organizationId: org.id,
      organizationName: org.name,
      canManage: ['OWNER', 'ADMIN'].includes(org.role) || sub.grant?.role === 'ADMIN',
    }
  }
  return null
}

export const loadTeam = (context: TeamContext) => call<Team>('/team', {}, context)

export function inviteMember(context: TeamContext, email: string, level: AccessLevel) {
  const access = ACCESS_LEVELS.find((l) => l.id === level) || ACCESS_LEVELS[1]
  return call<{ sent?: boolean }>(
    '/invitations',
    { method: 'POST', body: JSON.stringify({ email, organizationRole: access.organizationRole, sectorRole: access.sectorRole }) },
    context,
  )
}

export const revokeInvitation = (context: TeamContext, id: string) =>
  call(`/team/invitations/${encodeURIComponent(id)}/revoke`, { method: 'POST' }, context)

export const removeMember = (context: TeamContext, membershipId: string) =>
  call(`/team/members/${encodeURIComponent(membershipId)}/remove`, { method: 'POST' }, context)

/** The invitation link's three steps, none of which needs a session first. */
export const previewInvitation = (token: string) =>
  call<{ email: string; organization_name: string; role: string; expires_at: string; has_account: boolean }>(
    '/invitations/preview',
    { method: 'POST', body: JSON.stringify({ token }) },
  )
export const claimInvitation = (token: string, password: string) =>
  call<unknown>('/invitations/claim', { method: 'POST', body: JSON.stringify({ token, password }) })
export const acceptInvitation = (token: string) =>
  call<{ accepted: boolean; organization_name?: string }>('/invitations/accept', { method: 'POST', body: JSON.stringify({ token }) })

/** Human names for the roles the team list shows. */
export function roleLabel(member: TeamMember): string {
  if (member.organization_role === 'OWNER') return 'المالك'
  if (member.organization_role === 'ADMIN' || member.sector_role === 'ADMIN') return 'مدير'
  const c = member.construction_role
  if (c === 'ADMIN') return 'كامل الصلاحيات'
  if (c === 'PROCUREMENT') return 'مشتريات'
  if (c === 'MANAGEMENT') return 'مشاهدة'
  return c || 'عضو'
}
