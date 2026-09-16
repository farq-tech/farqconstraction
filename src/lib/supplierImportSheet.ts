/**
 * The column vocabulary and row builder shared by the CSV and Excel readers.
 *
 * Both formats converge on the same grid of cells before anything is
 * interpreted, so a supplier list gives the same verdict whichever way it was
 * saved. Only the cell-to-text coercion differs, and that difference is
 * confined to `coerceCell` below: CSV hands us strings, Excel hands us numbers,
 * dates and nulls.
 *
 * The header vocabulary matches `Frontend/src/lib/constructionSupplierSpreadsheet.ts`
 * in the main Farq app, so one file works in both.
 */

/** A cell as either reader can produce it. */
export type SheetCell = string | number | boolean | Date | null | undefined

export type SupplierSheetRow = {
  /** 1-based position in the file, counting the header, as Excel displays it. */
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

export type SupplierSheetParse = {
  rows: SupplierSheetRow[]
  /** Headers found in the file, for the "we read these columns" line. */
  headers: string[]
  /** Rows with content but no recognised column — reported, never dropped. */
  unreadableRowNumbers: number[]
  /** Where the header row was found. Above 1 when a title banner precedes it. */
  headerRowNumber: number
}

export class SupplierSheetError extends Error {}

/** Header aliases, Arabic first. Compared after the same normalization as data. */
const COLUMNS: Record<keyof Omit<SupplierSheetRow, 'rowNumber'>, string[]> = {
  name_ar: ['اسم المورد بالعربية', 'اسم المورد', 'اسم الشركة', 'المورد', 'supplier name arabic', 'supplier name', 'name'],
  name_en: ['اسم المورد بالإنجليزية', 'الاسم بالإنجليزية', 'supplier name english', 'name en', 'english name'],
  city: ['المدينة', 'المنطقة', 'city', 'region'],
  email: ['البريد الإلكتروني', 'البريد', 'الايميل', 'email', 'e-mail'],
  whatsapp: ['واتساب', 'الجوال', 'رقم الجوال', 'الهاتف', 'whatsapp', 'mobile', 'phone'],
  contact_name: ['اسم مسؤول التواصل', 'مسؤول التواصل', 'جهة الاتصال', 'contact name', 'contact'],
  supplied_items: ['المواد التي يوردها', 'النشاط', 'التصنيفات', 'الفئة', 'التخصص', 'supplied items', 'activity', 'categories', 'category'],
  cr_number: ['السجل التجاري', 'رقم السجل التجاري', 'cr number', 'commercial registration'],
}

/** How far down the sheet we look for the header before giving up. */
const HEADER_SEARCH_DEPTH = 10

/**
 * Same alef / hamza / ta-marbuta folding the server uses for matching. Applied
 * to headers so «البريد الإلكترونى» and «البريد الإلكتروني» are one column.
 */
export function normalizeHeader(value: string): string {
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
 * One cell as text.
 *
 * Excel is typed where CSV is not, and the two traps are numbers and dates. A
 * commercial registration read back as the float 1010123456 must not become
 * "1010123456.0", and a cell Excel decided was a date must not become an
 * ISO timestamp with a timezone in the middle of a supplier name.
 */
export function coerceCell(value: SheetCell): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'boolean') return value ? 'نعم' : ''
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    return Number.isInteger(value) ? value.toFixed(0) : String(value)
  }
  // Excel exports are full of non-breaking spaces; they would defeat matching.
  return String(value).replace(/[\u00a0\u200f\u200e]/g, ' ').trim()
}

/**
 * Give a Saudi mobile back the zero Excel ate.
 *
 * A cell holding 0537009051 is a number to Excel, and it comes back as
 * 537009051. The server's contact normalizer already folds a bare 5xxxxxxxx up
 * to 9665xxxxxxxx, so matching survives either way — but the preview table
 * shows the owner his own data, and a number he does not recognise reads as a
 * parsing bug. Restoring it here keeps the display honest and keeps every
 * downstream consumer, not just the tolerant one, seeing the real number.
 *
 * Deliberately narrow: only the 9-digit mobile shape. Widening it to any
 * 9-digit number would prepend a zero to genuine international numbers.
 */
export function restoreLeadingZero(text: string): string {
  return /^5\d{8}$/.test(text) ? `0${text}` : text
}

function isBlankRow(row: SheetCell[]): boolean {
  return !row.some((cell) => coerceCell(cell))
}

type ColumnMap = Record<keyof typeof COLUMNS, number>

/** Column index per field for a given header row, or -1 when absent. */
function mapColumns(headerCells: SheetCell[]): { index: ColumnMap; exactName: boolean } {
  const headers = headerCells.map((cell) => normalizeHeader(coerceCell(cell)))
  let exactName = false
  const columnOf = (key: keyof typeof COLUMNS): number => {
    const aliases = COLUMNS[key].map(normalizeHeader)
    // Exact before partial: «اسم المورد» must not capture a «اسم مسؤول التواصل»
    // column just because the words overlap.
    const exact = headers.findIndex((header) => aliases.includes(header))
    if (exact >= 0) {
      if (key === 'name_ar' || key === 'name_en') exactName = true
      return exact
    }
    return headers.findIndex((header) => header && aliases.some((alias) => header.includes(alias)))
  }
  return {
    index: {
      name_ar: columnOf('name_ar'),
      name_en: columnOf('name_en'),
      city: columnOf('city'),
      email: columnOf('email'),
      whatsapp: columnOf('whatsapp'),
      contact_name: columnOf('contact_name'),
      supplied_items: columnOf('supplied_items'),
      cr_number: columnOf('cr_number'),
    },
    exactName,
  }
}

/**
 * Does this row look like headers, as opposed to prose that happens to contain
 * the word «المورد»?
 *
 * Cover sheets are the reason this exists. A «تعليمات» tab whose instructions
 * read «املأ ورقة الموردون» matches the name alias on a substring, and a line
 * listing «اسم المورد، النشاط» matches two aliases — but both put every match
 * in the same single cell. Headers occupy separate columns, so requiring two
 * matches in DISTINCT columns separates a real header row from a sentence.
 *
 * A cell that is exactly an alias is accepted on its own; whole-cell equality
 * is a strong enough signal that prose will not reach it.
 */
function looksLikeHeaderRow({ index, exactName }: { index: ColumnMap; exactName: boolean }): boolean {
  if (index.name_ar < 0 && index.name_en < 0) return false
  if (exactName) return true
  const columns = new Set(Object.values(index).filter((column) => column >= 0))
  return columns.size >= 2
}

/**
 * Build supplier rows from a grid whose indices are the real file positions.
 *
 * Callers must pass blank rows through rather than filtering them out. Dropping
 * a blank row before this point would renumber everything below it, and the
 * row numbers are the entire value of a rejection message: «صف 7» has to be the
 * line he opens in Excel and fixes.
 */
export function buildSupplierParse(grid: SheetCell[][]): SupplierSheetParse {
  if (!grid.length || grid.every(isBlankRow)) throw new SupplierSheetError('الملف فارغ.')

  // A title banner over merged cells is a normal way to start a real supplier
  // list, so the header is not always the first row. Find the first row that
  // actually names a supplier column instead of assuming.
  let headerIndex = -1
  let index: ColumnMap | null = null
  for (let candidate = 0; candidate < Math.min(grid.length, HEADER_SEARCH_DEPTH); candidate += 1) {
    if (isBlankRow(grid[candidate]!)) continue
    const mapped = mapColumns(grid[candidate]!)
    if (looksLikeHeaderRow(mapped)) {
      headerIndex = candidate
      index = mapped.index
      break
    }
  }

  if (headerIndex < 0 || !index) {
    const firstRow = grid.find((row) => !isBlankRow(row)) || []
    throw new SupplierSheetError(
      `لم نتعرّف على عمود اسم المورد. الأعمدة المقروءة: ${
        firstRow.map(coerceCell).filter(Boolean).join('، ') || '—'
      }. أضف عمودًا باسم «اسم المورد».`,
    )
  }

  const at = (row: SheetCell[], column: number): string =>
    column >= 0 ? coerceCell(row[column]) : ''

  const rows: SupplierSheetRow[] = []
  const unreadableRowNumbers: number[] = []

  for (let position = headerIndex + 1; position < grid.length; position += 1) {
    const row = grid[position]!
    // Trailing and interleaved blank rows are skipped but still consume their
    // number, so everything below keeps the position the owner sees.
    if (isBlankRow(row)) continue
    const parsed: SupplierSheetRow = {
      rowNumber: position + 1,
      name_ar: at(row, index.name_ar),
      name_en: at(row, index.name_en),
      city: at(row, index.city),
      email: at(row, index.email),
      whatsapp: restoreLeadingZero(at(row, index.whatsapp)),
      contact_name: at(row, index.contact_name),
      supplied_items: at(row, index.supplied_items),
      cr_number: at(row, index.cr_number),
    }
    const anyRecognised = Object.entries(parsed).some(([key, value]) => key !== 'rowNumber' && value)
    // A row with content in unmapped columns only is surfaced, not skipped: a
    // silently dropped row is the failure this whole flow exists to prevent.
    if (!anyRecognised) unreadableRowNumbers.push(parsed.rowNumber)
    else rows.push(parsed)
  }

  // Two different problems, two different messages: nothing below the header at
  // all is a file he never filled in, whereas rows that yielded nothing means
  // his columns are not the ones being read.
  if (!rows.length) {
    throw new SupplierSheetError(
      unreadableRowNumbers.length
        ? 'لم نجد أي صف يحتوي على بيانات مورد.'
        : 'الملف لا يحتوي على صفوف بعد العناوين.',
    )
  }

  return {
    rows,
    headers: grid[headerIndex]!.map(coerceCell).filter(Boolean),
    unreadableRowNumbers,
    headerRowNumber: headerIndex + 1,
  }
}
