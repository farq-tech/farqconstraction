/**
 * Local Taseer Haraj send: resolve seller id, open a chat, post the invite.
 * Runs in the Vite/Node process only — never Construction Production.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { offerLink, taseerSellerMessage } from '../taseerInvite'
import { getInvite, newToken, saveInvite, type TaseerInvite } from '../taseerStore'

function loadLocalEnv(): void {
  try {
    const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const eq = trimmed.indexOf('=')
      const key = trimmed.slice(0, eq)
      const value = trimmed.slice(eq + 1)
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    /* missing .env.local is reported as not configured */
  }
}

const FETCH_ADS_SEARCH = "query FetchAdsSearch($search: String!, $afterPostDate: Int, $afterUpdateDate: Int, $page: Int, $city: String, $onlyWithImage: Boolean, $onlyWithVideo: Boolean, $near: String, $tag: String, $id: [Int], $cities: [String], $tags: [String], $CarExtraInfo: CarExtraInfo, $hideShowRooms: Boolean, $authorUsername: String, $latest: Boolean, $priceRange: PriceRange, $limit: Int) { search( search: $search afterPostDate: $afterPostDate afterUpdateDate: $afterUpdateDate page: $page city: $city onlyWithImage: $onlyWithImage onlyWithVideo: $onlyWithVideo near: $near tag: $tag id: $id cities: $cities tags: $tags CarExtraInfo: $CarExtraInfo hideShowRooms: $hideShowRooms authorUsername: $authorUsername orderByPostId: $latest priceRange: $priceRange limit: $limit ) { __typename ...PostList } }\nfragment PostItem on Post { __typename id authorUsername authorId handler hasImage title URL icon city geoCity geoNeighborhood geoHash commentCount commentEnabled thumbURL bodyHTML bodyTEXT isPromoted imagesList tags postDate updateDate status hasVideo upRank downRank postType tagsFilters ...buyButtonFragment ...realEstateInfoFragment ...carInfoFragment ...priceFragment ...postNotesListFragment ...generalInfoFragment }\nfragment PostList on PostsList { __typename viewOptions { __typename mustLoginToView hasSellersList } items { __typename ...PostItem } pageInfo { __typename hasNextPage hasPreviousPage } }\nfragment buyButtonFragment on Post { __typename BuyButton { __typename canRequestWasataService Name Link StoreName isMakeOfferEnabled } }\nfragment carInfoFragment on Post { __typename carInfo { __typename carOrRelated condition fuel gear sellOrWaiver mileage is4DW periodicInspectionStatus Bank model } }\nfragment generalInfoFragment on Post { __typename generalInfo { __typename key value } }\nfragment postNotesListFragment on Post { __typename postNotesList { __typename iconName iconUrl note link } }\nfragment priceFragment on Post { __typename price { __typename inputPrice formattedPrice } }\nfragment realEstateInfoFragment on Post { __typename realEstateInfo { __typename re_AdvertiserType re_Direction re_StreetType re_AccommType re_IsKitchenIncluded re_IsFurnished re_IsDriverRoomAvilable re_IsMaidRoomAvilable re_IsFireRoomAvilable re_IsOutsideRoomAvilable re_IsCarGateAvilable re_IsElevatorAvilable re_IsParkingAvilable re_IsCellarIncludedAvilable re_IsGardenAvilable re_IsACIncludedAvilable re_IsPoolAvilable re_IsVolleyBallAvilable re_IsFootBallAvilable re_IsKidsGamesAvilable re_IsStairInsideAvilable re_IsYardAvilable re_IsBooked re_Area re_PropertyAge re_StreetWide re_RoomCount re_LivingRoomCount re_WCCount re_ApartmentCount re_CheckInDate re_CheckOutDate re_VillaCount re_PlanNum re_LandNum re_MachineCount re_PalmCount re_MeterPrice re_FloorNum re_REGA_Advertiser_registration_number re_REGA_Authorization_number re_VillaType re_IsOutdoorSessionsAvailable re_IsLivingRoomAvailable re_IsTransformerAvailable re_IsWCAvailable re_IsStageAvailable re_IsStorehouseAvailable re_IsWaterAvailable re_IsProtectoratesAvailable re_IsElectricityAvailable re_IsPrivateHallAvailable re_IsPrivateEntranceAvailable re_IsWorkersHouseAvailable re_IsTentHouseAvailable re_IsFoodHallAvailable re_IsTwoDepartment re_IsWaterTankAvailable re_IsPrivateHouseAvailable re_IsBridalDepartmentAvailable re_IsPlowAvailable re_IsGymAvailable re_IsWaterSprinklerAvailable re_TentCount re_WellsCount re_HallsCount re_FloorsCount re_TentHouseCount re_SessionsCount re_ShopsCount re_SupportDailyRentSystem re_SupportMonthlyRentSystem re_SupportYearlyRentSystem } }"

const CHAT = 'https://api-chat.haraj.com.sa'

function envReady(): { token: string; userId: string } | null {
  loadLocalEnv()
  const token = String(process.env.HARAJ_TOKEN || '').replace(/^Bearer\s+/i, '').trim()
  const userId = String(process.env.HARAJ_USER_ID || '').trim()
  if (!token || !/^[1-9]\d*$/.test(userId)) return null
  return { token, userId }
}

export function taseerSendConfigured(): boolean {
  return envReady() !== null
}

type SearchItem = { authorId?: number; authorUsername?: string; id?: number; title?: string }

async function fetchAdsSearch(token: string, variables: Record<string, unknown>): Promise<SearchItem[]> {
  const endpoint = String(process.env.HARAJ_APP_LOGIN_URL || 'https://ios.haraj.sa/').split('?')[0]
  const agent = String(process.env.HARAJ_APP_USER_AGENT || 'FarqTaseer/1.0')
  const res = await fetch(`${endpoint}?queryName=FetchAdsSearch`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      'user-agent': agent,
    },
    body: JSON.stringify({
      operationName: 'FetchAdsSearch',
      query: FETCH_ADS_SEARCH,
      variables: { page: 0, limit: 20, ...variables },
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) return []
  const body = (await res.json().catch(() => null)) as {
    data?: { search?: { items?: SearchItem[] } }
  }
  return Array.isArray(body?.data?.search?.items) ? body.data.search.items : []
}

function pickAuthor(items: SearchItem[], listing: RequestListing): { authorId?: string; authorUsername?: string } {
  const urlId = /\/(\d+)\//.exec(listing.url || '')?.[1]
  const ids = new Set([listing.postId, urlId].filter(Boolean) as string[])
  const item =
    items.find((row) => row.id != null && ids.has(String(row.id))) ||
    items.find((row) => listing.author && row.authorUsername === listing.author) ||
    items.find((row) => listing.title && row.title === listing.title) ||
    items[0]
  const authorId = item?.authorId != null ? String(item.authorId) : undefined
  return {
    authorId: authorId && /^[1-9]\d*$/.test(authorId) ? authorId : undefined,
    authorUsername: item?.authorUsername ? String(item.authorUsername) : listing.author,
  }
}

async function resolveAuthorId(listing: RequestListing, token: string): Promise<{ authorId?: string; authorUsername?: string }> {
  const urlId = /\/(\d+)\//.exec(listing.url || '')?.[1]
  const ids = [...new Set([listing.postId, urlId].filter(Boolean))] as string[]
  for (const raw of ids) {
    const id = Number(raw)
    if (!Number.isSafeInteger(id) || id <= 0) continue
    const hit = pickAuthor(await fetchAdsSearch(token, { search: String(id), id: [id], limit: 5 }), listing)
    if (hit.authorId) return hit
  }
  if (listing.author) {
    const hit = pickAuthor(
      await fetchAdsSearch(token, { search: listing.title || listing.author, authorUsername: listing.author, limit: 20 }),
      listing,
    )
    if (hit.authorId) return hit
  }
  if (listing.title) {
    return pickAuthor(await fetchAdsSearch(token, { search: listing.title, limit: 20 }), listing)
  }
  return { authorUsername: listing.author }
}

async function sendDm(userId: string, token: string, recipientId: string, text: string): Promise<string> {
  const WS = globalThis.WebSocket
  if (!WS) throw new Error('WS_UNAVAILABLE')
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    authorization: `Bearer ${token}`,
  }
  const topicRes = await fetch(`${CHAT}/chat/users/${userId}/topics`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: 'p2p', with_id: Number(recipientId) }),
    signal: AbortSignal.timeout(15_000),
    redirect: 'error',
  })
  if (!topicRes.ok) throw Object.assign(new Error('HARAJ_TOPIC_REFUSED'), { http_status: topicRes.status })
  const topicBody = (await topicRes.json()) as { status?: number; data?: { topic?: { topic_id?: string } } }
  const topicId = topicBody?.data?.topic?.topic_id
  if (!topicId) throw new Error('HARAJ_NO_TOPIC')

  const sessionId = await new Promise<string>((resolve, reject) => {
    const socket = new WS('wss://api-chat.haraj.com.sa/chat/ws')
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error('WS_TIMEOUT'))
    }, 12_000)
    const fail = () => {
      clearTimeout(timer)
      reject(new Error('WS_CONNECTION_FAILED'))
    }
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ auth: { id: 'authenticate socket', access_token: token } }))
    })
    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(String((event as MessageEvent).data)) as {
          id?: string
          status?: number
          data?: { session_id?: string }
        }
        if (payload.id !== 'authenticate socket') return
        clearTimeout(timer)
        const id = payload.data?.session_id
        socket.close()
        if (payload.status !== 200 || !id) reject(new Error('WS_SESSION_MISSING'))
        else resolve(id)
      } catch {
        /* ignore non-json */
      }
    })
    socket.addEventListener('error', fail)
    socket.addEventListener('close', () => {
      clearTimeout(timer)
    })
  })

  const msgRes = await fetch(`${CHAT}/chat/users/${userId}/topics/${topicId}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      content: { type: 'text/plain', payload: { text } },
      session_id: sessionId,
    }),
    signal: AbortSignal.timeout(15_000),
    redirect: 'error',
  })
  if (!msgRes.ok) throw Object.assign(new Error('HARAJ_MESSAGE_REFUSED'), { http_status: msgRes.status })
  const msgBody = (await msgRes.json()) as { data?: { message?: { seq_id?: string | number } } }
  const seq = msgBody?.data?.message?.seq_id
  if (seq == null) throw new Error('HARAJ_NO_MESSAGE_ID')
  return `${topicId}:${seq}`
}

export type RequestListing = {
  postId: string
  title: string
  url: string
  need: string
  author?: string
}

export async function createAndSendRequests(
  listings: RequestListing[],
  origin = 'http://127.0.0.1:5173',
): Promise<{ invites: TaseerInvite[]; preview: string }> {
  const creds = envReady()
  const chosen = listings
  if (!chosen.length) throw Object.assign(new Error('NO_LISTINGS'), { status: 400 })

  const invites: TaseerInvite[] = []
  let preview = ''
  for (const listing of chosen) {
    const token = newToken()
    const link = offerLink(token, origin)
    const message = taseerSellerMessage(listing.need, link)
    if (!preview) preview = message
    let invite: TaseerInvite = {
      token,
      need: listing.need,
      postId: listing.postId,
      listingTitle: listing.title,
      listingUrl: listing.url,
      authorUsername: listing.author,
      sellerName: listing.author,
      message,
      link,
      createdAt: new Date().toISOString(),
      sendStatus: 'pending',
    }
    invite = saveInvite(invite)
    if (!creds) {
      invite.sendStatus = 'failed'
      invite.sendError = 'HARAJ_NOT_CONFIGURED'
      saveInvite(invite)
      invites.push(invite)
      continue
    }
    try {
      const resolved = await resolveAuthorId(listing, creds.token)
      if (resolved.authorId) invite.authorId = resolved.authorId
      if (resolved.authorUsername) invite.authorUsername = resolved.authorUsername
      if (!invite.authorId) throw new Error('NO_AUTHOR_ID')
      await sendDm(creds.userId, creds.token, invite.authorId, message)
      invite.sendStatus = 'sent'
      invite.sentAt = new Date().toISOString()
    } catch (error) {
      invite.sendStatus = 'failed'
      invite.sendError = String(error).slice(0, 200)
    }
    saveInvite(invite)
    invites.push(getInvite(token) || invite)
  }
  return { invites, preview }
}

