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
it('skips broken and duplicate image URLs before choosing a working alternative', async () => {
  const { pickLoadablePhoto } = await import('./referencePhotoSearch')
  const cards = [{image_url:'https://example.com/broken.png'}, {image_url:'https://example.com/broken.png'}, {image_url:'https://example.com/works.png'}] as Parameters<typeof pickLoadablePhoto>[0]
  const probe = vi.fn(async url => url.endsWith('works.png'))
  expect(await pickLoadablePhoto(cards, () => true, probe)).toBe(cards[2])
  expect(probe).toHaveBeenCalledTimes(2)
})
it('does not save a proposed picture after the buyer edits or leaves the row', async () => {
  const { pickLoadablePhoto } = await import('./referencePhotoSearch')
  let active = true
  const cards = [{image_url:'https://example.com/works.png'}] as Parameters<typeof pickLoadablePhoto>[0]
  expect(await pickLoadablePhoto(cards, () => active, async () => { active = false; return true })).toBeUndefined()
})
it('bounds failed image probes to three distinct results', async () => {
  const { pickLoadablePhoto } = await import('./referencePhotoSearch')
  const cards = Array.from({length:8},(_,i)=>({image_url:`https://example.com/${i}.png`})) as Parameters<typeof pickLoadablePhoto>[0]
  const probe = vi.fn(async () => false)
  expect(await pickLoadablePhoto(cards, () => true, probe)).toBeUndefined()
  expect(probe).toHaveBeenCalledTimes(3)
})
