import type { ConstructionInboxThreadMessage } from '../api/constructionClient'

/** Keep original timestamps; historical references are never new inbound replies. */
export function prewarmTimeline(
  current: ConstructionInboxThreadMessage[],
  historical: ConstructionInboxThreadMessage[] = [],
) {
  const messages = new Map<string, ConstructionInboxThreadMessage>(
    historical.map((message) => [
      message.id,
      { ...message, historical: true, unread: false, can_retry: false },
    ]),
  )
  for (const message of current) messages.set(message.id, message)
  return [...messages.values()].sort(
    (a, b) =>
      Date.parse(a.created_at || '') - Date.parse(b.created_at || '') ||
      a.id.localeCompare(b.id),
  )
}
