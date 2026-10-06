import { afterEach, expect, it, vi } from 'vitest'
import { createPhotoLookup } from './referencePhotoSearch'
afterEach(() => vi.useRealTimers())
it('paces large booklets to six searches per minute and deduplicates repeated materials', async () => {
  vi.useFakeTimers(); vi.setSystemTime(0)
  const search = vi.fn(async q => ({ status: 'EMPTY' as const, query: q, cards: [] }))
  const lookup = createPhotoLookup(search)
  const first = lookup('pipe', () => true)
  expect(lookup('pipe', () => true)).toBe(first)
  for (let i=0;i<10;i++) lookup(`item ${i}`, () => true)
  await vi.advanceTimersByTimeAsync(60000)
  expect(search).toHaveBeenCalledTimes(6)
  await vi.runAllTimersAsync()
  expect(search).toHaveBeenCalledTimes(11)
})
it('does not search queued rows after the buyer leaves or removes their picture', async () => {
  vi.useFakeTimers()
  const search = vi.fn(async q => ({ status: 'EMPTY' as const, query: q, cards: [] }))
  const lookup = createPhotoLookup(search)
  const result = lookup('cancelled material', () => false)
  await vi.runAllTimersAsync()
  expect((await result).status).toBe('EMPTY')
  expect(search).not.toHaveBeenCalled()
})

it('an active remounted row keeps a deduplicated queued search alive', async () => {
  vi.useFakeTimers()
  const search = vi.fn(async q => ({ status: 'EMPTY' as const, query: q, cards: [] }))
  const lookup = createPhotoLookup(search)
  lookup('pipe', () => false)
  lookup('pipe', () => true)
  await vi.runAllTimersAsync()
  expect(search).toHaveBeenCalledTimes(1)
})
