/**
 * Local Taseer store (file on disk). Never Construction Production Postgres.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'

export type TaseerInvite = {
  token: string
  need: string
  postId: string
  listingTitle: string
  listingUrl: string
  authorUsername?: string
  authorId?: string
  sellerName?: string
  message: string
  link: string
  createdAt: string
  sentAt?: string
  sendStatus: 'pending' | 'sent' | 'failed'
  sendError?: string
  ratingValue?: number
  ratingCount?: number
  awardedAt?: string
}

export type TaseerOffer = {
  id: string
  token: string
  need: string
  amount?: string
  extraAmount?: string
  deliveryAmount?: string
  includesMaterials?: boolean
  includesAttendance?: boolean
  includesDelivery?: boolean
  appointment?: string
  notes?: string
  personName?: string
  personEmail?: string
  personPhone?: string
  submittedAt: string
}

export type TaseerMessage = {
  id: string
  token: string
  from: 'buyer' | 'seller' | 'system'
  text: string
  at: string
}

export type TaseerSupplier = {
  key: string
  authorId?: string
  authorUsername?: string
  name: string
  personName?: string
  personEmail?: string
  personPhone?: string
  firstSeenAt: string
  lastSeenAt: string
  offers: TaseerOffer[]
}

type StoreFile = {
  invites: TaseerInvite[]
  suppliers: TaseerSupplier[]
  messages: TaseerMessage[]
}

const FILE = join(process.env.TASEER_DATA_DIR || join(process.cwd(), '.data'), 'taseer-local.json')

function empty(): StoreFile {
  return { invites: [], suppliers: [], messages: [] }
}

function load(): StoreFile {
  try {
    if (!existsSync(FILE)) return empty()
    const parsed = JSON.parse(readFileSync(FILE, 'utf8')) as StoreFile
    return {
      invites: Array.isArray(parsed.invites) ? parsed.invites : [],
      suppliers: Array.isArray(parsed.suppliers) ? parsed.suppliers : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    }
  } catch {
    return empty()
  }
}

function save(data: StoreFile): void {
  mkdirSync(dirname(FILE), { recursive: true })
  writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8')
}

export function newToken(): string {
  return randomBytes(16).toString('hex')
}

export function saveInvite(invite: TaseerInvite): TaseerInvite {
  const data = load()
  const i = data.invites.findIndex((row) => row.token === invite.token)
  if (i >= 0) data.invites[i] = invite
  else data.invites.push(invite)
  save(data)
  return invite
}

export function getInvite(token: string): TaseerInvite | null {
  return load().invites.find((row) => row.token === token) || null
}

function supplierKey(input: { authorId?: string; authorUsername?: string; token?: string }): string {
  if (input.authorId && /^[1-9]\d*$/.test(input.authorId)) return `haraj:seller:${input.authorId}`
  if (input.authorUsername) return `haraj:user:${input.authorUsername.trim()}`
  if (input.token) return `taseer:token:${input.token}`
  throw new TypeError('no seller identity')
}

function findSupplier(data: StoreFile, input: { authorId?: string; authorUsername?: string; token?: string }): TaseerSupplier | undefined {
  if (input.authorId) {
    const hit = data.suppliers.find((s) => s.authorId === input.authorId || s.key === `haraj:seller:${input.authorId}`)
    if (hit) return hit
  }
  if (input.authorUsername) {
    const name = input.authorUsername.trim()
    const hit = data.suppliers.find((s) => s.authorUsername === name || s.key === `haraj:user:${name}`)
    if (hit) return hit
  }
  return undefined
}

export function submitOffer(input: {
  token: string
  amount?: string
  extraAmount?: string
  deliveryAmount?: string
  includesMaterials?: boolean
  includesAttendance?: boolean
  includesDelivery?: boolean
  appointment?: string
  notes?: string
  personName?: string
  personEmail?: string
  personPhone?: string
}): { supplier: TaseerSupplier; offer: TaseerOffer; priorOffers: number } {
  const data = load()
  const invite = data.invites.find((row) => row.token === input.token)
  if (!invite) throw Object.assign(new Error('INVITE_NOT_FOUND'), { code: 'INVITE_NOT_FOUND' })

  const now = new Date().toISOString()
  const identity = {
    authorId: invite.authorId,
    authorUsername: invite.authorUsername,
    token: invite.token,
  }
  let supplier = findSupplier(data, identity)
  const priorOffers = supplier?.offers.length ?? 0
  const name =
    input.personName?.trim() ||
    invite.sellerName?.trim() ||
    invite.authorUsername?.trim() ||
    'بائع'
  const offer: TaseerOffer = {
    id: newToken().slice(0, 16),
    token: invite.token,
    need: invite.need,
    amount: input.amount?.trim() || undefined,
    extraAmount: input.extraAmount?.trim() || undefined,
    deliveryAmount: input.deliveryAmount?.trim() || undefined,
    includesMaterials: input.includesMaterials,
    includesAttendance: input.includesAttendance,
    includesDelivery: input.includesDelivery,
    appointment: input.appointment?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    personName: input.personName?.trim() || undefined,
    personEmail: input.personEmail?.trim() || undefined,
    personPhone: input.personPhone?.trim() || undefined,
    submittedAt: now,
  }

  if (!supplier) {
    supplier = {
      key: supplierKey(identity),
      authorId: invite.authorId,
      authorUsername: invite.authorUsername,
      name,
      personName: offer.personName,
      personEmail: offer.personEmail,
      personPhone: offer.personPhone,
      firstSeenAt: now,
      lastSeenAt: now,
      offers: [offer],
    }
    data.suppliers.push(supplier)
  } else {
    supplier.name = name || supplier.name
    if (invite.authorId) supplier.authorId = invite.authorId
    if (invite.authorUsername) supplier.authorUsername = invite.authorUsername
    if (offer.personName) supplier.personName = offer.personName
    if (offer.personEmail) supplier.personEmail = offer.personEmail
    if (offer.personPhone) supplier.personPhone = offer.personPhone
    supplier.lastSeenAt = now
    supplier.offers.push(offer)
  }
  const parts = [
    offer.amount ? `السعر ${offer.amount}` : 'عرض بدون سعر',
    offer.includesMaterials === true ? 'يشمل المواد' : offer.includesMaterials === false ? 'بدون مواد' : '',
    offer.includesAttendance === true ? 'يشمل الحضور' : offer.includesAttendance === false ? 'بدون حضور' : '',
    offer.includesDelivery === true
      ? offer.deliveryAmount
        ? `يشمل التوصيل أو النقل (${offer.deliveryAmount})`
        : 'يشمل التوصيل أو النقل'
      : offer.includesDelivery === false
        ? 'بدون توصيل أو نقل'
        : '',
    offer.appointment ? `الموعد ${offer.appointment}` : '',
    offer.notes || '',
  ].filter(Boolean)
  data.messages.push({
    id: newToken().slice(0, 16),
    token: invite.token,
    from: 'seller',
    text: parts.join(' · '),
    at: now,
  })
  save(data)
  return { supplier, offer, priorOffers }
}

export function listInvites(): TaseerInvite[] {
  return load().invites.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function listSuppliers(): TaseerSupplier[] {
  return load().suppliers.slice().sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
}

export function getSupplier(key: string): TaseerSupplier | null {
  return load().suppliers.find((s) => s.key === key || s.authorId === key) || null
}

export function listNeeds(): Array<{ need: string; conversations: number; offers: number }> {
  const data = load()
  const map = new Map<string, { conversations: number; offers: number }>()
  for (const invite of data.invites) {
    const row = map.get(invite.need) || { conversations: 0, offers: 0 }
    row.conversations += 1
    row.offers += data.suppliers.reduce(
      (sum, s) => sum + s.offers.filter((o) => o.token === invite.token && o.amount).length,
      0,
    )
    map.set(invite.need, row)
  }
  return [...map.entries()].map(([need, row]) => ({ need, ...row }))
}

export function addMessage(input: { token: string; from: TaseerMessage['from']; text: string }): TaseerMessage {
  const data = load()
  if (!data.invites.some((row) => row.token === input.token)) {
    throw Object.assign(new Error('INVITE_NOT_FOUND'), { code: 'INVITE_NOT_FOUND' })
  }
  const message: TaseerMessage = {
    id: newToken().slice(0, 16),
    token: input.token,
    from: input.from,
    text: input.text.trim(),
    at: new Date().toISOString(),
  }
  data.messages.push(message)
  save(data)
  return message
}

export function listMessages(token: string): TaseerMessage[] {
  return load().messages.filter((row) => row.token === token).sort((a, b) => a.at.localeCompare(b.at))
}

export function awardInvite(token: string): TaseerInvite {
  const data = load()
  const invite = data.invites.find((row) => row.token === token)
  if (!invite) throw Object.assign(new Error('INVITE_NOT_FOUND'), { code: 'INVITE_NOT_FOUND' })
  invite.awardedAt = new Date().toISOString()
  data.messages.push({
    id: newToken().slice(0, 16),
    token,
    from: 'system',
    text: 'تم اختيار هذا العرض (ترسية).',
    at: invite.awardedAt,
  })
  save(data)
  return invite
}
