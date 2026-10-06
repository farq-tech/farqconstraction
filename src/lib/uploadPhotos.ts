import type { BOQItem } from '../types'
import type { SpecCard } from './specCard'

/** Merge only reviewed photo fields; the reader remains the source of specifications. */
export function mergeUploadPhotos(items: BOQItem[], photos: Record<string, SpecCard | undefined>): BOQItem[] {
  return items.map(item => {
    if (!Object.prototype.hasOwnProperty.call(photos, item.name)) return item
    const photo = photos[item.name]
    return { ...item, specCard: {
      ...item.specCard,
      reference_photos_reviewed: true,
      reference_photo_url: photo?.reference_photo_url,
      reference_photo_urls: photo?.reference_photo_urls,
    } }
  })
}
