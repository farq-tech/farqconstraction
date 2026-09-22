import type { HarajListing } from '../lib/harajPublic/parse'
import { MAX_NEEDS } from '../lib/needText'

export type NeedGroup = {
  query: string
  listings: HarajListing[]
  failure?: string
}

export async function searchNeedListings(needs: string[]): Promise<NeedGroup[]> {
  const queries = needs.map((n) => n.trim()).filter(Boolean).slice(0, MAX_NEEDS)
  if (!queries.length) return []
  const params = new URLSearchParams()
  for (const q of queries) params.append('q', q)
  params.set('limit', '8')
  const res = await fetch(`/api/haraj?${params.toString()}`)
  const data = (await res.json().catch(() => ({}))) as { groups?: NeedGroup[]; error?: string }
  if (!res.ok) throw new Error(data.error || `search ${res.status}`)
  return Array.isArray(data.groups) ? data.groups : []
}
