/**
 * Split a free-text need into separate searches.
 *
 * Individuals write a sequence («سباك و كهربائي ودرابزين زجاج»), not a BOQ.
 * Conjunctions and commas separate needs; spaces inside a need stay together.
 */
const SPLIT = /[،,]+|\s+و\s+|و(?=\S)/

export const MAX_NEEDS = 4

export function splitNeeds(raw: string): string[] {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of text.split(SPLIT)) {
    const need = part.trim()
    if (!need) continue
    const key = need.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(need)
    if (out.length >= MAX_NEEDS) break
  }
  return out
}
