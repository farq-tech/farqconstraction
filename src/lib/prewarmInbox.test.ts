import { describe, expect, it } from 'vitest'
import type { ConstructionInboxThreadMessage } from '../api/constructionClient'
import { prewarmTimeline } from './prewarmInbox'
const message = (
  id: string,
  created_at: string,
): ConstructionInboxThreadMessage => ({
  id,
  direction: 'INBOUND',
  created_at,
  employee_name: 'Supplier',
  body_text: id,
  channel: 'EMAIL',
  state: 'RECEIVED',
})
describe('historical inbox references', () => {
  it('keeps original time and content, sorts live replies after historical evidence, and never marks historical evidence unread', () => {
    const old = message('old', '2026-10-04T17:17:00Z'),
      current = message('current', '2026-10-05T17:17:00Z')
    expect(prewarmTimeline([current], [old])).toEqual([
      { ...old, historical: true, unread: false, can_retry: false },
      current,
    ])
    expect(old.historical).toBeUndefined()
  })
  it('uses a single original message id and prefers current authorised history', () => {
    const old = message('same', '2026-10-04T17:17:00Z')
    expect(prewarmTimeline([old], [old])).toEqual([old])
  })
})
