// src/lib/harajPublic/send.ts
import { readFileSync as readFileSync2 } from "node:fs";
import { resolve } from "node:path";

// src/lib/taseerInvite.ts
function offerLink(token, origin = "http://127.0.0.1:5173") {
  const base = origin.replace(/\/$/, "");
  return `${base}/s/${encodeURIComponent(token)}`;
}
function taseerSellerMessage(need, link) {
  const product = need.replace(/\s+/g, " ").trim();
  if (!product) throw new TypeError("need is required");
  if (!link.trim()) throw new TypeError("offer link is required");
  return [
    `\u0627\u0644\u0633\u0644\u0627\u0645 \u0639\u0644\u064A\u0643\u0645 \u0639\u0632\u064A\u0632\u064A \u0627\u0644\u0628\u0627\u0626\u0639 \u0644\u062F\u064A\u0646\u0627 \u0639\u0645\u064A\u0644 \u064A\u0631\u063A\u0628 \u0641\u064A : ${product} \u0641\u064A \u062D\u0627\u0644 \u062A\u0648\u0641\u0631\u0647\u0627 \u0627\u0644\u0631\u062C\u0627\u0621 \u0627\u0644\u0636\u063A\u0637 \u0639\u0644\u0649 \u0627\u0644\u0631\u0627\u0628\u0637 \u0627\u062F\u0646\u0627\u0647 \u0644\u062A\u0642\u062F\u064A\u0645 \u0627\u0644\u0639\u0631\u0636 \u0648\u0641\u064A \u062D\u0627\u0644 \u0639\u0646\u062F\u0643\u0645 \u0627\u0633\u062A\u0641\u0633\u0627\u0631 \u0627\u0644\u0631\u062C\u0627\u0621 \u0627\u0644\u0631\u062F \u0639\u0644\u0649 \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0648\u0633\u0648\u0641 \u064A\u062A\u0645 \u0627\u0644\u0631\u062F \u0639\u0644\u064A\u0643`,
    "",
    link.trim()
  ].join("\n");
}

// src/lib/taseerStore.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
var FILE = join(process.env.TASEER_DATA_DIR || join(process.cwd(), ".data"), "taseer-local.json");
function empty() {
  return { invites: [], suppliers: [], messages: [] };
}
function load() {
  try {
    if (!existsSync(FILE)) return empty();
    const parsed = JSON.parse(readFileSync(FILE, "utf8"));
    return {
      invites: Array.isArray(parsed.invites) ? parsed.invites : [],
      suppliers: Array.isArray(parsed.suppliers) ? parsed.suppliers : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : []
    };
  } catch {
    return empty();
  }
}
function save(data) {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(data, null, 2), "utf8");
}
function newToken() {
  return randomBytes(16).toString("hex");
}
function saveInvite(invite) {
  const data = load();
  const i = data.invites.findIndex((row) => row.token === invite.token);
  if (i >= 0) data.invites[i] = invite;
  else data.invites.push(invite);
  save(data);
  return invite;
}
function getInvite(token) {
  return load().invites.find((row) => row.token === token) || null;
}
function supplierKey(input) {
  if (input.authorId && /^[1-9]\d*$/.test(input.authorId)) return `haraj:seller:${input.authorId}`;
  if (input.authorUsername) return `haraj:user:${input.authorUsername.trim()}`;
  if (input.token) return `taseer:token:${input.token}`;
  throw new TypeError("no seller identity");
}
function findSupplier(data, input) {
  if (input.authorId) {
    const hit = data.suppliers.find((s) => s.authorId === input.authorId || s.key === `haraj:seller:${input.authorId}`);
    if (hit) return hit;
  }
  if (input.authorUsername) {
    const name = input.authorUsername.trim();
    const hit = data.suppliers.find((s) => s.authorUsername === name || s.key === `haraj:user:${name}`);
    if (hit) return hit;
  }
  return void 0;
}
function submitOffer(input) {
  const data = load();
  const invite = data.invites.find((row) => row.token === input.token);
  if (!invite) throw Object.assign(new Error("INVITE_NOT_FOUND"), { code: "INVITE_NOT_FOUND" });
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const identity = {
    authorId: invite.authorId,
    authorUsername: invite.authorUsername,
    token: invite.token
  };
  let supplier = findSupplier(data, identity);
  const priorOffers = supplier?.offers.length ?? 0;
  const name = input.personName?.trim() || invite.sellerName?.trim() || invite.authorUsername?.trim() || "\u0628\u0627\u0626\u0639";
  const offer = {
    id: newToken().slice(0, 16),
    token: invite.token,
    need: invite.need,
    amount: input.amount?.trim() || void 0,
    extraAmount: input.extraAmount?.trim() || void 0,
    deliveryAmount: input.deliveryAmount?.trim() || void 0,
    includesMaterials: input.includesMaterials,
    includesAttendance: input.includesAttendance,
    includesDelivery: input.includesDelivery,
    appointment: input.appointment?.trim() || void 0,
    notes: input.notes?.trim() || void 0,
    personName: input.personName?.trim() || void 0,
    personEmail: input.personEmail?.trim() || void 0,
    personPhone: input.personPhone?.trim() || void 0,
    submittedAt: now
  };
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
      offers: [offer]
    };
    data.suppliers.push(supplier);
  } else {
    supplier.name = name || supplier.name;
    if (invite.authorId) supplier.authorId = invite.authorId;
    if (invite.authorUsername) supplier.authorUsername = invite.authorUsername;
    if (offer.personName) supplier.personName = offer.personName;
    if (offer.personEmail) supplier.personEmail = offer.personEmail;
    if (offer.personPhone) supplier.personPhone = offer.personPhone;
    supplier.lastSeenAt = now;
    supplier.offers.push(offer);
  }
  const parts = [
    offer.amount ? `\u0627\u0644\u0633\u0639\u0631 ${offer.amount}` : "\u0639\u0631\u0636 \u0628\u062F\u0648\u0646 \u0633\u0639\u0631",
    offer.includesMaterials === true ? "\u064A\u0634\u0645\u0644 \u0627\u0644\u0645\u0648\u0627\u062F" : offer.includesMaterials === false ? "\u0628\u062F\u0648\u0646 \u0645\u0648\u0627\u062F" : "",
    offer.includesAttendance === true ? "\u064A\u0634\u0645\u0644 \u0627\u0644\u062D\u0636\u0648\u0631" : offer.includesAttendance === false ? "\u0628\u062F\u0648\u0646 \u062D\u0636\u0648\u0631" : "",
    offer.includesDelivery === true ? offer.deliveryAmount ? `\u064A\u0634\u0645\u0644 \u0627\u0644\u062A\u0648\u0635\u064A\u0644 \u0623\u0648 \u0627\u0644\u0646\u0642\u0644 (${offer.deliveryAmount})` : "\u064A\u0634\u0645\u0644 \u0627\u0644\u062A\u0648\u0635\u064A\u0644 \u0623\u0648 \u0627\u0644\u0646\u0642\u0644" : offer.includesDelivery === false ? "\u0628\u062F\u0648\u0646 \u062A\u0648\u0635\u064A\u0644 \u0623\u0648 \u0646\u0642\u0644" : "",
    offer.appointment ? `\u0627\u0644\u0645\u0648\u0639\u062F ${offer.appointment}` : "",
    offer.notes || ""
  ].filter(Boolean);
  data.messages.push({
    id: newToken().slice(0, 16),
    token: invite.token,
    from: "seller",
    text: parts.join(" \xB7 "),
    at: now
  });
  save(data);
  return { supplier, offer, priorOffers };
}
function listInvites() {
  return load().invites.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
function listSuppliers() {
  return load().suppliers.slice().sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}
function getSupplier(key) {
  return load().suppliers.find((s) => s.key === key || s.authorId === key) || null;
}
function listNeeds() {
  const data = load();
  const map = /* @__PURE__ */ new Map();
  for (const invite of data.invites) {
    const row = map.get(invite.need) || { conversations: 0, offers: 0 };
    row.conversations += 1;
    row.offers += data.suppliers.reduce(
      (sum, s) => sum + s.offers.filter((o) => o.token === invite.token && o.amount).length,
      0
    );
    map.set(invite.need, row);
  }
  return [...map.entries()].map(([need, row]) => ({ need, ...row }));
}
function addMessage(input) {
  const data = load();
  if (!data.invites.some((row) => row.token === input.token)) {
    throw Object.assign(new Error("INVITE_NOT_FOUND"), { code: "INVITE_NOT_FOUND" });
  }
  const message = {
    id: newToken().slice(0, 16),
    token: input.token,
    from: input.from,
    text: input.text.trim(),
    at: (/* @__PURE__ */ new Date()).toISOString()
  };
  data.messages.push(message);
  save(data);
  return message;
}
function listMessages(token) {
  return load().messages.filter((row) => row.token === token).sort((a, b) => a.at.localeCompare(b.at));
}
function awardInvite(token) {
  const data = load();
  const invite = data.invites.find((row) => row.token === token);
  if (!invite) throw Object.assign(new Error("INVITE_NOT_FOUND"), { code: "INVITE_NOT_FOUND" });
  invite.awardedAt = (/* @__PURE__ */ new Date()).toISOString();
  data.messages.push({
    id: newToken().slice(0, 16),
    token,
    from: "system",
    text: "\u062A\u0645 \u0627\u062E\u062A\u064A\u0627\u0631 \u0647\u0630\u0627 \u0627\u0644\u0639\u0631\u0636 (\u062A\u0631\u0633\u064A\u0629).",
    at: invite.awardedAt
  });
  save(data);
  return invite;
}

// src/lib/harajPublic/send.ts
function loadLocalEnv() {
  try {
    const text = readFileSync2(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const eq = trimmed.indexOf("=");
      const key = trimmed.slice(0, eq);
      const value = trimmed.slice(eq + 1);
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
  }
}
var FETCH_ADS_SEARCH = "query FetchAdsSearch($search: String!, $afterPostDate: Int, $afterUpdateDate: Int, $page: Int, $city: String, $onlyWithImage: Boolean, $onlyWithVideo: Boolean, $near: String, $tag: String, $id: [Int], $cities: [String], $tags: [String], $CarExtraInfo: CarExtraInfo, $hideShowRooms: Boolean, $authorUsername: String, $latest: Boolean, $priceRange: PriceRange, $limit: Int) { search( search: $search afterPostDate: $afterPostDate afterUpdateDate: $afterUpdateDate page: $page city: $city onlyWithImage: $onlyWithImage onlyWithVideo: $onlyWithVideo near: $near tag: $tag id: $id cities: $cities tags: $tags CarExtraInfo: $CarExtraInfo hideShowRooms: $hideShowRooms authorUsername: $authorUsername orderByPostId: $latest priceRange: $priceRange limit: $limit ) { __typename ...PostList } }\nfragment PostItem on Post { __typename id authorUsername authorId handler hasImage title URL icon city geoCity geoNeighborhood geoHash commentCount commentEnabled thumbURL bodyHTML bodyTEXT isPromoted imagesList tags postDate updateDate status hasVideo upRank downRank postType tagsFilters ...buyButtonFragment ...realEstateInfoFragment ...carInfoFragment ...priceFragment ...postNotesListFragment ...generalInfoFragment }\nfragment PostList on PostsList { __typename viewOptions { __typename mustLoginToView hasSellersList } items { __typename ...PostItem } pageInfo { __typename hasNextPage hasPreviousPage } }\nfragment buyButtonFragment on Post { __typename BuyButton { __typename canRequestWasataService Name Link StoreName isMakeOfferEnabled } }\nfragment carInfoFragment on Post { __typename carInfo { __typename carOrRelated condition fuel gear sellOrWaiver mileage is4DW periodicInspectionStatus Bank model } }\nfragment generalInfoFragment on Post { __typename generalInfo { __typename key value } }\nfragment postNotesListFragment on Post { __typename postNotesList { __typename iconName iconUrl note link } }\nfragment priceFragment on Post { __typename price { __typename inputPrice formattedPrice } }\nfragment realEstateInfoFragment on Post { __typename realEstateInfo { __typename re_AdvertiserType re_Direction re_StreetType re_AccommType re_IsKitchenIncluded re_IsFurnished re_IsDriverRoomAvilable re_IsMaidRoomAvilable re_IsFireRoomAvilable re_IsOutsideRoomAvilable re_IsCarGateAvilable re_IsElevatorAvilable re_IsParkingAvilable re_IsCellarIncludedAvilable re_IsGardenAvilable re_IsACIncludedAvilable re_IsPoolAvilable re_IsVolleyBallAvilable re_IsFootBallAvilable re_IsKidsGamesAvilable re_IsStairInsideAvilable re_IsYardAvilable re_IsBooked re_Area re_PropertyAge re_StreetWide re_RoomCount re_LivingRoomCount re_WCCount re_ApartmentCount re_CheckInDate re_CheckOutDate re_VillaCount re_PlanNum re_LandNum re_MachineCount re_PalmCount re_MeterPrice re_FloorNum re_REGA_Advertiser_registration_number re_REGA_Authorization_number re_VillaType re_IsOutdoorSessionsAvailable re_IsLivingRoomAvailable re_IsTransformerAvailable re_IsWCAvailable re_IsStageAvailable re_IsStorehouseAvailable re_IsWaterAvailable re_IsProtectoratesAvailable re_IsElectricityAvailable re_IsPrivateHallAvailable re_IsPrivateEntranceAvailable re_IsWorkersHouseAvailable re_IsTentHouseAvailable re_IsFoodHallAvailable re_IsTwoDepartment re_IsWaterTankAvailable re_IsPrivateHouseAvailable re_IsBridalDepartmentAvailable re_IsPlowAvailable re_IsGymAvailable re_IsWaterSprinklerAvailable re_TentCount re_WellsCount re_HallsCount re_FloorsCount re_TentHouseCount re_SessionsCount re_ShopsCount re_SupportDailyRentSystem re_SupportMonthlyRentSystem re_SupportYearlyRentSystem } }";
var CHAT = "https://api-chat.haraj.com.sa";
function envReady() {
  loadLocalEnv();
  const token = String(process.env.HARAJ_TOKEN || "").replace(/^Bearer\s+/i, "").trim();
  const userId = String(process.env.HARAJ_USER_ID || "").trim();
  if (!token || !/^[1-9]\d*$/.test(userId)) return null;
  return { token, userId };
}
function taseerSendConfigured() {
  return envReady() !== null;
}
async function fetchAdsSearch(token, variables) {
  const endpoint = String(process.env.HARAJ_APP_LOGIN_URL || "https://ios.haraj.sa/").split("?")[0];
  const agent = String(process.env.HARAJ_APP_USER_AGENT || "FarqTaseer/1.0");
  const res = await fetch(`${endpoint}?queryName=FetchAdsSearch`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "user-agent": agent
    },
    body: JSON.stringify({
      operationName: "FetchAdsSearch",
      query: FETCH_ADS_SEARCH,
      variables: { page: 0, limit: 20, ...variables }
    }),
    signal: AbortSignal.timeout(15e3)
  });
  if (!res.ok) return [];
  const body = await res.json().catch(() => null);
  return Array.isArray(body?.data?.search?.items) ? body.data.search.items : [];
}
function pickAuthor(items, listing) {
  const urlId = /\/(\d+)\//.exec(listing.url || "")?.[1];
  const ids = new Set([listing.postId, urlId].filter(Boolean));
  const item = items.find((row) => row.id != null && ids.has(String(row.id))) || items.find((row) => listing.author && row.authorUsername === listing.author) || items.find((row) => listing.title && row.title === listing.title) || items[0];
  const authorId = item?.authorId != null ? String(item.authorId) : void 0;
  return {
    authorId: authorId && /^[1-9]\d*$/.test(authorId) ? authorId : void 0,
    authorUsername: item?.authorUsername ? String(item.authorUsername) : listing.author
  };
}
async function resolveAuthorId(listing, token) {
  const urlId = /\/(\d+)\//.exec(listing.url || "")?.[1];
  const ids = [...new Set([listing.postId, urlId].filter(Boolean))];
  for (const raw of ids) {
    const id = Number(raw);
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    const hit = pickAuthor(await fetchAdsSearch(token, { search: String(id), id: [id], limit: 5 }), listing);
    if (hit.authorId) return hit;
  }
  if (listing.author) {
    const hit = pickAuthor(
      await fetchAdsSearch(token, { search: listing.title || listing.author, authorUsername: listing.author, limit: 20 }),
      listing
    );
    if (hit.authorId) return hit;
  }
  if (listing.title) {
    return pickAuthor(await fetchAdsSearch(token, { search: listing.title, limit: 20 }), listing);
  }
  return { authorUsername: listing.author };
}
async function sendDm(userId, token, recipientId, text) {
  const WS = globalThis.WebSocket;
  if (!WS) throw new Error("WS_UNAVAILABLE");
  const headers = {
    "content-type": "application/json; charset=utf-8",
    authorization: `Bearer ${token}`
  };
  const topicRes = await fetch(`${CHAT}/chat/users/${userId}/topics`, {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "p2p", with_id: Number(recipientId) }),
    signal: AbortSignal.timeout(15e3),
    redirect: "error"
  });
  if (!topicRes.ok) throw Object.assign(new Error("HARAJ_TOPIC_REFUSED"), { http_status: topicRes.status });
  const topicBody = await topicRes.json();
  const topicId = topicBody?.data?.topic?.topic_id;
  if (!topicId) throw new Error("HARAJ_NO_TOPIC");
  const sessionId = await new Promise((resolve2, reject) => {
    const socket = new WS("wss://api-chat.haraj.com.sa/chat/ws");
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("WS_TIMEOUT"));
    }, 12e3);
    const fail = () => {
      clearTimeout(timer);
      reject(new Error("WS_CONNECTION_FAILED"));
    };
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ auth: { id: "authenticate socket", access_token: token } }));
    });
    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(String(event.data));
        if (payload.id !== "authenticate socket") return;
        clearTimeout(timer);
        const id = payload.data?.session_id;
        socket.close();
        if (payload.status !== 200 || !id) reject(new Error("WS_SESSION_MISSING"));
        else resolve2(id);
      } catch {
      }
    });
    socket.addEventListener("error", fail);
    socket.addEventListener("close", () => {
      clearTimeout(timer);
    });
  });
  const msgRes = await fetch(`${CHAT}/chat/users/${userId}/topics/${topicId}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      content: { type: "text/plain", payload: { text } },
      session_id: sessionId
    }),
    signal: AbortSignal.timeout(15e3),
    redirect: "error"
  });
  if (!msgRes.ok) throw Object.assign(new Error("HARAJ_MESSAGE_REFUSED"), { http_status: msgRes.status });
  const msgBody = await msgRes.json();
  const seq = msgBody?.data?.message?.seq_id;
  if (seq == null) throw new Error("HARAJ_NO_MESSAGE_ID");
  return `${topicId}:${seq}`;
}
async function createAndSendRequests(listings, origin = "http://127.0.0.1:5173") {
  const creds = envReady();
  const chosen = listings;
  if (!chosen.length) throw Object.assign(new Error("NO_LISTINGS"), { status: 400 });
  const invites = [];
  let preview = "";
  for (const listing of chosen) {
    const token = newToken();
    const link = offerLink(token, origin);
    const message = taseerSellerMessage(listing.need, link);
    if (!preview) preview = message;
    let invite = {
      token,
      need: listing.need,
      postId: listing.postId,
      listingTitle: listing.title,
      listingUrl: listing.url,
      authorUsername: listing.author,
      sellerName: listing.author,
      message,
      link,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      sendStatus: "pending"
    };
    invite = saveInvite(invite);
    if (!creds) {
      invite.sendStatus = "failed";
      invite.sendError = "HARAJ_NOT_CONFIGURED";
      saveInvite(invite);
      invites.push(invite);
      continue;
    }
    try {
      const resolved = await resolveAuthorId(listing, creds.token);
      if (resolved.authorId) invite.authorId = resolved.authorId;
      if (resolved.authorUsername) invite.authorUsername = resolved.authorUsername;
      if (!invite.authorId) throw new Error("NO_AUTHOR_ID");
      await sendDm(creds.userId, creds.token, invite.authorId, message);
      invite.sendStatus = "sent";
      invite.sentAt = (/* @__PURE__ */ new Date()).toISOString();
    } catch (error) {
      invite.sendStatus = "failed";
      invite.sendError = String(error).slice(0, 200);
    }
    saveInvite(invite);
    invites.push(getInvite(token) || invite);
  }
  return { invites, preview };
}

// src/lib/taseerCompare.ts
var COMPLETE_NOTE = "\u0627\u0644\u062A\u0643\u0644\u0641\u0629 \u0627\u0644\u0645\u0643\u062A\u0645\u0644\u0629 = \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0645\u0630\u0643\u0648\u0631 + \u0623\u064A \u0645\u0628\u0644\u063A \u0625\u0636\u0627\u0641\u064A \u0623\u0648 \u062A\u0648\u0635\u064A\u0644 \u0645\u0643\u062A\u0648\u0628. \u0625\u0646 \u0643\u0627\u0646 \u0627\u0644\u062D\u0636\u0648\u0631 \u0623\u0648 \u0627\u0644\u0645\u0648\u0627\u062F \u0623\u0648 \u0627\u0644\u062A\u0648\u0635\u064A\u0644 \u0645\u0634\u0645\u0648\u0644\u0627\u064B \u0628\u0644\u0627 \u0631\u0633\u0648\u0645\u060C \u0644\u0627 \u0646\u0636\u064A\u0641 \u0631\u0633\u0645\u0627\u064B \u0645\u0646 \u0639\u0646\u062F\u0646\u0627.";
function parseMoney(raw) {
  if (!raw) return null;
  const ascii = raw.replace(/[٠-٩]/g, (d) => String("\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669".indexOf(d)));
  const match = ascii.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}
function parseAppointmentAt(raw, now = Date.now()) {
  if (!raw) return null;
  const text = raw.trim();
  const iso = Date.parse(text);
  if (Number.isFinite(iso)) return iso;
  if (/اليوم|الليله|الليلة/.test(text)) {
    const hm = /(\d{1,2})\s*[:.]\s*(\d{2})/.exec(text);
    const hour = hm ? Number(hm[1]) + (/م|مساء|pm/i.test(text) && Number(hm[1]) < 12 ? 12 : 0) : 19;
    const minute = hm ? Number(hm[2]) : 0;
    const d = new Date(now);
    d.setHours(hour, minute, 0, 0);
    return d.getTime();
  }
  if (/غدا|بكره|بكرة/.test(text)) return now + 864e5;
  return null;
}
function yesNo(value) {
  return value === true ? true : value === false ? false : void 0;
}
function isComplete(row) {
  return row.price != null && row.includesMaterials === true && row.includesAttendance === true;
}
function buildNeedComparison(need, invites, suppliers, now = Date.now()) {
  const forNeed = invites.filter((invite) => invite.need === need);
  const rows = forNeed.map((invite) => {
    const supplier = suppliers.find((s) => s.offers.some((o) => o.token === invite.token)) || suppliers.find((s) => s.authorUsername && s.authorUsername === invite.authorUsername);
    const history = (supplier?.offers || []).filter((o) => o.token === invite.token).slice().sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    const latest = history[history.length - 1];
    const price = parseMoney(latest?.amount);
    const extraAmount = parseMoney(latest?.extraAmount);
    const deliveryAmount = parseMoney(latest?.deliveryAmount);
    const finalCost = price == null ? null : price + (extraAmount ?? 0) + (deliveryAmount ?? 0);
    const awarded = Boolean(invite.awardedAt);
    const replied = Boolean(latest);
    const status = awarded ? "awarded" : price != null ? "priced" : "no-price";
    return {
      token: invite.token,
      supplierKey: supplier?.key || `taseer:token:${invite.token}`,
      name: supplier?.name || invite.sellerName || invite.authorUsername || "\u0628\u0627\u0626\u0639",
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
      ratingValue: typeof invite.ratingValue === "number" ? invite.ratingValue : null,
      ratingCount: typeof invite.ratingCount === "number" ? invite.ratingCount : null,
      status,
      statusLabel: awarded ? "\u062A\u0631\u0633\u064A\u0629" : price != null ? "\u0639\u0631\u0636 \u0645\u0624\u0643\u062F" : replied ? "\u0644\u0645 \u064A\u0631\u0633\u0644 \u0633\u0639\u0631\u064B\u0627" : "\u0644\u0645 \u064A\u0631\u062F",
      history: history.map((o) => ({ amount: o.amount, submittedAt: o.submittedAt })),
      latestOfferId: latest?.id,
      replied
    };
  });
  const priced = rows.map((r) => r.price).filter((n) => n != null);
  const complete = rows.filter(isComplete).map((r) => r.finalCost).filter((n) => n != null);
  const summary = {
    arrived: rows.filter((r) => r.price != null).length,
    cheapest: priced.length ? Math.min(...priced) : null,
    cheapestComplete: complete.length ? Math.min(...complete) : null,
    min: priced.length ? Math.min(...priced) : null,
    max: priced.length ? Math.max(...priced) : null,
    completeNote: COMPLETE_NOTE
  };
  return { need, rows, summary };
}
function valueScore(row) {
  let score = 0;
  if (row.finalCost != null) score -= row.finalCost;
  if (row.ratingValue != null) score += row.ratingValue * 20;
  if (row.appointmentAt != null) score -= row.appointmentAt / 1e9;
  if (row.includesMaterials === true) score += 15;
  if (row.includesAttendance === true) score += 15;
  if (row.includesDelivery === true) score += 15;
  return score;
}
function applyCompareFilter(rows, filter) {
  const copy = rows.slice();
  if (filter === "materials") return copy.filter((r) => r.includesMaterials === true);
  if (filter === "delivery") return copy.filter((r) => r.includesDelivery === true);
  if (filter === "cheapest") {
    return copy.sort((a, b) => {
      if (a.price == null && b.price == null) return 0;
      if (a.price == null) return 1;
      if (b.price == null) return -1;
      return a.price - b.price;
    });
  }
  if (filter === "fastest") {
    return copy.sort((a, b) => {
      if (a.appointmentAt == null && b.appointmentAt == null) return 0;
      if (a.appointmentAt == null) return 1;
      if (b.appointmentAt == null) return -1;
      return a.appointmentAt - b.appointmentAt;
    });
  }
  if (filter === "rating") {
    return copy.sort((a, b) => {
      if (a.ratingValue == null && b.ratingValue == null) return 0;
      if (a.ratingValue == null) return 1;
      if (b.ratingValue == null) return -1;
      return b.ratingValue - a.ratingValue;
    });
  }
  return copy.sort((a, b) => valueScore(b) - valueScore(a));
}

// src/lib/taseerApi.ts
async function readJson(req) {
  if (!req?.on) return {};
  const chunks = [];
  return await new Promise((resolve2, reject) => {
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve2(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        resolve2({});
      }
    });
    req.on("error", reject);
  });
}
async function handleTaseerRoute(method, url, req) {
  if (method === "GET" && url.pathname === "/api/taseer/status") {
    return { status: 200, body: { sendConfigured: taseerSendConfigured() } };
  }
  if (method === "GET" && url.pathname.startsWith("/api/taseer/invite/")) {
    const token = decodeURIComponent(url.pathname.slice("/api/taseer/invite/".length));
    const invite = getInvite(token);
    if (!invite) return { status: 404, body: { error: "INVITE_NOT_FOUND" } };
    return {
      status: 200,
      body: {
        token: invite.token,
        need: invite.need,
        listingTitle: invite.listingTitle,
        sellerName: invite.sellerName || invite.authorUsername
      }
    };
  }
  if (method === "GET" && url.pathname === "/api/taseer/requests") {
    const suppliers = listSuppliers();
    return {
      status: 200,
      body: {
        requests: listInvites().map((invite) => {
          const offerCount = suppliers.reduce(
            (sum, s) => sum + s.offers.filter((o) => o.token === invite.token).length,
            0
          );
          return {
            token: invite.token,
            need: invite.need,
            listingTitle: invite.listingTitle,
            sellerName: invite.sellerName || invite.authorUsername || "",
            authorId: invite.authorId,
            sendStatus: invite.sendStatus,
            createdAt: invite.createdAt,
            link: invite.link,
            offerCount
          };
        })
      }
    };
  }
  if (method === "GET" && url.pathname === "/api/taseer/needs") {
    return { status: 200, body: { needs: listNeeds() } };
  }
  if (method === "GET" && url.pathname.startsWith("/api/taseer/needs/")) {
    const need = decodeURIComponent(url.pathname.slice("/api/taseer/needs/".length));
    const built = buildNeedComparison(need, listInvites(), listSuppliers());
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
          statusLabel: row.statusLabel
        })),
        offerCount: built.summary.arrived,
        conversationCount: built.rows.length
      }
    };
  }
  if (method === "GET" && url.pathname === "/api/taseer/compare") {
    const need = url.searchParams.get("need") || "";
    const filter = url.searchParams.get("filter") || "all";
    const built = buildNeedComparison(need, listInvites(), listSuppliers());
    return {
      status: 200,
      body: {
        need,
        filter,
        summary: built.summary,
        rows: applyCompareFilter(built.rows, filter)
      }
    };
  }
  if (method === "GET" && url.pathname.startsWith("/api/taseer/chat/")) {
    const token = decodeURIComponent(url.pathname.slice("/api/taseer/chat/".length));
    const invite = getInvite(token);
    if (!invite) return { status: 404, body: { error: "INVITE_NOT_FOUND" } };
    const supplier = listSuppliers().find((s) => s.offers.some((o) => o.token === token));
    return {
      status: 200,
      body: {
        invite: {
          token: invite.token,
          need: invite.need,
          listingTitle: invite.listingTitle,
          sellerName: supplier?.name || invite.sellerName || invite.authorUsername,
          awardedAt: invite.awardedAt
        },
        supplier: supplier ? {
          key: supplier.key,
          name: supplier.name,
          personPhone: supplier.personPhone,
          offers: supplier.offers.filter((o) => o.token === token)
        } : null,
        messages: listMessages(token)
      }
    };
  }
  if (method === "GET" && url.pathname === "/api/taseer/suppliers") {
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
          offerCount: s.offers.length
        }))
      }
    };
  }
  if (method === "GET" && url.pathname.startsWith("/api/taseer/suppliers/")) {
    const key = decodeURIComponent(url.pathname.slice("/api/taseer/suppliers/".length));
    const supplier = getSupplier(key);
    if (!supplier) return { status: 404, body: { error: "NOT_FOUND" } };
    return { status: 200, body: { supplier } };
  }
  if (method === "POST" && url.pathname === "/api/taseer/request") {
    const payload = await readJson(req);
    const listings = Array.isArray(payload.listings) ? payload.listings : [];
    try {
      const result = await createAndSendRequests(listings, payload.origin || "http://127.0.0.1:5173");
      return { status: 200, body: { ...result, sendConfigured: taseerSendConfigured() } };
    } catch (error) {
      return { status: 400, body: { error: String(error).slice(0, 200) } };
    }
  }
  if (method === "POST" && url.pathname === "/api/taseer/offer") {
    const payload = await readJson(req);
    if (!payload.token) return { status: 400, body: { error: "missing token" } };
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
        personPhone: payload.personPhone
      });
      return { status: 200, body: result };
    } catch (error) {
      const code = error.code;
      return { status: code === "INVITE_NOT_FOUND" ? 404 : 400, body: { error: String(error).slice(0, 200) } };
    }
  }
  if (method === "POST" && url.pathname === "/api/taseer/message") {
    const payload = await readJson(req);
    if (!payload.token || !payload.text?.trim()) return { status: 400, body: { error: "missing" } };
    try {
      return { status: 200, body: { message: addMessage({ token: payload.token, from: "buyer", text: payload.text }) } };
    } catch (error) {
      const code = error.code;
      return { status: code === "INVITE_NOT_FOUND" ? 404 : 400, body: { error: String(error).slice(0, 200) } };
    }
  }
  if (method === "POST" && url.pathname === "/api/taseer/award") {
    const payload = await readJson(req);
    if (!payload.token) return { status: 400, body: { error: "missing token" } };
    try {
      return { status: 200, body: { invite: awardInvite(payload.token) } };
    } catch (error) {
      const code = error.code;
      return { status: code === "INVITE_NOT_FOUND" ? 404 : 400, body: { error: String(error).slice(0, 200) } };
    }
  }
  return { status: 404, body: { error: "not found" } };
}
function handleLocalConstructionRead(method, pathname) {
  const path = pathname.replace(/^\/_api/, "") || "/";
  if (method !== "GET" || !path.startsWith("/api/construction")) return null;
  const envelope = (data) => ({ status: 200, body: { ok: true, data } });
  if (path === "/api/construction/rfqs") {
    return envelope({
      rfqs: [],
      summary: {
        sent_count: 0,
        supplier_count: 0,
        response_count: 0,
        awaiting_supplier_count: 0,
        opened_count: 0,
        expired_count: 0
      }
    });
  }
  if (path === "/api/construction/inbox/messages") {
    return envelope({ messages: [], unread_count: 0, next_cursor: null });
  }
  if (path === "/api/construction/me") {
    return envelope({ user_id: null, scope_owner_user_id: null });
  }
  if (path === "/api/construction/status") {
    return envelope({ ok: true, mode: "taseer-local" });
  }
  if (path === "/api/construction/inbox/status") {
    return envelope({ connected: false });
  }
  return envelope({});
}
export {
  handleLocalConstructionRead,
  handleTaseerRoute
};
