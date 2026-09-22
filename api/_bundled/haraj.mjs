// src/lib/harajPublic/text.ts
var ARABIC_INDIC = "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669";
var EXT_ARABIC_INDIC = "\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9";
var DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
function toAsciiDigits(input) {
  let out = "";
  for (const ch of input) {
    const ai = ARABIC_INDIC.indexOf(ch);
    if (ai >= 0) {
      out += String(ai);
      continue;
    }
    const pi = EXT_ARABIC_INDIC.indexOf(ch);
    if (pi >= 0) {
      out += String(pi);
      continue;
    }
    out += ch;
  }
  return out;
}
function normalize(input) {
  if (!input) return "";
  return toAsciiDigits(input).replace(DIACRITICS, "").replace(/ـ/g, "").replace(/[أإآٱ]/g, "\u0627").replace(/ى/g, "\u064A").replace(/ؤ/g, "\u0648").replace(/ئ/g, "\u064A").replace(/ة/g, "\u0647").toLowerCase().replace(/\s+/g, " ").trim();
}

// src/lib/harajPublic/parse.ts
var DECODE_ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " "
};
function decode(s) {
  return s.replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d))).replace(/&[a-z#0-9]+;/gi, (m) => DECODE_ENTITIES[m] ?? m);
}
function stripTags(s) {
  return decode(s.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
function parseRelativeTime(text, now = Date.now()) {
  const t = normalize(toAsciiDigits(text));
  if (!t) return void 0;
  const DAY = 864e5;
  if (/^(الان|قبل قليل|قبل لحظات)$/.test(t)) return new Date(now).toISOString();
  if (/^امس$/.test(t)) return new Date(now - DAY).toISOString();
  if (/^اول امس$/.test(t)) return new Date(now - 2 * DAY).toISOString();
  if (/^ال(اسبوع)\s*(الماضي|المنصرم)$/.test(t)) return new Date(now - 7 * DAY).toISOString();
  if (/^ال(شهر)\s*(الماضي|المنصرم)$/.test(t)) return new Date(now - 30 * DAY).toISOString();
  if (/^ال(سنه|عام)\s*(الماضي|الماضيه|المنصرم)$/.test(t)) return new Date(now - 365 * DAY).toISOString();
  const UNITS = [
    { re: /دقيق|دقاي/, ms: 6e4 },
    { re: /ساع/, ms: 36e5 },
    { re: /يوم|ايام/, ms: DAY },
    { re: /اسبوع|اسابيع/, ms: 7 * DAY },
    { re: /شهر|اشهر/, ms: 30 * DAY },
    { re: /سنه|سنوات|سنين|عام|اعوام/, ms: 365 * DAY }
  ];
  const unit = UNITS.find((u) => u.re.test(t));
  if (!unit) return void 0;
  const digits = /(\d+)/.exec(t);
  const count = digits ? Number(digits[1]) : /(ين|ان)(\s|$)/.test(t) ? 2 : 1;
  const ms = now - count * unit.ms;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : void 0;
}
function parsePrice(block) {
  const m = /class="[^"]*tabular-nums[^"]*"[^>]*>([^<]+)</.exec(block);
  if (!m) return void 0;
  const raw = toAsciiDigits(m[1]).replace(/[^\d.]/g, "");
  if (!raw) return void 0;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : void 0;
}
function findItemList(node, depth = 0) {
  if (depth > 6 || node === null || typeof node !== "object") return void 0;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findItemList(child, depth + 1);
      if (hit) return hit;
    }
    return void 0;
  }
  const record = node;
  if (Array.isArray(record.itemListElement)) return record.itemListElement;
  for (const value of Object.values(record)) {
    const hit = findItemList(value, depth + 1);
    if (hit) return hit;
  }
  return void 0;
}
function num(value) {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : void 0;
}
function readRating(raw) {
  if (!raw || typeof raw !== "object") return void 0;
  const r = raw;
  const value = num(r.ratingValue);
  if (value === void 0) return void 0;
  return {
    value,
    count: num(r.ratingCount) ?? 0,
    best: num(r.bestRating) ?? 5,
    worst: num(r.worstRating) ?? 1
  };
}
function parseJsonLd(html) {
  const out = /* @__PURE__ */ new Map();
  const blocks = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g);
  for (const block of blocks) {
    let data;
    try {
      data = JSON.parse(block[1]);
    } catch {
      continue;
    }
    const list = findItemList(data);
    if (!list) continue;
    for (const entry of list) {
      const item = entry?.item;
      const url = typeof item?.url === "string" ? item.url : void 0;
      if (!item || !url) continue;
      const id = /\/(\d+)\//.exec(url)?.[1];
      if (!id) continue;
      const images = Array.isArray(item.image) ? item.image.filter((i) => typeof i === "string") : typeof item.image === "string" ? [item.image] : [];
      const offers = item.offers ?? {};
      const seller = offers.seller ?? {};
      const at = offers.availableAtOrFrom ?? {};
      out.set(id, {
        body: typeof item.description === "string" ? item.description : void 0,
        images,
        price: num(offers.price),
        currency: typeof offers.priceCurrency === "string" ? offers.priceCurrency : void 0,
        city: typeof at.name === "string" ? at.name : void 0,
        seller: typeof seller.name === "string" ? seller.name.replace(/\s+/g, " ").trim() : void 0,
        rating: readRating(item.aggregateRating)
      });
    }
  }
  return out;
}
function parseHarajSearchHtml(html, now = Date.now()) {
  const enrichment = parseJsonLd(html);
  const listings = [];
  const seen = /* @__PURE__ */ new Set();
  const parts = html.split('data-testid="post-item"');
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    const href = /data-testid="post-title-link"[^>]*href="([^"]+)"/.exec(block)?.[1] ?? /href="(\/\d+\/[^"]*)"/.exec(block)?.[1];
    if (!href) continue;
    const urlId = /\/(\d+)\//.exec(href)?.[1];
    if (!urlId || seen.has(urlId)) continue;
    const titleHtml = /data-testid="post-title-link"[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/.exec(block)?.[1];
    const title = titleHtml ? stripTags(titleHtml) : "";
    if (!title) continue;
    seen.add(urlId);
    const city = (() => {
      const m = /href="\/city\/([^"]+)"/.exec(block);
      return m ? decode(decodeURIComponent(m[1])) : void 0;
    })();
    const author = /data-test-author="([^"]*)"/.exec(block)?.[1];
    const posted = /dir="rtl"[^>]*>([\s\S]{0,60}?)<\/span>/.exec(block)?.[1];
    const extra = enrichment.get(urlId);
    const inlineImage = /<img[^>]+src="([^"]+)"/.exec(block)?.[1];
    listings.push({
      postId: /data-test-postid="(\d+)"/.exec(block)?.[1] ?? urlId,
      url: `https://haraj.com.sa${href}`,
      title,
      body: extra?.body,
      city: extra?.city ?? city,
      author: extra?.seller ?? (author ? decode(author) : void 0),
      price: extra?.price ?? parsePrice(block),
      currency: extra?.currency,
      postedAt: posted ? parseRelativeTime(stripTags(posted), now) : void 0,
      images: extra?.images?.length ? extra.images : inlineImage ? [inlineImage] : [],
      rating: extra?.rating
    });
  }
  return listings;
}

// src/lib/harajPublic/fetch.ts
var BASE = "https://haraj.com.sa";
var USER_AGENT = "Mozilla/5.0 (compatible; FarqTaseerBot/1.0; +https://farq.sa) AppleWebKit/537.36 Chrome/120 Safari/537.36";
var CACHE_TTL_MS = 5 * 6e4;
var REQUEST_TIMEOUT_MS = 12e3;
var MAX_NEEDS = 4;
var MAX_PER_NEED = 8;
var cache = /* @__PURE__ */ new Map();
function searchUrl(query) {
  return `${BASE}/search/${encodeURIComponent(query.trim())}/`;
}
async function fetchOne(query) {
  const key = query.trim();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.listings;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(searchUrl(key), {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "ar,en;q=0.8"
      },
      redirect: "follow",
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`search responded ${res.status}`);
    const listings = parseHarajSearchHtml(await res.text());
    cache.set(key, { at: Date.now(), listings });
    return listings;
  } finally {
    clearTimeout(timer);
  }
}
async function handleHarajRequest(rawQueries, limit) {
  const queries = [...new Set(rawQueries.map((q) => q.trim()).filter(Boolean))].slice(0, MAX_NEEDS);
  if (!queries.length) {
    return { status: 400, body: { error: "missing query" } };
  }
  const per = Math.min(Math.max(limit, 1), MAX_PER_NEED);
  const groups = [];
  for (const query of queries) {
    try {
      const listings = (await fetchOne(query)).slice(0, per);
      groups.push({ query, listings });
    } catch (error) {
      groups.push({ query, listings: [], failure: String(error).slice(0, 200) });
    }
  }
  return { status: 200, body: { groups } };
}
export {
  handleHarajRequest,
  searchUrl
};
