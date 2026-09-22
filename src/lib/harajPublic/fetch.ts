/**
 * Read-only public search. No login, no DMs, no inbox. Cached and rate-limited.
 */
import { parseHarajSearchHtml, type HarajListing } from './parse'

const BASE = 'https://haraj.com.sa'
const USER_AGENT =
  'Mozilla/5.0 (compatible; FarqTaseerBot/1.0; +https://farq.sa) AppleWebKit/537.36 Chrome/120 Safari/537.36'
const CACHE_TTL_MS = 5 * 60_000
const REQUEST_TIMEOUT_MS = 12_000
const MAX_NEEDS = 4
const MAX_PER_NEED = 8

type CacheEntry = { at: number; listings: HarajListing[] }

const cache = new Map<string, CacheEntry>()

export function searchUrl(query: string): string {
  return `${BASE}/search/${encodeURIComponent(query.trim())}/`
}

async function fetchOne(query: string): Promise<HarajListing[]> {
  const key = query.trim()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.listings

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(searchUrl(key), {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'ar,en;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`search responded ${res.status}`)
    const listings = parseHarajSearchHtml(await res.text())
    cache.set(key, { at: Date.now(), listings })
    return listings
  } finally {
    clearTimeout(timer)
  }
}

export type NeedSearchGroup = {
  query: string
  listings: HarajListing[]
  failure?: string
}

export async function handleHarajRequest(
  rawQueries: string[],
  limit: number,
): Promise<{ status: number; body: unknown }> {
  const queries = [...new Set(rawQueries.map((q) => q.trim()).filter(Boolean))].slice(0, MAX_NEEDS)
  if (!queries.length) {
    return { status: 400, body: { error: 'missing query' } }
  }
  const per = Math.min(Math.max(limit, 1), MAX_PER_NEED)
  const groups: NeedSearchGroup[] = []
  for (const query of queries) {
    try {
      const listings = (await fetchOne(query)).slice(0, per)
      groups.push({ query, listings })
    } catch (error) {
      groups.push({ query, listings: [], failure: String(error).slice(0, 200) })
    }
  }
  return { status: 200, body: { groups } }
}
