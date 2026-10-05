/**
 * Who an outbound message is from, as the buyer reads it in the chat. The
 * colleague's display name when the API gives one; never a raw e-mail; and
 * the automated replies speak as «أحمد من فرق». Pure.
 */

export const TEAM_FALLBACK = 'فريق الشركة'
export const AUTOMATED_SENDER = 'أحمد من فرق'

const AUTOMATED_NAMES = new Set(['فرق', 'فرق للبناء', 'farq', 'farq bot', 'farq construction', 'رد آلي', 'رد آلي من فرق', 'رد الي من فرق', 'رد آلي - فرق', 'رد آلي — فرق'])

function looksLikeEmail(value: string): boolean {
  return /\S+@\S+/.test(value)
}

export function isAutomatedSenderName(name: string | null | undefined): boolean {
  const s = String(name ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  if (!s) return false
  if (AUTOMATED_NAMES.has(s)) return true
  return /^رد\s*[آا]لي/.test(s)
}

export function outboundSenderLabel(name: string | null | undefined): string {
  const s = String(name ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return TEAM_FALLBACK
  if (isAutomatedSenderName(s)) return AUTOMATED_SENDER
  if (looksLikeEmail(s)) return TEAM_FALLBACK
  return s
}
