import { createAndSendRequests, taseerSendConfigured, type RequestListing } from './harajPublic/send'
import { applyCompareFilter, buildNeedComparison, type CompareFilter } from './taseerCompare'
import {
  addMessage,
  awardInvite,
  getInvite,
  getSupplier,
  listInvites,
  listMessages,
  listNeeds,
  listSuppliers,
  submitOffer,
} from './taseerStore'

async function readJson(req: { on?: Function } | null): Promise<unknown> {
  if (!req?.on) return {}
  const chunks: Buffer[] = []
  return await new Promise((resolve, reject) => {
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
      } catch {
        resolve({})
      }
    })
    req.on('error', reject)
  })
}

export async function handleTaseerRoute(
  method: string,
  url: URL,
  req: { on?: Function } | null,
): Promise<{ status: number; body: unknown }> {
  if (method === 'GET' && url.pathname === '/api/taseer/status') {
    return { status: 200, body: { sendConfigured: taseerSendConfigured() } }
  }
  if (method === 'GET' && url.pathname.startsWith('/api/taseer/invite/')) {
    const token = decodeURIComponent(url.pathname.slice('/api/taseer/invite/'.length))
    const invite = getInvite(token)
    if (!invite) return { status: 404, body: { error: 'INVITE_NOT_FOUND' } }
    return {
      status: 200,
      body: {
        token: invite.token,
        need: invite.need,
        listingTitle: invite.listingTitle,
        sellerName: invite.sellerName || invite.authorUsername,
      },
    }
  }
  if (method === 'GET' && url.pathname === '/api/taseer/requests') {
    const suppliers = listSuppliers()
    return {
      status: 200,
      body: {
        requests: listInvites().map((invite) => {
          const offerCount = suppliers.reduce(
            (sum, s) => sum + s.offers.filter((o) => o.token === invite.token).length,
            0,
          )
          return {
            token: invite.token,
            need: invite.need,
            listingTitle: invite.listingTitle,
            sellerName: invite.sellerName || invite.authorUsername || '',
            authorId: invite.authorId,
            sendStatus: invite.sendStatus,
            createdAt: invite.createdAt,
            link: invite.link,
            offerCount,
          }
        }),
      },
    }
  }
  if (method === 'GET' && url.pathname === '/api/taseer/needs') {
    return { status: 200, body: { needs: listNeeds() } }
  }
  if (method === 'GET' && url.pathname.startsWith('/api/taseer/needs/')) {
    const need = decodeURIComponent(url.pathname.slice('/api/taseer/needs/'.length))
    const built = buildNeedComparison(need, listInvites(), listSuppliers())
    return {
      status: 200,
      body: {
        need,
        conversations: built.rows.map((row) => ({
          token: row.token,
          name: row.name,
          listingTitle: row.listingTitle,
          replied: row.replied,
          price: row.price,
          statusLabel: row.statusLabel,
        })),
        offerCount: built.summary.arrived,
        conversationCount: built.rows.length,
      },
    }
  }
  if (method === 'GET' && url.pathname === '/api/taseer/compare') {
    const need = url.searchParams.get('need') || ''
    const filter = (url.searchParams.get('filter') || 'all') as CompareFilter
    const built = buildNeedComparison(need, listInvites(), listSuppliers())
    return {
      status: 200,
      body: {
        need,
        filter,
        summary: built.summary,
        rows: applyCompareFilter(built.rows, filter),
      },
    }
  }
  if (method === 'GET' && url.pathname.startsWith('/api/taseer/chat/')) {
    const token = decodeURIComponent(url.pathname.slice('/api/taseer/chat/'.length))
    const invite = getInvite(token)
    if (!invite) return { status: 404, body: { error: 'INVITE_NOT_FOUND' } }
    const supplier = listSuppliers().find((s) => s.offers.some((o) => o.token === token))
    return {
      status: 200,
      body: {
        invite: {
          token: invite.token,
          need: invite.need,
          listingTitle: invite.listingTitle,
          sellerName: supplier?.name || invite.sellerName || invite.authorUsername,
          awardedAt: invite.awardedAt,
        },
        supplier: supplier
          ? {
              key: supplier.key,
              name: supplier.name,
              personPhone: supplier.personPhone,
              offers: supplier.offers.filter((o) => o.token === token),
            }
          : null,
        messages: listMessages(token),
      },
    }
  }
  if (method === 'GET' && url.pathname === '/api/taseer/suppliers') {
    return {
      status: 200,
      body: {
        suppliers: listSuppliers().map((s) => ({
          key: s.key,
          name: s.name,
          authorId: s.authorId,
          authorUsername: s.authorUsername,
          personName: s.personName,
          personEmail: s.personEmail,
          personPhone: s.personPhone,
          firstSeenAt: s.firstSeenAt,
          lastSeenAt: s.lastSeenAt,
          offerCount: s.offers.length,
        })),
      },
    }
  }
  if (method === 'GET' && url.pathname.startsWith('/api/taseer/suppliers/')) {
    const key = decodeURIComponent(url.pathname.slice('/api/taseer/suppliers/'.length))
    const supplier = getSupplier(key)
    if (!supplier) return { status: 404, body: { error: 'NOT_FOUND' } }
    return { status: 200, body: { supplier } }
  }
  if (method === 'POST' && url.pathname === '/api/taseer/request') {
    const payload = (await readJson(req)) as { listings?: RequestListing[]; origin?: string }
    const listings = Array.isArray(payload.listings) ? payload.listings : []
    try {
      const result = await createAndSendRequests(listings, payload.origin || 'http://127.0.0.1:5173')
      return { status: 200, body: { ...result, sendConfigured: taseerSendConfigured() } }
    } catch (error) {
      return { status: 400, body: { error: String(error).slice(0, 200) } }
    }
  }
  if (method === 'POST' && url.pathname === '/api/taseer/offer') {
    const payload = (await readJson(req)) as {
      token?: string
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
    }
    if (!payload.token) return { status: 400, body: { error: 'missing token' } }
    try {
      const result = submitOffer({
        token: payload.token,
        amount: payload.amount,
        extraAmount: payload.extraAmount,
        deliveryAmount: payload.deliveryAmount,
        includesMaterials: payload.includesMaterials,
        includesAttendance: payload.includesAttendance,
        includesDelivery: payload.includesDelivery,
        appointment: payload.appointment,
        notes: payload.notes,
        personName: payload.personName,
        personEmail: payload.personEmail,
        personPhone: payload.personPhone,
      })
      return { status: 200, body: result }
    } catch (error) {
      const code = (error as { code?: string }).code
      return { status: code === 'INVITE_NOT_FOUND' ? 404 : 400, body: { error: String(error).slice(0, 200) } }
    }
  }
  if (method === 'POST' && url.pathname === '/api/taseer/message') {
    const payload = (await readJson(req)) as { token?: string; text?: string }
    if (!payload.token || !payload.text?.trim()) return { status: 400, body: { error: 'missing' } }
    try {
      return { status: 200, body: { message: addMessage({ token: payload.token, from: 'buyer', text: payload.text }) } }
    } catch (error) {
      const code = (error as { code?: string }).code
      return { status: code === 'INVITE_NOT_FOUND' ? 404 : 400, body: { error: String(error).slice(0, 200) } }
    }
  }
  if (method === 'POST' && url.pathname === '/api/taseer/award') {
    const payload = (await readJson(req)) as { token?: string }
    if (!payload.token) return { status: 400, body: { error: 'missing token' } }
    try {
      return { status: 200, body: { invite: awardInvite(payload.token) } }
    } catch (error) {
      const code = (error as { code?: string }).code
      return { status: code === 'INVITE_NOT_FOUND' ? 404 : 400, body: { error: String(error).slice(0, 200) } }
    }
  }
  return { status: 404, body: { error: 'not found' } }
}

/**
 * Local Taseer never talks to Construction Express/:3000. Home and the shell
 * still call `/_api/api/construction/rfqs` — answer those GETs with an empty
 * envelope so an unused Construction list is an empty state, not ECONNREFUSED.
 */
export function handleLocalConstructionRead(
  method: string,
  pathname: string,
): { status: number; body: unknown } | null {
  const path = pathname.replace(/^\/_api/, '') || '/'
  if (method !== 'GET' || !path.startsWith('/api/construction')) return null

  const envelope = (data: unknown) => ({ status: 200, body: { ok: true, data } })

  if (path === '/api/construction/rfqs') {
    return envelope({
      rfqs: [],
      summary: {
        sent_count: 0,
        supplier_count: 0,
        response_count: 0,
        awaiting_supplier_count: 0,
        opened_count: 0,
        expired_count: 0,
      },
    })
  }
  if (path === '/api/construction/inbox/messages') {
    return envelope({ messages: [], unread_count: 0, next_cursor: null })
  }
  if (path === '/api/construction/me') {
    return envelope({ user_id: null, scope_owner_user_id: null })
  }
  if (path === '/api/construction/status') {
    return envelope({ ok: true, mode: 'taseer-local' })
  }
  if (path === '/api/construction/inbox/status') {
    return envelope({ connected: false })
  }
  return envelope({})
}
