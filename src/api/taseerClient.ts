import type { HarajListing } from '../lib/harajPublic/parse'

export async function requestPrices(
  items: Array<{ listing: HarajListing; need: string }>,
): Promise<{ preview: string; invites: Array<{ token: string; need: string; sendStatus: string; sendError?: string; link: string; message: string }> }> {
  const listings = items.map(({ listing, need }) => ({
    postId: listing.postId,
    title: listing.title,
    url: listing.url,
    need,
    author: listing.author,
  }))
  const res = await fetch('/api/taseer/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ listings, origin: window.location.origin }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `request ${res.status}`)
  return data
}

export async function fetchInvite(token: string) {
  const res = await fetch(`/api/taseer/invite/${encodeURIComponent(token)}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'not found')
  return data as { token: string; need: string; listingTitle: string; sellerName?: string }
}

export async function submitSellerOffer(body: {
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
}) {
  const res = await fetch('/api/taseer/offer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `offer ${res.status}`)
  return data as { priorOffers: number }
}

export async function fetchTaseerRequests() {
  const res = await fetch('/api/taseer/requests')
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `requests ${res.status}`)
  return (data.requests || []) as Array<{
    token: string
    need: string
    listingTitle: string
    sellerName: string
    authorId?: string
    sendStatus: string
    createdAt: string
    link: string
    offerCount: number
  }>
}

export async function fetchTaseerNeeds() {
  const res = await fetch('/api/taseer/needs')
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `needs ${res.status}`)
  return (data.needs || []) as Array<{ need: string; conversations: number; offers: number }>
}

export async function fetchTaseerNeed(need: string) {
  const res = await fetch(`/api/taseer/needs/${encodeURIComponent(need)}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `need ${res.status}`)
  return data as {
    need: string
    offerCount: number
    conversationCount: number
    conversations: Array<{
      token: string
      name: string
      listingTitle?: string
      replied: boolean
      price: number | null
      statusLabel: string
    }>
  }
}

export async function fetchTaseerCompare(need: string, filter = 'all') {
  const res = await fetch(`/api/taseer/compare?need=${encodeURIComponent(need)}&filter=${encodeURIComponent(filter)}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `compare ${res.status}`)
  return data as {
    need: string
    summary: {
      arrived: number
      cheapest: number | null
      cheapestComplete: number | null
      min: number | null
      max: number | null
      completeNote: string
    }
    rows: Array<{
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
      ratingValue: number | null
      ratingCount: number | null
      statusLabel: string
      history: Array<{ amount?: string; submittedAt: string }>
    }>
  }
}

export async function fetchTaseerChat(token: string) {
  const res = await fetch(`/api/taseer/chat/${encodeURIComponent(token)}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'not found')
  return data as {
    invite: { token: string; need: string; listingTitle: string; sellerName?: string; awardedAt?: string }
    supplier: {
      key: string
      name: string
      personPhone?: string
      offers: Array<{
        id: string
        amount?: string
        extraAmount?: string
        deliveryAmount?: string
        includesMaterials?: boolean
        includesAttendance?: boolean
        includesDelivery?: boolean
        appointment?: string
        notes?: string
        submittedAt: string
      }>
    } | null
    messages: Array<{ id: string; from: 'buyer' | 'seller' | 'system'; text: string; at: string }>
  }
}

export async function sendTaseerChat(token: string, text: string) {
  const res = await fetch('/api/taseer/message', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, text }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `message ${res.status}`)
  return data
}

export async function awardTaseerOffer(token: string) {
  const res = await fetch('/api/taseer/award', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `award ${res.status}`)
  return data
}

export async function fetchTaseerSuppliers() {
  const res = await fetch('/api/taseer/suppliers')
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `suppliers ${res.status}`)
  return data.suppliers as Array<{
    key: string
    name: string
    authorId?: string
    authorUsername?: string
    personName?: string
    personEmail?: string
    personPhone?: string
    lastSeenAt: string
    offerCount: number
  }>
}

export async function fetchTaseerSupplier(key: string) {
  const res = await fetch(`/api/taseer/suppliers/${encodeURIComponent(key)}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'not found')
  return data.supplier as {
    name: string
    authorId?: string
    authorUsername?: string
    personName?: string
    personEmail?: string
    personPhone?: string
    offers: Array<{ id: string; need: string; amount?: string; notes?: string; submittedAt: string }>
  }
}
