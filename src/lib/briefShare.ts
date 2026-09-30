import type { CompanyBrand } from './companyBranding'
import { buildExecutiveBrief, type BriefLine, type BriefProject, type ExecutiveBrief } from './executiveBrief'

/**
 * «رابط عام» for the executive brief: the whole comparison packed into the
 * link itself, so the page opens for anyone — no account, no API call.
 *
 * The data rides in the URL fragment (`#d=`), which browsers never send to a
 * server: it is not in Vercel's logs or the API's. Whoever holds the link sees
 * the prices and supplier names, so the link is the permission.
 */

type Offer = [supplier: number, unitPrice: number, tax: 0 | 1 | 2]
type Line = [name: string, quantity: number, uom: string, currency: string, offers: Offer[]]
type Snapshot = {
  v: 1
  /** When the snapshot was taken (ISO). */
  t: string
  b: CompanyBrand | null
  /** Supplier names; offers point into this list. */
  s: string[]
  p: Array<[title: string, lines: Line[]]>
  /** [prices set aside, lines set aside] as implausible. */
  x: [number, number]
}

export type SharedBrief = { brief: ExecutiveBrief; brand: CompanyBrand | null; takenAt: string }

const TAX_OUT: Record<string, 0 | 1 | 2> = { true: 1, false: 0, null: 2 }
const TAX_IN: Array<boolean | null> = [false, true, null]

export function toSnapshot(brief: ExecutiveBrief, brand: CompanyBrand | null, takenAt: string): Snapshot {
  const names: string[] = []
  const index = new Map<string, number>()
  const supplier = (id: string, name: string) => {
    if (!index.has(id)) {
      index.set(id, names.length)
      names.push(name)
    }
    return index.get(id)!
  }
  return {
    v: 1,
    t: takenAt,
    b: brand,
    s: names,
    p: brief.projects.map((p) => [
      p.title,
      p.lines.map((l): Line => [
        l.name,
        l.quantity,
        l.uom,
        l.currency,
        l.offers.map((o): Offer => [supplier(o.supplierId, o.supplierName), o.unitPrice, TAX_OUT[String(o.includesTax)] ?? 2]),
      ]),
    ]),
    x: [brief.excludedPrices, brief.excludedLines],
  }
}

export function fromSnapshot(s: Snapshot): SharedBrief {
  if (!s || s.v !== 1 || !Array.isArray(s.p) || !Array.isArray(s.s)) throw new Error('BRIEF_LINK_INVALID')
  const projects: BriefProject[] = s.p.map(([title, lines], pi) => ({
    rfqId: `p${pi}`,
    title: String(title),
    lines: lines
      .map(([name, quantity, uom, currency, offers], li): BriefLine | null => {
        const qty = Number(quantity) || 0
        const list = offers
          .map(([si, unitPrice, tax]) => ({
            supplierId: `s${si}`,
            supplierName: String(s.s[si] ?? 'مورد'),
            unitPrice: Number(unitPrice),
            lineTotal: Number(unitPrice) * qty,
            includesTax: TAX_IN[tax] ?? null,
          }))
          .filter((o) => Number.isFinite(o.unitPrice) && o.unitPrice > 0)
          .sort((a, b) => a.unitPrice - b.unitPrice)
        if (!list.length) return null
        const lowest = list[0]
        const highest = list[list.length - 1]
        return {
          rfqId: `p${pi}`,
          projectTitle: String(title),
          lineId: `p${pi}l${li}`,
          name: String(name),
          quantity: qty,
          uom: String(uom || ''),
          currency: String(currency || 'SAR'),
          offers: list,
          lowest,
          highest,
          spreadValue: list.length > 1 ? (highest.unitPrice - lowest.unitPrice) * qty : 0,
          spreadPercent: list.length > 1 ? Math.round((highest.unitPrice / lowest.unitPrice - 1) * 1000) / 10 : null,
          mixedTaxBasis: new Set(list.map((o) => String(o.includesTax))).size > 1,
          excluded: [],
          unreliable: false,
        }
      })
      .filter((l): l is BriefLine => l !== null),
  }))
  const brief = buildExecutiveBrief(projects)
  brief.excludedPrices = Number(s.x?.[0]) || 0
  brief.excludedLines = Number(s.x?.[1]) || 0
  return { brief, brand: s.b ?? null, takenAt: String(s.t || '') }
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}
async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

export async function encodeBrief(brief: ExecutiveBrief, brand: CompanyBrand | null, takenAt: string): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(toSnapshot(brief, brand, takenAt)))
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))
}

export async function decodeBrief(token: string): Promise<SharedBrief> {
  const json = await pipe(fromBase64Url(token), new DecompressionStream('deflate-raw'))
  return fromSnapshot(JSON.parse(new TextDecoder().decode(json)))
}

/** The public link: the app's own address, the view, and the data in the fragment. */
export function briefShareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/?view=brief-share#d=${token}`
}

/** The token in the current address, if any. */
export function briefTokenFromHash(hash: string): string | null {
  const m = /[#&]d=([A-Za-z0-9_-]+)/.exec(hash || '')
  return m ? m[1] : null
}
