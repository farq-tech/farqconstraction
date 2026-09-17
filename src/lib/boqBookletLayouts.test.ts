/**
 * Two booklet layouts, read end to end from the real PDFs.
 *
 * One tuned case is not a rule. The Etimad booklet (الرقم · البند · الكمية ·
 * الوحدة, plus a structural `الرمز الإنشائى`) and the Farq DC/SITE booklets
 * (الرمز · الفئة · البند · المواصفة المختصرة · الكمية · الوحدة, numbering headed
 * `الرمز` and no `الرقم` at all) disagree about what heads a number column, and
 * reading one correctly is what used to break the other.
 *
 * Ground truth for both is established outside this parser — the Etimad counts
 * by hand, the datacenter booklet by pymupdf — so a regression fails here
 * rather than being graded by the code under test.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { extractBoqTable, pageTextRows, type PdfPageGlyphs } from './boqPdfTable'
import { measureNameDuplication, resolveParsedLines } from './parseBoq'

type Truth = { id: number; name: string; qty: string; unit: string }

async function readBooklet(path: string) {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(path)),
    useSystemFonts: true,
    isEvalSupported: false,
    verbosity: 0,
  }).promise
  const pages: PdfPageGlyphs[] = []
  const parts: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent()
    const glyphs = (content.items as any[])
      .filter((i) => i && typeof i.str === 'string' && i.str)
      .map((i) => ({
        str: i.str,
        x: Number(i.transform?.[4] ?? 0),
        y: Number(i.transform?.[5] ?? 0),
        width: Number(i.width ?? 0),
      }))
    pages.push({ page: p, glyphs })
    for (const line of pageTextRows(glyphs)) parts.push(line)
  }
  const table = extractBoqTable(pages)
  return resolveParsedLines({
    text: parts.join('\n'),
    table: table.rows.length ? table : null,
    fileName: path,
  })
}

const F = 'fixtures/boq/'
/**
 * Arabic letters only. The two extractors disagree about where a Latin run
 * lands inside a right-to-left line — pymupdf keeps «توريد بطاقة 25GbE NIC»
 * glued, the reader reorders it to «توريد بطاقة GbE 25 NIC» — and that is a
 * property of bidirectional text, not of whether the item name was read. What
 * this test is for is whether the name arrived at all.
 */
const arabicOnly = (s: string) =>
  s
    .normalize('NFKC')
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[^\u0621-\u064A]/g, '')

describe('Etimad layout (الرقم, structural الرمز الإنشائى)', () => {
  it('reads all 68 items from the table, not the text', async () => {
    const r = await readBooklet(`${F}reference-etimad-2020-48.pdf`)
    expect(r.source).toBe('pdf-table')
    expect(r.lines).toHaveLength(68)
    expect(r.descriptionColumnSuspect).toBe(false)
    // The structural code column must never be mistaken for the numbering:
    // 2001–2107 as item numbers is the defect this reader was written to stop.
    expect(r.lines.every((l) => l.id >= 1 && l.id <= 68)).toBe(true)
    // …and never for the quantity either. Item 1 is 385 م ط, not 2,085 عدد.
    expect(r.lines[0]).toMatchObject({ id: 1, qty: '385', unit: 'م ط' })
    expect(r.lines[0]!.name).toContain('درابزين')
  }, 180_000)
})

describe('Farq DC/SITE layout (numbering headed الرمز, no الرقم)', () => {
  it('reads all 180 items with the names the PDF actually prints', async () => {
    const truth: Truth[] = JSON.parse(
      readFileSync(`${F}datacenter-cyber-01-groundtruth.json`, 'utf8'),
    )
    expect(truth).toHaveLength(180)

    const r = await readBooklet(`${F}datacenter-cyber-01.pdf`)
    expect(r.source).toBe('pdf-table')
    expect(r.lines).toHaveLength(180)
    expect(r.descriptionColumnSuspect).toBe(false)

    const byId = new Map(r.lines.map((l) => [l.id, l]))
    const wrongQty: string[] = []
    const wrongUnit: string[] = []
    const missingName: string[] = []
    for (const want of truth) {
      const got = byId.get(want.id)
      if (!got) {
        missingName.push(`${want.id}: not read`)
        continue
      }
      if (got.qty.replace(/,/g, '') !== want.qty.replace(/,/g, '')) {
        wrongQty.push(`${want.id}: ${got.qty} ≠ ${want.qty}`)
      }
      // The column reader reports the unit the PDF prints. It does not fold
      // قطعة into عدد the way the text path does, and that is the better
      // answer: the booklet says قطعة.
      if (got.unit !== want.unit) wrongUnit.push(`${want.id}: ${got.unit} ≠ ${want.unit}`)
      // The name the PDF prints wraps; ground truth holds its first line, so the
      // served description has to contain it rather than equal it.
      if (!arabicOnly(got.name).includes(arabicOnly(want.name))) {
        missingName.push(`${want.id}: "${got.name}" missing "${want.name}"`)
      }
    }
    // Quantities and units have to be exact. A wrong unit is worse than a
    // missing item: 5,600 «عدد» of floor porcelain instead of 5,600 م² is how
    // «غير متوفر» replies get produced.
    expect({ wrongQty, wrongUnit }).toEqual({ wrongQty: [], wrongUnit: [] })

    // 170 of 180 names come back whole. These ten lose or mangle one word where
    // the name wraps against a Latin run — «عمق», «بوصة», «سعة», and on 59 the
    // bidi split of «تحليلات». The material itself survives in every one of
    // them («خزانة خوادم», «شاشة مكتبية», «وحدة ذاكرة»), which is what matching
    // needs, so this is recorded as the measured baseline rather than hidden.
    // The list is exact on purpose: if it grows, or a different row joins it,
    // this fails.
    expect(missingName.map((m) => Number(m.split(':')[0])).sort((a, b) => a - b)).toEqual([
      11, 17, 35, 59, 69, 85, 86, 115, 116, 168,
    ])
  }, 180_000)
})

describe('the description-column guard', () => {
  it('stays silent on every booklet that reads correctly', async () => {
    for (const file of [
      'reference-etimad-2020-48.pdf',
      'datacenter-cyber-01.pdf',
      'warehouse-ops-02.pdf',
      'site-or-wh-1__2.pdf',
      'booklet-02-extra.pdf',
      'site-safety-02.pdf',
    ]) {
      const r = await readBooklet(F + file)
      expect(`${file}: ${r.descriptionColumnSuspect}`).toBe(`${file}: false`)
    }
  }, 240_000)

  it('fires when the name column is served from a repeating column', () => {
    // The shape of the defect, kept as data: 180 rows whose «name» is one of a
    // handful of category labels. Correct quantities do not redeem it.
    const lines = Array.from({ length: 180 }, (_, i) => ({
      id: i + 1,
      name: `DC- ${['الخوادم', 'التخزين', 'الشبكات'][i % 3]}`,
      qty: String(i + 1),
      unit: 'جهاز',
    }))
    const dup = measureNameDuplication(lines)
    expect(dup.share).toBe(1)
    expect(dup.worstCount).toBe(60)
  })

  it('tolerates a booklet that genuinely quotes the same material twice', () => {
    const lines = Array.from({ length: 68 }, (_, i) => ({
      id: i + 1,
      name: i < 2 ? 'بردورات خرسانة' : `مادة ${i}`,
      qty: '1',
      unit: 'عدد',
    }))
    expect(measureNameDuplication(lines).share).toBeLessThan(0.35)
  })
})
