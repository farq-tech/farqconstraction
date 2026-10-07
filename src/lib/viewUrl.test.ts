import { expect, it } from 'vitest'
import { viewUrl } from './viewUrl'

it('leaving a quote clears stale record and tab parameters', () => {
  expect(viewUrl('https://construction.farq.sa/?view=rfq&rfq=old&tab=quotes&supplier=x', 'settings')).toBe('/?view=settings')
})
it('keeps explicit request and thread identity in their own routes', () => {
  expect(viewUrl('https://construction.farq.sa/?view=settings', 'offers', { rfqId: 'r' })).toBe('/?view=rfq&rfq=r&tab=quotes')
  expect(viewUrl('https://construction.farq.sa/?rfq=old', 'inbox-thread', { threadId: 't' })).toBe('/?view=inbox&thread=t')
})
