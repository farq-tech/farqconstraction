/**
 * Reading a supplier list the owner actually has.
 *
 * Excel writes Arabic CSVs as UTF-8 with a byte-order mark and CRLF line
 * endings, and a BOM left on the first header turns «اسم المورد» into an
 * unrecognised column — the whole file then imports as nameless rows. Arabic
 * Windows installs also tend to produce semicolon-separated files, because the
 * comma is the decimal separator in that locale. Both are handled here rather
 * than being reported back as "no suppliers found".
 *
 * The header vocabulary matches `Frontend/src/lib/constructionSupplierSpreadsheet.ts`
 * in the main Farq app, so one file works in both.
 */

export type SupplierCsvRow = {
  rowNumber: number
  name_ar: string
  name_en: string
  city: string
  email: string
  whatsapp: string
  contact_name: string
  supplied_items: string
  cr_number: string
}

export type SupplierCsvParse = {
  rows: SupplierCsvRow[]
  /** Headers found in the file, for the "we read these columns" line. */
  headers: string[]
  /** Rows with content but no recognised column — reported, never dropped. */
  unreadableRowNumbers: number[]
}

export class SupplierCsvError extends Error {}

/** Header aliases, Arabic first. Compared after the same normalization as data. */
const COLUMNS: Record<keyof Omit<SupplierCsvRow, 'rowNumber'>, string[]> = {
  name_ar: ['اسم المورد بالعربية', 'اسم المورد', 'اسم الشركة', 'المورد', 'supplier name arabic', 'supplier name', 'name'],
  name_en: ['اسم المورد بالإنجليزية', 'الاسم بالإنجليزية', 'supplier name english', 'name en', 'english name'],
  city: ['المدينة', 'المنطقة', 'city', 'region'],
  email: ['البريد الإلكتروني', 'البريد', 'الايميل', 'email', 'e-mail'],
  whatsapp: ['واتساب', 'الجوال', 'رقم الجوال', 'الهاتف', 'whatsapp', 'mobile', 'phone'],
  contact_name: ['اسم مسؤول التواصل', 'مسؤول التواصل', 'جهة الاتصال', 'contact name', 'contact'],
  supplied_items: ['المواد التي يوردها', 'النشاط', 'التصنيفات', 'الفئة', 'التخصص', 'supplied items', 'activity', 'categories', 'category'],
  cr_number: ['السجل التجاري', 'رقم السجل التجاري', 'cr number', 'commercial registration'],
}

/**
 * Same alef / hamza / ta-marbuta folding the server uses for matching. Applied
 * to headers so «البريد الإلكترونى» and «البريد الإلكتروني» are one column.
 */
function normalizeHeader(value: string): string {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0649/g, '\u064a')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

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
  const body = text.replace(/^\uFEFF/, '').trim()
  if (!body) throw new SupplierCsvError('الملف فارغ.')

  const firstLine = body.split(/\r?\n/, 1)[0] || ''
  const grid = splitRows(body, detectDelimiter(firstLine)).filter((row) =>
    row.some((cell) => String(cell || '').trim()),
  )
  if (grid.length < 2) throw new SupplierCsvError('الملف لا يحتوي على صفوف بعد العناوين.')

  const headers = grid[0]!.map((cell) => normalizeHeader(cell))
  const columnOf = (key: keyof typeof COLUMNS): number => {
    const aliases = COLUMNS[key].map(normalizeHeader)
    // Exact before partial: «اسم المورد» must not capture a «اسم مسؤول التواصل»
    // column just because the words overlap.
    const exact = headers.findIndex((header) => aliases.includes(header))
    if (exact >= 0) return exact
    return headers.findIndex((header) => header && aliases.some((alias) => header.includes(alias)))
  }

  const index = {
    name_ar: columnOf('name_ar'),
    name_en: columnOf('name_en'),
    city: columnOf('city'),
    email: columnOf('email'),
    whatsapp: columnOf('whatsapp'),
    contact_name: columnOf('contact_name'),
    supplied_items: columnOf('supplied_items'),
    cr_number: columnOf('cr_number'),
  }

  if (index.name_ar < 0 && index.name_en < 0) {
    throw new SupplierCsvError(
      `لم نتعرّف على عمود اسم المورد. الأعمدة المقروءة: ${grid[0]!.map((cell) => String(cell).trim()).filter(Boolean).join('، ') || '—'}. أضف عمودًا باسم «اسم المورد».`,
    )
  }

  const at = (row: string[], column: number): string =>
    column >= 0 ? String(row[column] ?? '').trim() : ''

  const rows: SupplierCsvRow[] = []
  const unreadableRowNumbers: number[] = []

  grid.slice(1).forEach((row, offset) => {
    // 1-based, counting the header, so the number matches what Excel shows.
    const rowNumber = offset + 2
    const parsed: SupplierCsvRow = {
      rowNumber,
      name_ar: at(row, index.name_ar),
      name_en: at(row, index.name_en),
      city: at(row, index.city),
      email: at(row, index.email),
      whatsapp: at(row, index.whatsapp),
      contact_name: at(row, index.contact_name),
      supplied_items: at(row, index.supplied_items),
      cr_number: at(row, index.cr_number),
    }
    const anyRecognised = Object.entries(parsed).some(([key, value]) => key !== 'rowNumber' && value)
    // A row with content in unmapped columns only is surfaced, not skipped: a
    // silently dropped row is the failure this whole flow exists to prevent.
    if (!anyRecognised) unreadableRowNumbers.push(rowNumber)
    else rows.push(parsed)
  })

  if (!rows.length) throw new SupplierCsvError('لم نجد أي صف يحتوي على بيانات مورد.')

  return { rows, headers: grid[0]!.map((cell) => String(cell).trim()).filter(Boolean), unreadableRowNumbers }
}

/** A template with the exact headers the parser recognises, BOM included. */
export function supplierCsvTemplate(): string {
  return `\uFEFFاسم المورد,المدينة,النشاط,البريد الإلكتروني,الجوال,اسم مسؤول التواصل,السجل التجاري\n`
}
