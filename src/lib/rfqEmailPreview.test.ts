import { describe, expect, it } from 'vitest'
import { buildRfqEmailPreview, rfqLineLabel } from './rfqEmailPreview'
import { buildRfqLinesFromItems, buildRfqPackagesFromSelection } from './rfqPackages'
import type { BOQItem } from '../types'

/**
 * The ten PPE lines from RFQ ELE-RFQ-51D17AF6. Every one of them was relabelled
 * «ألواح أو إس بي» (an OSB wood panel) because the catalog name won over the
 * booklet's own text and the email body deduplicated on that name — which
 * collapsed ten distinct rows into one and sent PPE to a tools supplier.
 *
 * The first four descriptions are verbatim from the inbox agent's
 * `original_name` trace; the rest are same-class PPE from the same booklet.
 * None of them has a catalog match, which is the whole point: an unmatched line
 * is now sent under its own name instead of being dropped or renamed.
 */
const PPE_LINES = [
  'قبعة حماية',
  'بدلة مقاومة للهب',
  'جزمة PVC',
  'مريلة جلدية',
  'قفازات جلدية',
  'واقي سمع',
  'نظارة أمان',
  'كمامة نصف وجه',
  'حزام أمان للسقوط',
  'سديري عاكس',
]

/** What SendModal now puts on the wire for an unmatched line. */
const asSentLine = (name: string, index: number) => ({
  line_key: `line-${index + 1}`,
  farq_spec_id: undefined, // no catalog match, and that is allowed now
  name_ar: name,
  original_name: name,
  quantity: 10,
  uom: 'عدد',
})

const preview = (lines: Array<Record<string, unknown>>) =>
  buildRfqEmailPreview({
    rfqId: 'ELE-RFQ-51D17AF6',
    supplierName: 'AP Tools',
    recipientEmail: 'sales@example.com',
    engineeringDepartment: 'ELECTRICAL',
    buyerCompany: 'فرق تسعير',
    lines: lines as never,
  })

describe('Taseer identity on the invite', () => {
  it('never prints a payment-company lockup', () => {
    const p = preview(PPE_LINES.map(asSentLine))
    expect(p.html).toContain('فارك تكنولوجي')
    expect(p.html).not.toMatch(/شركة الدفع|aldafe/i)
    const aldafe = buildRfqEmailPreview({
      rfqId: 'X',
      buyerCompany: 'شركة الدفع للتجارة والمقاولات',
      lines: [{ original_name: 'سباك' }],
    })
    expect(aldafe.html).toContain('فرق تسعير')
    expect(aldafe.html).not.toMatch(/شركة الدفع/)
    expect(aldafe.subject).not.toMatch(/شركة الدفع/)
  })
})

describe('an unmatched line is sent under its own name', () => {
  it('renders ten distinct PPE rows with their real descriptions', () => {
    const p = preview(PPE_LINES.map(asSentLine))
    for (const name of PPE_LINES) {
      expect(p.html).toContain(name)
      expect(p.text.length).toBeGreaterThan(0)
    }
    // Ten rows in the item table, one per line — no collapsing.
    expect(p.html.match(/<tr>/g)).toHaveLength(10)
  })

  it('never renders OSB or any wood panel for a PPE line', () => {
    const p = preview(PPE_LINES.map(asSentLine))
    expect(p.html).not.toMatch(/أو إس بي|او اس بي|OSB/i)
    expect(p.html).not.toMatch(/ألواح خشب|لوح خشبي/)
  })

  it('the body list keeps ten entries instead of collapsing to one', () => {
    const p = preview(PPE_LINES.map(asSentLine))
    // The regression: deduping on the catalog name left a single «ألواح أو إس بي».
    for (const name of PPE_LINES) expect(p.html).toContain(name)
    const bodyNames = PPE_LINES.filter((n) => p.html.includes(n))
    expect(bodyNames).toHaveLength(10)
  })

  it('a catalog name can no longer overwrite the line description', () => {
    // Exactly the production shape: real PPE text + the wrong OSB catalog name.
    const clobbered = PPE_LINES.map((name, i) => ({
      ...asSentLine(name, i),
      farq_spec_id: 'FARQ-OSB-001',
      name_ar: 'ألواح أو إس بي',
    }))
    const p = preview(clobbered)
    expect(p.html).not.toMatch(/أو إس بي/)
    for (const name of PPE_LINES) expect(p.html).toContain(name)
    expect(p.html.match(/<tr>/g)).toHaveLength(10)
  })

  it('still dedupes lines that genuinely are the same item', () => {
    const repeated = ['قبعة حماية', 'قبعة حماية', 'جزمة PVC'].map(asSentLine)
    const p = preview(repeated)
    // Table keeps every line; the prose list names the item once.
    expect(p.html.match(/<tr>/g)).toHaveLength(3)
    const bodyStart = p.html.indexOf('white-space:pre-line')
    const body = p.html.slice(bodyStart, p.html.indexOf('</span>', bodyStart))
    expect(body.match(/قبعة حماية/g)).toHaveLength(1)
  })
})

describe('rfqLineLabel precedence', () => {
  it('prefers the line description over the catalog name', () => {
    expect(rfqLineLabel({ original_name: 'قبعة حماية', name_ar: 'ألواح أو إس بي' })).toBe(
      'قبعة حماية',
    )
  })

  it('falls back to the catalog name only when the line has no text', () => {
    expect(rfqLineLabel({ name_ar: 'ألواح أو إس بي' })).toBe('ألواح أو إس بي')
    expect(rfqLineLabel({ farq_spec_id: 'FARQ-1' })).toBe('FARQ-1')
    expect(rfqLineLabel({})).toBe('—')
  })

  it('ignores a blank description rather than rendering an empty row', () => {
    expect(rfqLineLabel({ original_name: '   ', name_ar: 'قبعة حماية' })).toBe('قبعة حماية')
  })
})

const ppeItems = () =>
  PPE_LINES.map((name, index) => ({
    id: index + 1,
    name,
    qty: '10',
    unit: 'عدد',
    status: 'ready',
    supplierCount: 1,
    suppliers: [],
    lineKey: `line-${index + 1}`,
    farqSpecId: undefined, // unmatched
  })) as unknown as BOQItem[]

describe('an unmatched line is no longer dropped from the payload', () => {
  it('keeps all ten PPE lines even though none has a farq_spec_id', () => {
    const lines = buildRfqLinesFromItems(ppeItems())
    // The regression: requiring a spec id dropped every one of these.
    expect(lines).toHaveLength(10)
    expect(lines.every((l) => l.farq_spec_id === null)).toBe(true)
  })

  it('carries the booklet text on every line', () => {
    const lines = buildRfqLinesFromItems(ppeItems())
    expect(lines.map((l) => l.original_name)).toEqual(PPE_LINES)
    expect(lines.map((l) => l.name_ar)).toEqual(PPE_LINES)
  })

  it('uses a confirmed spec id when one exists, and null otherwise', () => {
    const items = ppeItems()
    const lines = buildRfqLinesFromItems(items, {
      specIdForLine: (key) => (key === 'line-3' ? 'FARQ-BOOT-1' : null),
    })
    expect(lines.find((l) => l.line_key === 'line-3')!.farq_spec_id).toBe('FARQ-BOOT-1')
    expect(lines.filter((l) => l.farq_spec_id === null)).toHaveLength(9)
    // A matched line still carries its own description, not the catalog name.
    expect(lines.find((l) => l.line_key === 'line-3')!.original_name).toBe('جزمة PVC')
  })

  it('the sent lines render straight into ten real email rows', () => {
    const lines = buildRfqLinesFromItems(ppeItems())
    const p = preview(lines as unknown as Array<Record<string, unknown>>)
    expect(p.html.match(/<tr>/g)).toHaveLength(10)
    for (const name of PPE_LINES) expect(p.html).toContain(name)
    expect(p.html).not.toMatch(/أو إس بي|OSB/i)
  })
})

describe('packages survive a line with no farq_spec_id', () => {
  it('builds one package per unmatched PPE line, named after the real item', () => {
    const items = ppeItems()
    const selectedByItem = Object.fromEntries(items.map((i) => [i.id, ['sup-1']]))

    const { packages } = buildRfqPackagesFromSelection({ items, selectedByItem })
    expect(packages).toHaveLength(10)
    expect(packages.map((p) => p.name)).toEqual(PPE_LINES)
    // A null spec must not collide all ten packages onto one id.
    expect(new Set(packages.map((p) => p.id)).size).toBe(10)
  })
})
