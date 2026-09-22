/**
 * Public search-page parser. Fields are optional; a missing selector drops
 * that field instead of inventing a value. Rating is copied only when the
 * page publishes one — never inferred.
 */
import { normalize, toAsciiDigits } from './text'

export type HarajRating = {
  value: number
  count: number
  best: number
  worst: number
}

export type HarajListing = {
  postId: string
  url: string
  title: string
  body?: string
  city?: string
  author?: string
  price?: number
  currency?: string
  postedAt?: string
  images: string[]
  rating?: HarajRating
}

const DECODE_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
}

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&[a-z#0-9]+;/gi, (m) => DECODE_ENTITIES[m] ?? m)
}

function stripTags(s: string): string {
  return decode(s.replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseRelativeTime(text: string, now = Date.now()): string | undefined {
  const t = normalize(toAsciiDigits(text))
  if (!t) return undefined

  const DAY = 86_400_000
  if (/^(الان|قبل قليل|قبل لحظات)$/.test(t)) return new Date(now).toISOString()
  if (/^امس$/.test(t)) return new Date(now - DAY).toISOString()
  if (/^اول امس$/.test(t)) return new Date(now - 2 * DAY).toISOString()
  if (/^ال(اسبوع)\s*(الماضي|المنصرم)$/.test(t)) return new Date(now - 7 * DAY).toISOString()
  if (/^ال(شهر)\s*(الماضي|المنصرم)$/.test(t)) return new Date(now - 30 * DAY).toISOString()
  if (/^ال(سنه|عام)\s*(الماضي|الماضيه|المنصرم)$/.test(t)) return new Date(now - 365 * DAY).toISOString()

  const UNITS: { re: RegExp; ms: number }[] = [
    { re: /دقيق|دقاي/, ms: 60_000 },
    { re: /ساع/, ms: 3_600_000 },
    { re: /يوم|ايام/, ms: DAY },
    { re: /اسبوع|اسابيع/, ms: 7 * DAY },
    { re: /شهر|اشهر/, ms: 30 * DAY },
    { re: /سنه|سنوات|سنين|عام|اعوام/, ms: 365 * DAY },
  ]
  const unit = UNITS.find((u) => u.re.test(t))
  if (!unit) return undefined

  const digits = /(\d+)/.exec(t)
  const count = digits ? Number(digits[1]) : /(ين|ان)(\s|$)/.test(t) ? 2 : 1
  const ms = now - count * unit.ms
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined
}

function parsePrice(block: string): number | undefined {
  const m = /class="[^"]*tabular-nums[^"]*"[^>]*>([^<]+)</.exec(block)
  if (!m) return undefined
  const raw = toAsciiDigits(m[1]).replace(/[^\d.]/g, '')
  if (!raw) return undefined
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function findItemList(node: unknown, depth = 0): unknown[] | undefined {
  if (depth > 6 || node === null || typeof node !== 'object') return undefined
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findItemList(child, depth + 1)
      if (hit) return hit
    }
    return undefined
  }
  const record = node as Record<string, unknown>
  if (Array.isArray(record.itemListElement)) return record.itemListElement
  for (const value of Object.values(record)) {
    const hit = findItemList(value, depth + 1)
    if (hit) return hit
  }
  return undefined
}

type JsonLdExtras = {
  body?: string
  images: string[]
  price?: number
  currency?: string
  city?: string
  seller?: string
  rating?: HarajRating
}

function num(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

function readRating(raw: unknown): HarajRating | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const value = num(r.ratingValue)
  if (value === undefined) return undefined
  return {
    value,
    count: num(r.ratingCount) ?? 0,
    best: num(r.bestRating) ?? 5,
    worst: num(r.worstRating) ?? 1,
  }
}

function parseJsonLd(html: string): Map<string, JsonLdExtras> {
  const out = new Map<string, JsonLdExtras>()
  const blocks = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)
  for (const block of blocks) {
    let data: unknown
    try {
      data = JSON.parse(block[1])
    } catch {
      continue
    }
    const list = findItemList(data)
    if (!list) continue
    for (const entry of list) {
      const item = (entry as { item?: Record<string, unknown> })?.item
      const url = typeof item?.url === 'string' ? item.url : undefined
      if (!item || !url) continue
      const id = /\/(\d+)\//.exec(url)?.[1]
      if (!id) continue

      const images = Array.isArray(item.image)
        ? (item.image as unknown[]).filter((i): i is string => typeof i === 'string')
        : typeof item.image === 'string'
          ? [item.image]
          : []

      const offers = (item.offers ?? {}) as Record<string, unknown>
      const seller = (offers.seller ?? {}) as Record<string, unknown>
      const at = (offers.availableAtOrFrom ?? {}) as Record<string, unknown>

      out.set(id, {
        body: typeof item.description === 'string' ? item.description : undefined,
        images,
        price: num(offers.price),
        currency: typeof offers.priceCurrency === 'string' ? offers.priceCurrency : undefined,
        city: typeof at.name === 'string' ? at.name : undefined,
        seller: typeof seller.name === 'string' ? seller.name.replace(/\s+/g, ' ').trim() : undefined,
        rating: readRating(item.aggregateRating),
      })
    }
  }
  return out
}

export function parseHarajSearchHtml(html: string, now = Date.now()): HarajListing[] {
  const enrichment = parseJsonLd(html)
  const listings: HarajListing[] = []
  const seen = new Set<string>()

  const parts = html.split('data-testid="post-item"')
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i]
    const href =
      /data-testid="post-title-link"[^>]*href="([^"]+)"/.exec(block)?.[1] ??
      /href="(\/\d+\/[^"]*)"/.exec(block)?.[1]
    if (!href) continue
    const urlId = /\/(\d+)\//.exec(href)?.[1]
    if (!urlId || seen.has(urlId)) continue

    const titleHtml = /data-testid="post-title-link"[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/.exec(block)?.[1]
    const title = titleHtml ? stripTags(titleHtml) : ''
    if (!title) continue
    seen.add(urlId)

    const city = (() => {
      const m = /href="\/city\/([^"]+)"/.exec(block)
      return m ? decode(decodeURIComponent(m[1])) : undefined
    })()
    const author = /data-test-author="([^"]*)"/.exec(block)?.[1]
    const posted = /dir="rtl"[^>]*>([\s\S]{0,60}?)<\/span>/.exec(block)?.[1]
    const extra = enrichment.get(urlId)
    const inlineImage = /<img[^>]+src="([^"]+)"/.exec(block)?.[1]

    listings.push({
      postId: /data-test-postid="(\d+)"/.exec(block)?.[1] ?? urlId,
      url: `https://haraj.com.sa${href}`,
      title,
      body: extra?.body,
      city: extra?.city ?? city,
      author: extra?.seller ?? (author ? decode(author) : undefined),
      price: extra?.price ?? parsePrice(block),
      currency: extra?.currency,
      postedAt: posted ? parseRelativeTime(stripTags(posted), now) : undefined,
      images: extra?.images?.length ? extra.images : inlineImage ? [inlineImage] : [],
      rating: extra?.rating,
    })
  }

  return listings
}
