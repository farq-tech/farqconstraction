import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  extractBoqTable,
  foldPdfText,
  pageTextRows,
  readQuantity,
  readVisualUnit,
  unreadableCount,
  type PdfGlyph,
} from './boqPdfTable'
import { resolveParsedLines } from './parseBoq'

/**
 * Glyph fixtures use the real coordinates measured on the reference Etimad
 * booklet (كراسة اعتماد — محكمة حفر الباطن 2020/48), so a change in the column
 * logic fails here before it reaches a booklet.
 */
const g = (str: string, x: number, y: number, width: number): PdfGlyph => ({ str, x, y, width })

/** Header block of pages 28–32: three stacked visual rows. */
const HEADER: PdfGlyph[] = [
  g('الرقم', 542.7, 647.1, 27.3),
  g('البند', 505.3, 647.1, 23.4),
  g('الكمية', 272.2, 647.1, 33.5),
  g('الوحدة', 224.4, 647.1, 34.1),
  g('منتج', 185.4, 656.1, 25),
  g('من', 166.6, 656.1, 15.9),
  g('القائمة', 126.4, 656.1, 37.3),
  g('الإلزامية', 167, 638.1, 43.5),
  g('الرمز', 73.5, 656.1, 24.4),
  g('الإنشائي', 52.3, 638.1, 45.5),
]

describe('foldPdfText', () => {
  // Exactly the bytes pdf.js returns for page 28 of the reference booklet.
  const RAW_HADEEDI = '\uFEA3\uFEAA\uFEF3\uFEAA\u064A'
  const RAW_AL_BAND = '\u0627\uFEDF\uFE92\uFEE8\uFEAA'
  const RAW_AL_KAMMIYA = '\u0627\uFEDF\uFEDC\uFEE4\uFEF4\uFE94'

  it('folds Arabic presentation forms to standard Arabic', () => {
    expect(foldPdfText(RAW_HADEEDI)).toBe('حديدي')
    expect(foldPdfText('\uFEE7\uFECC\uFEE2')).toBe('نعم')
  })

  it('makes the gate keywords findable, which raw extraction does not', () => {
    expect(RAW_AL_BAND.includes('البند')).toBe(false)
    expect(RAW_AL_KAMMIYA.includes('الكمية')).toBe(false)
    expect(foldPdfText(RAW_AL_BAND)).toBe('البند')
    expect(foldPdfText(RAW_AL_KAMMIYA)).toBe('الكمية')
  })

  // What Chrome, Edge and Google Docs write for the lam-alef ligature: the two
  // letters swapped. Measured with Arial, Tahoma, Times and Geeza Pro.
  it('puts a browser-printed lam-alef back in order where the order is unambiguous', () => {
    expect(foldPdfText('الرمز اإلنشائي')).toBe('الرمز الإنشائي')
    expect(foldPdfText('االختبار')).toBe('الاختبار')
    expect(foldPdfText('األعمال')).toBe('الأعمال')
    // Only the article's ligature is unambiguous: «الآلات» keeps its inner one.
    expect(foldPdfText('اآلالت')).toBe('الآالت')
  })

  it('leaves a correct word alone, including one that holds «مال»', () => {
    expect(foldPdfText('الإنشائي')).toBe('الإنشائي')
    expect(foldPdfText('مالك الشركة')).toBe('مالك الشركة')
    expect(foldPdfText('مالحظات')).toBe('مالحظات')
  })
})

describe('extractBoqTable — header spellings from Excel, Word and the browser', () => {
  const y = 647.1
  const page = (labels: Array<[string, number, number]>) => {
    const glyphs: PdfGlyph[] = labels.map(([str, x, w]) => g(str, x, y, w))
    glyphs.push(g('1', 546, 620, 6), g('كابل نحاس 4x25', 420, 620, 80), g('م ط', 232, 620, 16), g('12', 290, 620, 12))
    glyphs.push(g('2', 546, 600, 6), g('قاطع MCCB 160A', 420, 600, 80), g('عدد', 232, 600, 16), g('7', 290, 600, 6))
    return extractBoqTable([{ page: 1, glyphs }])
  }

  it('reads a table headed رقم / الوصف, not only الرقم / البند', () => {
    const t = page([['رقم', 542, 20], ['الوصف', 505, 30], ['الكمية', 272, 33], ['الوحدة', 224, 34]])
    expect(t.rows.map((r) => [r.id, r.qty, r.unit])).toEqual([[1, '12', 'م ط'], [2, '7', 'عدد']])
  })

  it('reads a table headed م / البيان / الكميات / وحدة القياس', () => {
    const t = page([['م', 542, 8], ['البيان', 505, 30], ['الكميات', 272, 33], ['وحدة القياس', 224, 50]])
    expect(t.rows.map((r) => r.id)).toEqual([1, 2])
  })

  it('reads a header whose lam-alef ligatures came out of the browser reversed', () => {
    const t = page([['الرقم', 542, 27], ['البند', 505, 23], ['الكمية', 272, 33], ['الوحدة', 224, 34], ['الرمز', 73, 24], ['اإلنشائي', 52, 45], ['مالحظات', 20, 30]])
    expect(t.rows.map((r) => r.id)).toEqual([1, 2])
  })
})

describe('readVisualUnit', () => {
  it('reassembles units that extract reversed and split', () => {
    expect(readVisualUnit('م ط')).toBe('م ط')
    expect(readVisualUnit('ط م')).toBe('م ط')
    expect(readVisualUnit('م 2')).toBe('م²')
    expect(readVisualUnit('م 3')).toBe('م³')
  })

  it('reads the unit the cell holds and never substitutes عدد', () => {
    expect(readVisualUnit('كيس')).toBe('كيس')
    expect(readVisualUnit('طقم')).toBe('طقم')
    expect(readVisualUnit('')).toBeNull()
    expect(readVisualUnit('2011')).toBeNull()
  })
})

describe('readQuantity', () => {
  it('rejects anything that is not a positive number', () => {
    expect(readQuantity('385')).toBe('385')
    expect(readQuantity('5,600')).toBe('5,600')
    expect(readQuantity('')).toBeNull()
    expect(readQuantity('نعم')).toBeNull()
    expect(readQuantity('0')).toBeNull()
  })
})

describe('pageTextRows', () => {
  it('splits a page into one line per visual row', () => {
    const rows = pageTextRows([
      g('1', 565.8, 608.8, 5.6),
      g('درابزين', 497.3, 608.8, 40),
      g('2', 564.6, 578.8, 5.6),
      g('بوابة', 507.7, 578.8, 30),
    ])
    expect(rows).toEqual(['1 درابزين', '2 بوابة'])
  })
})

describe('extractBoqTable — the reference booklet hazards', () => {
  it('reads the structural code as a code, not as the quantity', () => {
    const result = extractBoqTable([
      {
        page: 28,
        glyphs: [
          ...HEADER,
          g('1', 565.8, 608.8, 5.6),
          g('درابزين', 497.3, 608.8, 40.2),
          g('حديدي', 465.4, 608.8, 31.9),
          g('385', 288.3, 608.8, 17.4),
          g('م', 252, 608.8, 6),
          g('ط', 239.6, 608.8, 6),
          g('نعم', 192.3, 608.8, 18),
          g('2011', 77.8, 608.8, 20),
          g('2', 564.6, 578.8, 5.6),
          g('بوابة', 507.7, 578.8, 30),
          g('3', 300.2, 578.8, 5.6),
          g('عدد', 241.4, 578.8, 18),
          g('نعم', 192.3, 578.8, 18),
          g('2031', 76.4, 578.8, 20),
        ],
      },
    ])
    expect(result.rows).toHaveLength(2)
    const [first] = result.rows
    // The defect this whole module exists for: 385 م ط read as 2,085 عدد.
    expect(first).toMatchObject({ id: 1, name: 'درابزين حديدي', qty: '385', unit: 'م ط', code: '2011' })
    expect(result.issues).toHaveLength(0)
  })

  it('merges an item wrapped over three rows with its quantity on the middle row (#23)', () => {
    const result = extractBoqTable([
      {
        page: 29,
        glyphs: [
          ...HEADER,
          // #1, only to establish the item-to-item spacing this document uses.
          g('1', 559.2, 487.2, 11),
          g('خشب', 500.7, 487.2, 24),
          g('720', 289.4, 487.2, 17),
          g('م', 252, 487.2, 6),
          g('2', 246.6, 487.2, 4),
          g('2039', 74.7, 487.2, 20),
          // #2 across y = 457.2 / 448.9 / 440.7, number and quantity in the middle:
          // the real geometry of item #23, renumbered so this one page is a
          // complete table and the gap check has nothing to complain about.
          g('طبقة', 503.4, 457.2, 24),
          g('عازلة', 478.6, 457.2, 24),
          g('للرطوبة', 440.5, 457.2, 37),
          g('أفقية', 413, 457.2, 27),
          g('ورأسية', 377.2, 457.2, 35),
          g('من', 360.2, 457.2, 16),
          g('2', 559, 448.9, 11),
          g('110', 291.1, 448.9, 15),
          g('م', 252, 448.9, 6),
          g('2', 246.6, 448.9, 4),
          g('نعم', 192.3, 448.9, 18),
          g('2021', 76.6, 448.9, 20),
          g('البيتومين', 487.3, 440.7, 46),
          g('الساخن', 449.3, 440.7, 37),
          g('3', 558.4, 410.6, 11),
          g('عازل', 507.4, 410.6, 24),
          g('2100', 283.7, 410.6, 22),
          g('م', 252, 410.6, 6),
          g('2', 246.6, 410.6, 4),
          g('2021', 76.6, 410.6, 20),
        ],
      },
    ])
    const wrapped = result.rows.find((r) => r.id === 2)
    expect(wrapped).toMatchObject({ qty: '110', unit: 'م²' })
    expect(wrapped?.name).toBe('طبقة عازلة للرطوبة أفقية ورأسية من البيتومين الساخن')
    expect(result.rows.map((r) => r.id)).toEqual([1, 2, 3])
    expect(result.issues).toHaveLength(0)
  })

  it('keeps the amperage out of the item number for #43 and #44', () => {
    const result = extractBoqTable([
      {
        page: 30,
        glyphs: [
          ...HEADER,
          g('43', 558.2, 337.1, 11),
          g('قاطع', 502.5, 337.1, 26),
          g('100', 483.1, 337.1, 17),
          g('امبير', 459.7, 337.1, 24),
          g('47', 294.8, 337.1, 11),
          g('عدد', 241.4, 337.1, 18),
          g('نعم', 192.3, 337.1, 18),
          g('2085', 74.4, 337.1, 20),
          g('44', 557.5, 307, 11),
          g('قاطع', 502.5, 307, 26),
          g('32', 488.8, 307, 11),
          g('امبير', 465.4, 307, 24),
          g('2', 300.4, 307, 5.6),
          g('عدد', 241.4, 307, 18),
          g('نعم', 192.3, 307, 18),
          g('2085', 74.4, 307, 20),
        ],
      },
    ])
    expect(result.rows.map((r) => r.id)).toEqual([43, 44])
    expect(result.rows[0]).toMatchObject({ id: 43, name: 'قاطع 100 امبير', qty: '47', unit: 'عدد' })
    expect(result.rows[1]).toMatchObject({ id: 44, name: 'قاطع 32 امبير', qty: '2', unit: 'عدد' })
  })

  it('reads the header once when the whole thead is painted twice (page 28)', () => {
    const doubled = [...HEADER, ...HEADER.map((h) => ({ ...h, y: h.y + 1.5 }))]
    const result = extractBoqTable([
      {
        page: 28,
        glyphs: [
          ...doubled,
          g('1', 565.8, 608.8, 5.6),
          g('درابزين', 497.3, 608.8, 40.2),
          g('385', 288.3, 608.8, 17.4),
          g('م', 252, 608.8, 6),
          g('ط', 239.6, 608.8, 6),
          g('2011', 77.8, 608.8, 20),
        ],
      },
    ])
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({ id: 1, qty: '385', unit: 'م ط' })
  })

  it('ignores page furniture that sits in data columns', () => {
    const result = extractBoqTable([
      {
        page: 28,
        glyphs: [
          g('08/12/2020', 26.5, 771, 40),
          g('كراسة الشروط والمواصفات', 305.9, 771, 71.4),
          ...HEADER,
          g('1', 565.8, 608.8, 5.6),
          g('درابزين', 497.3, 608.8, 40.2),
          g('385', 288.3, 608.8, 17.4),
          g('م', 252, 608.8, 6),
          g('ط', 239.6, 608.8, 6),
          g('تاريخ', 498.3, 84.1, 27),
          g('الإصدار', 470.2, 84.1, 37),
          g('النسخة', 287.7, 84.1, 37),
          g('28/47', 566.5, 17, 20),
          g('https://tenders.etimad.sa/Tender/PrintConditionsTemplateHtml', 26.5, 17, 440),
        ],
      },
    ])
    expect(result.rows).toHaveLength(1)
    expect(result.issues).toHaveLength(0)
  })

  it('reports a numbered item it could not read instead of dropping it', () => {
    const result = extractBoqTable([
      {
        page: 28,
        glyphs: [
          ...HEADER,
          g('1', 565.8, 608.8, 5.6),
          g('درابزين', 497.3, 608.8, 40.2),
          g('385', 288.3, 608.8, 17.4),
          g('م', 252, 608.8, 6),
          g('ط', 239.6, 608.8, 6),
          // #2 has a structural code but no quantity cell at all.
          g('2', 564.6, 578.8, 5.6),
          g('بوابة', 507.7, 578.8, 30),
          g('نعم', 192.3, 578.8, 18),
          g('2031', 76.4, 578.8, 20),
        ],
      },
    ])
    expect(result.rows.map((r) => r.id)).toEqual([1])
    expect(result.issues.map((i) => i.kind)).toEqual(['missing-qty'])
    expect(result.issues[0]?.id).toBe(2)
    expect(result.expectedCount).toBe(2)
    expect(unreadableCount(result)).toBe(1)
  })

  it('reports numbers it never saw as gaps, so a partial read cannot look complete', () => {
    const result = extractBoqTable([
      {
        page: 28,
        glyphs: [
          ...HEADER,
          g('1', 565.8, 608.8, 5.6),
          g('درابزين', 497.3, 608.8, 40.2),
          g('385', 288.3, 608.8, 17.4),
          g('م', 252, 608.8, 6),
          g('ط', 239.6, 608.8, 6),
          g('5', 564.2, 488.7, 5.6),
          g('باب', 512.3, 488.7, 24),
          g('25', 294.5, 488.7, 11),
          g('عدد', 241.4, 488.7, 18),
        ],
      },
    ])
    expect(result.rows.map((r) => r.id)).toEqual([1, 5])
    expect(result.expectedCount).toBe(5)
    expect(unreadableCount(result)).toBe(3)
    const gap = result.issues.find((i) => i.kind === 'gap-in-numbering')
    expect(gap?.detail).toContain('2')
    expect(gap?.detail).toContain('3')
    expect(gap?.detail).toContain('4')
  })
})

describe('resolveParsedLines with a column read', () => {
  it('prefers the column read over a longer text guess', () => {
    const table = extractBoqTable([
      {
        page: 28,
        glyphs: [
          ...HEADER,
          g('1', 565.8, 608.8, 5.6),
          g('درابزين', 497.3, 608.8, 40.2),
          g('حديدي', 465.4, 608.8, 31.9),
          g('385', 288.3, 608.8, 17.4),
          g('م', 252, 608.8, 6),
          g('ط', 239.6, 608.8, 6),
          g('2011', 77.8, 608.8, 20),
        ],
      },
    ])
    const resolved = resolveParsedLines({
      table,
      apiLines: [
        { id: 1, name: 'درابزين', qty: '2085', unit: 'عدد' },
        { id: 2, name: 'بوابة', qty: '2034', unit: 'عدد' },
      ],
      text: 'كراسة الشروط والمواصفات جدول الكميات البند الكمية الوحدة',
      fileName: 'reference.pdf',
    })
    expect(resolved.source).toBe('pdf-table')
    expect(resolved.lines).toHaveLength(1)
    expect(resolved.lines[0]).toMatchObject({ qty: '385', unit: 'م ط', spec: 'رمز إنشائي 2011' })
  })

  /**
   * The quantities table prints no technical column, so the column reader's
   * rows arrive specless and would match on name alone. The API reads the
   * specification section; these three cases fix when its text may be trusted
   * onto a row and when attaching it would be a guess.
   */
  const handrailTable = () =>
    extractBoqTable([
      {
        page: 28,
        glyphs: [
          ...HEADER,
          g('1', 565.8, 608.8, 5.6),
          g('درابزين', 497.3, 608.8, 40.2),
          g('حديدي', 465.4, 608.8, 31.9),
          g('385', 288.3, 608.8, 17.4),
          g('م', 252, 608.8, 6),
          g('ط', 239.6, 608.8, 6),
          g('2011', 77.8, 608.8, 20),
        ],
      },
    ])

  it('attaches the API specification when name and quantity agree', () => {
    const resolved = resolveParsedLines({
      table: handrailTable(),
      apiLines: [
        {
          id: 2,
          name: 'درابزين حديدي',
          qty: '385',
          unit: 'م ط',
          spec: 'درابزين حديدى لزوم الرامب والسلالم الداخلية من قطاعات الحديد المفرغة',
        },
      ],
      text: 'كراسة الشروط والمواصفات جدول الكميات البند الكمية الوحدة',
      fileName: 'reference.pdf',
    })
    expect(resolved.source).toBe('pdf-table')
    expect(resolved.specsFromApi).toBe(1)
    // The column reader keeps the values; only the text is borrowed. The API's
    // own item number (2 here) is discarded — it counts a page-27 aggregate row.
    expect(resolved.lines[0]).toMatchObject({ id: 1, qty: '385', unit: 'م ط' })
    expect(resolved.lines[0]?.spec).toBe(
      'درابزين حديدى لزوم الرامب والسلالم الداخلية من قطاعات الحديد المفرغة · رمز إنشائي 2011',
    )
  })

  it('refuses a specification whose quantity disagrees', () => {
    const resolved = resolveParsedLines({
      table: handrailTable(),
      apiLines: [
        { id: 1, name: 'درابزين حديدي', qty: '12', unit: 'م ط', spec: 'مواصفة بند آخر' },
      ],
      text: 'كراسة الشروط والمواصفات جدول الكميات البند الكمية الوحدة',
      fileName: 'reference.pdf',
    })
    expect(resolved.specsFromApi).toBe(0)
    expect(resolved.lines[0]?.spec).toBe('رمز إنشائي 2011')
  })

  it('refuses a specification when two API rows carry the same name', () => {
    const resolved = resolveParsedLines({
      table: handrailTable(),
      apiLines: [
        { id: 1, name: 'درابزين حديدي', qty: '385', unit: 'م ط', spec: 'مقاس أول' },
        { id: 2, name: 'درابزين حديدي', qty: '385', unit: 'م ط', spec: 'مقاس ثانٍ' },
      ],
      text: 'كراسة الشروط والمواصفات جدول الكميات البند الكمية الوحدة',
      fileName: 'reference.pdf',
    })
    expect(resolved.specsFromApi).toBe(0)
    expect(resolved.lines[0]?.spec).toBe('رمز إنشائي 2011')
  })

  it('leaves the text path alone for shapes with no table', () => {
    const resolved = resolveParsedLines({
      table: null,
      text: '1\tتوريد بلاط بورسلين 60x60\t87\tم²\n2\tتوريد دهان بلاستيك\t120\tم²',
      fileName: 'archive.csv',
    })
    expect(resolved.source).toBe('pdf-text')
    expect(resolved.lines.length).toBeGreaterThanOrEqual(2)
  })
})

/**
 * The end-to-end case. Runs against the booklet itself so the claim "68 of 68
 * with the right quantity and unit" is checked by the suite, not by a one-off
 * script. Ground truth lives beside it in `reference-etimad-groundtruth.json`.
 */
describe('the reference Etimad booklet end to end', () => {
  const pdfPath = resolve(process.cwd(), 'fixtures/boq/reference-etimad-2020-48.pdf')
  const truthPath = resolve(process.cwd(), 'fixtures/boq/reference-etimad-groundtruth.json')
  const haveFixtures = existsSync(pdfPath) && existsSync(truthPath)

  it('reads all 68 items with the booklet\'s own quantity and unit', async () => {
    expect(haveFixtures).toBe(true)
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(readFileSync(pdfPath)),
      useSystemFonts: true,
      verbosity: 0,
    }).promise
    const pages: Array<{ page: number; glyphs: PdfGlyph[] }> = []
    for (let p = 1; p <= doc.numPages; p++) {
      const content = await (await doc.getPage(p)).getTextContent()
      pages.push({
        page: p,
        glyphs: content.items.flatMap((item): PdfGlyph[] => {
          if (!('str' in item) || !item.str) return []
          return [{ str: item.str, x: item.transform[4]!, y: item.transform[5]!, width: item.width }]
        }),
      })
    }
    const table = extractBoqTable(pages)
    expect(table.pages).toEqual([28, 29, 30, 31, 32])
    expect(table.rows).toHaveLength(68)
    expect(table.expectedCount).toBe(68)
    expect(table.issues).toHaveLength(0)
    expect(unreadableCount(table)).toBe(0)

    type Truth = { page: number; id: number; qty: string; unit: string }
    const truth: Truth[] = JSON.parse(readFileSync(truthPath, 'utf8'))
    // The stored ground truth carries the fusion hazard it documents: it read
    // «قاطع 100 امبير» as item 100 and «قاطع 32 امبير» as item 32, so it has no
    // 43/44 and two rows numbered 32. Repaired by page so the comparison is
    // against the booklet, not against that transcription.
    const expected = truth
      .filter((t) => t.page >= 28)
      .map((t) => (t.id === 100 && t.page === 30 ? { ...t, id: 43 } : t.id === 32 && t.page === 30 ? { ...t, id: 44 } : t))
    const visualUnit = (u: string) =>
      /^ط\s*م$|^م\s*ط$/.test(u) ? 'م ط' : /^[23]\s*م$|^م\s*[23]$/.test(u) ? (u.includes('3') ? 'م³' : 'م²') : u
    const byId = new Map(table.rows.map((r) => [r.id, r]))
    const wrong = expected.filter((t) => {
      const got = byId.get(t.id)
      if (!got) return true
      return got.qty.replace(/,/g, '') !== String(t.qty).replace(/,/g, '') || got.unit !== visualUnit(t.unit)
    })
    expect(wrong.map((w) => w.id)).toEqual([])

    // The named hazards, spelled out.
    expect(byId.get(1)).toMatchObject({ name: 'درابزين حديدي', qty: '385', unit: 'م ط' })
    expect(byId.get(14)).toMatchObject({ qty: '5,600', unit: 'م²' })
    expect(byId.get(23)).toMatchObject({
      name: 'طبقة عازلة للرطوبة أفقية ورأسية من البيتومين الساخن',
      qty: '110',
    })
    expect(byId.get(43)).toMatchObject({ name: 'قاطع 100 امبير', qty: '47' })
    expect(byId.get(44)).toMatchObject({ name: 'قاطع 32 امبير', qty: '2' })
  }, 60_000)
})

/**
 * A contractor's priced quotation («عرض سعر»), printed from a browser: header
 * بند · المواصفات · الوحدة · الكمية · السعر · الإجمالي with its ligatures
 * reversed («املواصفات», «االمجايل»), units in words split at a ligature
 * («م» + «تر مربع»), and each item's second line one row-pitch below it.
 * Coordinates measured on the real file. Before, the table was never found and
 * the text path read «مقاس 2*30*60» as 2 عدد and «بسماكة 5 سم» as 5 عدد.
 */
describe('extractBoqTable — priced quotation', () => {
  const page = {
    page: 1,
    glyphs: [
      g('بند', 534.9, 607.5, 10.3),
      g('املواصــــــــــــفات', 372.6, 607.5, 54.7),
      g('الوحدة', 234.9, 607.5, 20.9),
      g('الكمية', 189.4, 607.5, 19.7),
      g('السعر', 148.0, 607.5, 17.5),
      g('االمجايل', 81.6, 607.5, 22.6),
      // 1 — 90 م ط; the «2» of «2*30*60» is in the description.
      g('1', 537.6, 587.1, 5.0),
      g('توريد وتركيب', 475.1, 586.1, 49.0),
      g('رخام عماني', 430.0, 586.1, 42.2),
      g('مقاس', 406.6, 586.1, 20.6),
      g('*30*60', 368.2, 586.1, 33.1),
      g('2', 362.7, 586.1, 5.5),
      g('متر طولي', 227.9, 586.1, 34.8),
      g('90', 193.6, 586.1, 11.0),
      g('170', 148.2, 586.1, 16.6),
      g('00.00', 90.1, 586.1, 24.8),
      g('3', 84.6, 586.1, 5.5),
      g(',', 81.9, 586.1, 2.8),
      g('15', 70.8, 586.1, 11.0),
      g('تركيب ميكانيكي مع تعبئة خلطة ومبروم من الحجر اعلى الرخام', 304.3, 573.4, 219.8),
      // 2 — 25 م², the unit painted as «م» + «تر مربع».
      g('2', 537.6, 559.9, 5.0),
      g('توريد وتركيب', 475.1, 558.9, 49.0),
      g('بورسالن (مصنع المستقبل)', 376.1, 558.9, 96.1),
      g('م', 257.1, 558.9, 4.6),
      g('تر مربع', 229.0, 558.9, 28.1),
      g('25', 193.6, 558.9, 11.0),
      g('180', 148.2, 558.9, 16.6),
      g('4,500.00', 73.6, 558.9, 38.6),
      g('اعلى المداخل وسط الواجهة حسب التصم', 351.9, 546.2, 142.7),
      g('يم المعتمد', 317.3, 546.2, 34.6),
      g('لألعمدة', 497.5, 546.2, 26.6),
      // 6 — 190 م ط; «بسماكة 5 سم» is in the description.
      g('3', 537.6, 533.8, 5.0),
      g('توريد وتركيب', 475.1, 532.9, 49.0),
      g('تيوبات الم', 436.3, 532.9, 36.0),
      g('نيوم كالدينج شامل الحديد بسماكة', 319.1, 532.9, 117.1),
      g('5', 311.0, 532.9, 5.5),
      g('سم في', 285.0, 532.9, 23.2),
      g('متر طولي', 227.9, 532.9, 34.8),
      g('190', 191.0, 532.9, 16.6),
      g('80', 151.2, 532.9, 11.0),
      g('15,200.00', 70.8, 532.9, 41.0),
      g('االعلى يمين ويسار الواجهة حسب التصميم المعتمد', 346.6, 520.2, 177.4),
      // Total and notes: not items, and not a continuation of item 3.
      g('اجمالي التكلفة التقديرية', 300.2, 506.9, 85.7),
      g('81,380.00', 80.2, 506.9, 44.2),
      g('لاير', 61.6, 506.9, 13.1),
      g('الكميات الواردة في التكلفة التقديرية تقريبية', 317.1, 494.2, 152.3),
      g('قابلة للزيادة او النقصان', 99.3, 494.2, 215.0),
    ],
  }

  it('reads quantity and unit from their own columns, never from the description', () => {
    const result = extractBoqTable([page])
    expect(result.issues).toEqual([])
    expect(result.rows.map((r) => [r.id, r.qty, r.unit])).toEqual([
      [1, '90', 'م ط'],
      [2, '25', 'م²'],
      [3, '190', 'م ط'],
    ])
  })

  it('keeps each item whole: its wrapped line, its words and its brackets', () => {
    const [first, second, third] = extractBoqTable([page]).rows
    expect(first!.name).toMatch(/مقاس 2 ?\*30\*60/)
    expect(first!.name).toMatch(/ومبروم من الحجر اعلى الرخام$/)
    expect(second!.name).toContain('(مصنع المستقبل)')
    expect(second!.name).toMatch(/التصميم المعتمد$/)
    expect(third!.name).toContain('تيوبات المنيوم كالدينج')
    expect(third!.name).not.toMatch(/الكميات الواردة|اجمالي/)
  })

  it('is served over the text path', () => {
    const table = extractBoqTable([page])
    // The text path's own read of this page, which is what the table must beat.
    const text = pageTextRows(page.glyphs).join('\n')
    const resolved = resolveParsedLines({ apiLines: [], text, table, fileName: 'quote.pdf' })
    expect(resolved.source).toBe('pdf-table')
    expect(resolved.lines.map((l) => [l.qty, l.unit])).toEqual([
      ['90', 'م ط'],
      ['25', 'م²'],
      ['190', 'م ط'],
    ])
  })
})
