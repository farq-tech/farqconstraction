/**
 * Build fixtures/suppliers/messy-supplier-list.xlsx from the CSV of the same
 * name, reproducing what Excel does to a supplier list rather than what a
 * well-behaved exporter would do.
 *
 *   node scripts/make-supplier-xlsx-fixture.mjs
 *
 * The point of generating it rather than committing a binary is that the
 * hazards are visible and adjustable here:
 *
 *   - the phone column is written as a NUMBER, so 0537009051 is stored as
 *     537009051 exactly as Excel stores it, which is the case that decides
 *     whether a real supplier match is missed;
 *   - sheet 1 is a «تعليمات» cover sheet, so anything that blindly reads the
 *     first sheet finds no suppliers;
 *   - sheet 2 holds the nine rows at the same positions as the CSV, followed by
 *     trailing empty rows;
 *   - sheet 3 repeats them under a merged title banner, so the header lands on
 *     row 2 and the data on rows 3-11.
 *
 * No xlsx writer is installed, so the package is assembled directly. fflate is
 * already present as a read-excel-file dependency.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { zipSync, strToU8 } from 'fflate'

const CSV = new URL('../fixtures/suppliers/messy-supplier-list.csv', import.meta.url)
const OUT = new URL('../fixtures/suppliers/messy-supplier-list.xlsx', import.meta.url)

const escapeXml = (value) =>
  String(value).replace(/[<>&'"]/g, (char) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char],
  )

/** A1, B1 … AA1 for the column index. */
function columnName(index) {
  let name = ''
  let n = index
  do {
    name = String.fromCharCode(65 + (n % 26)) + name
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return name
}

const shared = []
const sharedIndex = new Map()
function sharedString(text) {
  if (!sharedIndex.has(text)) {
    sharedIndex.set(text, shared.length)
    shared.push(text)
  }
  return sharedIndex.get(text)
}

/**
 * A cell. Values given as `{ number }` are written untyped, which is how Excel
 * stores a numeric-looking phone and how the leading zero is lost.
 */
function cellXml(reference, value) {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'object' && 'number' in value) {
    return `<c r="${reference}"><v>${value.number}</v></c>`
  }
  return `<c r="${reference}" t="s"><v>${sharedString(String(value))}</v></c>`
}

function sheetXml(rows, mergeRefs = []) {
  const body = rows
    .map((cells, rowOffset) => {
      const reference = rowOffset + 1
      const rendered = cells
        .map((value, columnOffset) => cellXml(`${columnName(columnOffset)}${reference}`, value))
        .join('')
      // An empty <row> element is exactly what Excel leaves behind for a row
      // that once had content, and is the trailing-empty-row case under test.
      return `<row r="${reference}">${rendered}</row>`
    })
    .join('')
  const merges = mergeRefs.length
    ? `<mergeCells count="${mergeRefs.length}">${mergeRefs
        .map((reference) => `<mergeCell ref="${reference}"/>`)
        .join('')}</mergeCells>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData>${merges}</worksheet>`
}

// ---------------------------------------------------------------- source rows

const csv = readFileSync(CSV, 'utf8').replace(/^\uFEFF/, '').trim()
const grid = csv.split(/\r?\n/).map((line) => line.split(','))
const header = grid[0]
const dataRows = grid.slice(1)
const phoneColumn = header.indexOf('الجوال')
if (phoneColumn < 0) throw new Error('phone column not found in the CSV fixture')

/** Excel turns a numeric string into a number, dropping any leading zero. */
const asExcelStores = (cells) =>
  cells.map((value, column) =>
    column === phoneColumn && /^0?\d{9,10}$/.test(value)
      ? { number: String(Number(value)) }
      : value || null,
  )

const body = dataRows.map(asExcelStores)

// ------------------------------------------------------------------- workbook

const cover = [
  ['قائمة موردين — تعليمات الاستخدام'],
  [],
  ['املأ ورقة «الموردون»، عمود واحد لكل حقل، ولا تحذف صف العناوين.'],
  ['الحقول المطلوبة: اسم المورد، النشاط، وبريد إلكتروني أو جوال.'],
]

// Same layout as the CSV: header on row 1, the nine rows on 2-10. Then the
// trailing empty rows a real file accumulates from deleted content.
const suppliers = [header, ...body, [], [], []]

// The same nine rows under a merged banner, so the header is on row 2.
const banner = [['قائمة موردين شركة الفارق — سبتمبر 2026'], header, ...body]

const sheets = [
  { name: 'تعليمات', rows: cover, merges: ['A1:F1'] },
  { name: 'الموردون', rows: suppliers, merges: [] },
  { name: 'بعنوان مدمج', rows: banner, merges: ['A1:F1'] },
]

const sheetXmls = sheets.map((sheet) => sheetXml(sheet.rows, sheet.merges))

const files = {
  '[Content_Types].xml': strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
      .map(
        (_, index) =>
          `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join(
        '',
      )}<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
  ),
  '_rels/.rels': strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  ),
  'xl/workbook.xml': strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
      .map(
        (sheet, index) =>
          `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
      )
      .join('')}</sheets></workbook>`,
  ),
  'xl/_rels/workbook.xml.rels': strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map(
        (_, index) =>
          `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
      )
      .join('')}<Relationship Id="rId${
      sheets.length + 1
    }" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId${
      sheets.length + 2
    }" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  ),
  'xl/styles.xml': strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf xfId="0"/></cellXfs></styleSheet>`,
  ),
}

sheetXmls.forEach((xml, index) => {
  files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(xml)
})

// sharedStrings is written last: building the sheets is what populates it.
files['xl/sharedStrings.xml'] = strToU8(
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${
    shared.length
  }" uniqueCount="${shared.length}">${shared
    .map((text) => `<si><t xml:space="preserve">${escapeXml(text)}</t></si>`)
    .join('')}</sst>`,
)

writeFileSync(OUT, zipSync(files, { level: 6 }))

console.log(`wrote ${OUT.pathname}`)
for (const [index, sheet] of sheets.entries()) {
  console.log(`  sheet ${index + 1}: «${sheet.name}» — ${sheet.rows.length} rows${sheet.merges.length ? `, merged ${sheet.merges.join(', ')}` : ''}`)
}
console.log(`  phone column «${header[phoneColumn]}» written as a number (leading zero dropped, as Excel does)`)
