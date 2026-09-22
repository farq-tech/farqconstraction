import snapshot from '../data/materialPriceSnapshot.json'

/** Public market-average feed. The bar and the page show these figures as Farq's index. */
const MARKET_PRICE_FEED = 'https://api.contractor.sa/functions/v1/price-index?view=summary'

export type MaterialQuote = {
  id: string
  name_ar: string
  category: string
  unit_ar: string
  display_order: number
  price: number
  monthly_change_pct: number | null
  annual_change_pct: number | null
}

export type MaterialPriceIndex = {
  updated: string
  materials: MaterialQuote[]
}

export const MATERIAL_GROUPS: Array<[string, string]> = [
  ['cement', 'إسمنت'],
  ['gypsum', 'جبس'],
  ['sand', 'رمل وبحص'],
  ['blocks', 'بلوك'],
  ['concrete', 'خرسانة'],
  ['iron', 'حديد'],
  ['electrical wire', 'أسلاك كهربائية'],
  ['electrical cable', 'كيابل كهربائية'],
  ['aluminum', 'ألمنيوم'],
  ['tiles', 'بلاط'],
  ['wood', 'خشب'],
]

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

const money = new Intl.NumberFormat('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatSar(value: number): string {
  return `${money.format(value)} ر.س`
}

export function formatChange(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '0.00%'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export function changeTone(value: number | null): 'up' | 'down' | 'flat' {
  if (value == null || value === 0) return 'flat'
  return value > 0 ? 'up' : 'down'
}

/** «يوليو 2026» from an ISO month. */
export function monthLabel(iso: string): string {
  const [year, month] = String(iso || '').split('-')
  const name = MONTHS[Number(month) - 1]
  return name && year ? `${name} ${year}` : iso
}

type FeedMaterial = {
  id?: string
  name_ar?: string
  category?: string
  unit_ar?: string
  display_order?: number
  latest?: {
    price?: number | null
    monthly_change_pct?: number | null
    annual_change_pct?: number | null
  } | null
}

function fromFeed(body: { meta?: { last_updated?: string }; materials?: FeedMaterial[] }): MaterialPriceIndex | null {
  const materials = (body.materials || [])
    .filter((item) => item.latest && item.latest.price != null && item.name_ar)
    .map((item) => ({
      id: String(item.id || item.name_ar),
      name_ar: String(item.name_ar),
      category: String(item.category || ''),
      unit_ar: String(item.unit_ar || ''),
      display_order: Number(item.display_order) || 0,
      price: Number(item.latest?.price),
      monthly_change_pct: item.latest?.monthly_change_pct ?? null,
      annual_change_pct: item.latest?.annual_change_pct ?? null,
    }))
    .sort((a, b) => a.display_order - b.display_order)
  if (!materials.length) return null
  return { updated: body.meta?.last_updated || snapshot.updated, materials }
}

function fromSnapshot(): MaterialPriceIndex {
  return {
    updated: snapshot.updated,
    materials: [...snapshot.materials].sort((a, b) => a.display_order - b.display_order),
  }
}

let pending: Promise<MaterialPriceIndex> | null = null

/** Live averages when the feed answers; the saved month when it does not. */
export function loadMaterialPrices(): Promise<MaterialPriceIndex> {
  if (!pending) {
    pending = fetch(MARKET_PRICE_FEED)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        const parsed = fromFeed(await res.json())
        if (!parsed) throw new Error('empty')
        return parsed
      })
      .catch(() => fromSnapshot())
  }
  return pending
}
