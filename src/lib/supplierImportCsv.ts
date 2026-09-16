/**
 * Reading a supplier list the owner actually has, saved as CSV.
 *
 * Excel writes Arabic CSVs as UTF-8 with a byte-order mark and CRLF line
 * endings, and a BOM left on the first header turns «اسم المورد» into an
 * unrecognised column — the whole file then imports as nameless rows. Arabic
 * Windows installs also tend to produce semicolon-separated files, because the
 * comma is the decimal separator in that locale. Both are handled here rather
 * than being reported back as "no suppliers found".
 *
 * Everything past the split into a grid — column vocabulary, row numbering,
 * validation — lives in `supplierImportSheet` and is shared with the `.xlsx`
 * reader, so the same list gives the same verdict in either format.
 */

import { buildSupplierParse, SupplierSheetError, type SupplierSheetParse, type SupplierSheetRow } from './supplierImportSheet'

export type SupplierCsvRow = SupplierSheetRow
export type SupplierCsvParse = SupplierSheetParse
export { SupplierSheetError as SupplierCsvError }

/**
 * RFC 4180 with the quirks real files have: quoted fields containing the
 * delimiter or a newline, doubled quotes as an escaped quote, and CRLF.
 */
function splitRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else quoted = false
      } else field += char
      continue
    }
    if (char === '"') {
      quoted = true
      continue
    }
    if (char === delimiter) {
      row.push(field)
      field = ''
      continue
    }
    if (char === '\r') continue
    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }
    field += char
  }
  row.push(field)
  rows.push(row)
  return rows
}

/**
 * Pick the delimiter from the header line rather than a global count, so a
 * comma inside a quoted Arabic activity list cannot outvote the real separator.
 */
function detectDelimiter(firstLine: string): string {
  const candidates = [',', ';', '\t']
  let best = ','
  let bestCount = 0
  for (const candidate of candidates) {
    const count = splitRows(firstLine, candidate)[0]?.length ?? 0
    if (count > bestCount) {
      bestCount = count
      best = candidate
    }
  }
  return best
}

export function parseSupplierCsv(text: string): SupplierCsvParse {
  // The BOM is invisible and would otherwise be part of the first header name.
  // Only trailing whitespace is trimmed: a blank first line is a real line and
  // dropping it here would shift every row number below it.
  const body = text.replace(/^\uFEFF/, '').replace(/\s+$/, '')
  if (!body.trim()) throw new SupplierSheetError('الملف فارغ.')

  const firstLine = body.split(/\r?\n/, 1)[0] || ''
  // Blank rows are handed through so the grid index stays the line number.
  return buildSupplierParse(splitRows(body, detectDelimiter(firstLine)))
}

/** A template with the exact headers the parser recognises, BOM included. */
export function supplierCsvTemplate(): string {
  return `\uFEFFاسم المورد,المدينة,النشاط,البريد الإلكتروني,الجوال,اسم مسؤول التواصل,السجل التجاري\n`
}
