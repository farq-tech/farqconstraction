import { expect, it } from 'vitest'
import type { BOQItem } from '../types'
import { mergeUploadPhotos } from './uploadPhotos'
const item = { id: 1, name: 'waterbar', qty: '30', unit: 'm', status: 'searching', supplierCount: 0, suppliers: [], specCard: { dimensions: '30 mm', reference_photo_url: 'https://example.com/old.jpg' } } as BOQItem
it('retains specifications while carrying a photo found during reading into matching results', () => {
  const [next] = mergeUploadPhotos([item], { waterbar: { reference_photo_url: 'https://example.com/new.jpg' } })
  expect(next.specCard?.dimensions).toBe('30 mm')
  expect(next.specCard?.reference_photo_url).toBe('https://example.com/new.jpg')
  expect(next.specCard?.reference_photos_reviewed).toBe(true)
})
it('a buyer deletion clears the old photo and prevents automatic replacement', () => {
  const [next] = mergeUploadPhotos([item], { waterbar: undefined })
  expect(next.specCard?.reference_photo_url).toBeUndefined()
  expect(next.specCard?.reference_photos_reviewed).toBe(true)
  expect(mergeUploadPhotos([item], {}).at(0)).toBe(item)
})
