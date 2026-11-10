import {
  coerceCell,
  normalizeHeader,
  type SheetCell,
} from "./supplierImportSheet"
import type { ParsedLine } from "./parseBoq"

export type BoqSpreadsheetSheet = {
  name: string
  headers: string[]
  expectedRows: number
  lines: ParsedLine[]
  issues: string[]
  error: string | null
}

export type BoqSpreadsheetWorkbook = {
  sheets: BoqSpreadsheetSheet[]
  selected: number
}

export const BOQ_CSV_MAX_BYTES = 10 * 1024 * 1024
export const BOQ_XLSX_MAX_BYTES = 10 * 1024 * 1024
const BOQ_XLSX_MAX_UNPACKED_BYTES = 30 * 1024 * 1024
const BOQ_XLSX_MAX_SHEETS = 30
const BOQ_HEADER_SEARCH_ROWS = 100
const BOQ_MAX_ROWS = 50_000
const BOQ_MAX_COLUMNS = 200
const BOQ_MAX_CELL_CHARS = 20_000

const COLUMNS = {
  name: [
    "اسم البند",
    "البند",
    "اسم المادة",
    "المادة",
    "الوصف",
    "وصف البند",
    "item name",
    "item",
    "description",
    "material",
    "product",
  ],
  quantity: ["الكمية", "العدد", "كمية", "quantity", "qty"],
  unit: ["الوحدة", "وحدة", "unit", "uom"],
  spec: [
    "المواصفة",
    "المواصفات",
    "المواصفة الفنية",
    "التفاصيل",
    "specification",
    "specifications",
    "spec",
    "details",
  ],
  code: [
    "رقم البند",
    "رمز البند",
    "كود البند",
    "الرقم",
    "الرمز",
    "item code",
    "item number",
    "code",
    "number",
  ],
} as const

type Field = keyof typeof COLUMNS
type Columns = Record<Field, number>

function mapHeader(row: SheetCell[]): { columns: Columns; headers: string[] } {
  const headers = row.map((cell) => normalizeHeader(coerceCell(cell)))
  const find = (field: Field) => {
    const aliases = COLUMNS[field].map(normalizeHeader)
    const exact = headers.findIndex((header) => aliases.includes(header))
    return exact >= 0
      ? exact
      : headers.findIndex((header) =>
          aliases.some(
            (alias) => alias.length > 2 && header.startsWith(`${alias} `),
          ),
        )
  }
  return {
    headers: row.map(coerceCell).filter(Boolean),
    columns: {
      name: find("name"),
      quantity: find("quantity"),
      unit: find("unit"),
      spec: find("spec"),
      code: find("code"),
    },
  }
}

function normalizeQuantity(raw: string): string | null {
  let value = raw
    .normalize("NFKC")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[\s\u00a0]/g, "")
    .replace(/[٬']/g, "")
    .replace("٫", ".")
  // Excel exports in comma-decimal locales (for example `1.234,5`) use dots
  // for grouping and commas for the decimal mark. Handle that before the
  // simpler decimal-comma case below or a valid quantity becomes `1.234.5`.
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(value)) {
    value = value.replace(/\./g, "").replace(",", ".")
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(value)) {
    value = value.replace(/,/g, "")
  } else if (value.includes(",")) value = value.replace(",", ".")
  if (!/^\d+(\.\d+)?$/.test(value)) return null
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? String(number) : null
}

function parseGrid(name: string, grid: SheetCell[][]): BoqSpreadsheetSheet {
  assertGridLimits(grid)
  let headerIndex = -1
  let columns: Columns | null = null
  let headers: string[] = []
  for (let i = 0; i < Math.min(grid.length, BOQ_HEADER_SEARCH_ROWS); i += 1) {
    const mapped = mapHeader(grid[i] || [])
    if (
      mapped.columns.name >= 0 &&
      mapped.columns.quantity >= 0 &&
      mapped.columns.unit >= 0
    ) {
      headerIndex = i
      columns = mapped.columns
      headers = mapped.headers
      break
    }
  }
  if (headerIndex < 0 || !columns) {
    return {
      name,
      headers: [],
      expectedRows: 0,
      lines: [],
      issues: [],
      error: "لم نجد صف عناوين يحتوي أعمدة اسم البند، الكمية، والوحدة.",
    }
  }

  const lines: ParsedLine[] = []
  const issues: string[] = []
  let expectedRows = 0
  for (let rowIndex = headerIndex + 1; rowIndex < grid.length; rowIndex += 1) {
    const row = grid[rowIndex] || []
    const values = row.map(coerceCell)
    if (!values.some((value) => value.trim())) continue
    expectedRows += 1
    const rowNumber = rowIndex + 1
    const at = (column: number) =>
      column >= 0 ? coerceCell(row[column]).trim() : ""
    const itemName = at(columns.name)
    const quantity = normalizeQuantity(at(columns.quantity))
    const unit = at(columns.unit)
    const missing: string[] = []
    if (!itemName) missing.push("اسم البند")
    if (!quantity) missing.push("كمية موجبة")
    if (!unit) missing.push("الوحدة")
    if (missing.length) {
      issues.push(`صف ${rowNumber}: لم يُقرأ (${missing.join("، ")}).`)
      continue
    }
    const code = at(columns.code)
    lines.push({
      id: rowNumber,
      name: itemName.slice(0, 240),
      qty: quantity!,
      unit: unit.slice(0, 60),
      ...(at(columns.spec) ? { spec: at(columns.spec).slice(0, 900) } : {}),
      ...(code ? { itemCode: code.slice(0, 100) } : {}),
    })
  }
  return { name, headers, expectedRows, lines, issues, error: null }
}

export function parseBoqCsv(text: string): BoqSpreadsheetWorkbook {
  if (new TextEncoder().encode(text).byteLength > BOQ_CSV_MAX_BYTES) {
    throw new Error("ملف CSV أكبر من الحد المسموح (10 م.ب.). قسّمه إلى ملفات أصغر ثم أعد المحاولة.")
  }
  const body = String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/\s+$/, "")
  if (!body.trim()) throw new Error("ملف CSV فارغ.")
  const delimiter = detectCsvDelimiter(body)
  return {
    sheets: [parseGrid("CSV", parseCsvGrid(body, delimiter))],
    selected: 0,
  }
}

export async function readBoqCsv(file: File): Promise<BoqSpreadsheetWorkbook> {
  if (file.size > BOQ_CSV_MAX_BYTES) {
    throw new Error("ملف CSV أكبر من الحد المسموح (10 م.ب.). قسّمه إلى ملفات أصغر ثم أعد المحاولة.")
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  let text: string
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      text = new TextDecoder("utf-16le", { fatal: true }).decode(bytes.subarray(2))
    } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      text = new TextDecoder("utf-16be", { fatal: true }).decode(bytes.subarray(2))
    } else {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    }
  } catch {
    throw new Error("تعذّر فك ترميز CSV. احفظه بترميز UTF-8 أو UTF-16 ثم أعد المحاولة.")
  }
  return parseBoqCsv(text)
}

function detectCsvDelimiter(text: string): string {
  // Supplier and BOQ exports often start with a title row before the real
  // headers. Score several logical rows so that preambles cannot make us pick
  // commas by default for an otherwise tab- or semicolon-separated file.
  const sample = csvSample(text, BOQ_HEADER_SEARCH_ROWS)
  const scored = [",", ";", "\t"].map((delimiter) => {
    try {
      const rows = parseCsvGrid(sample, delimiter).slice(
        0,
        BOQ_HEADER_SEARCH_ROWS,
      )
      const useful = rows.filter((row) => row.length > 1)
      const hasBoqHeader = rows.some((row) => {
        const columns = mapHeader(row).columns
        return columns.name >= 0 && columns.quantity >= 0 && columns.unit >= 0
      })
      return {
        delimiter,
        hasBoqHeader,
        score: useful.length * 100 + useful.reduce((sum, row) => sum + row.length, 0),
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("حد 200 عمودًا") || error.message.includes("حد 20000 حرفًا"))
      ) {
        throw error
      }
      return { delimiter, hasBoqHeader: false, score: -1 }
    }
  })
  return (
    scored.sort(
      (a, b) =>
        Number(b.hasBoqHeader) - Number(a.hasBoqHeader) || b.score - a.score,
    )[0]?.delimiter || ","
  )
}

function csvSample(text: string, maxRows: number): string {
  let quoted = false
  let rows = 0
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '"') {
      if (quoted && text[index + 1] === '"') index += 1
      else quoted = !quoted
    } else if (text[index] === "\n" && !quoted) {
      rows += 1
      if (rows >= maxRows) return text.slice(0, index + 1)
    }
  }
  return text
}

function parseCsvGrid(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  let afterQuote = false
  let lineNumber = 1
  let quoteStartedAt = 0
  const pushField = () => {
    if (row.length >= BOQ_MAX_COLUMNS) {
      throw new Error(`يتجاوز CSV حد ${BOQ_MAX_COLUMNS} عمودًا في السطر ${lineNumber}.`)
    }
    row.push(field.replace(/\r$/, ""))
    field = ""
  }
  const pushRow = () => {
    pushField()
    if (rows.length >= BOQ_MAX_ROWS) {
      throw new Error(`يتجاوز CSV حد ${BOQ_MAX_ROWS} صفًا. قسّمه إلى ملفات أصغر ثم أعد المحاولة.`)
    }
    rows.push(row)
    row = []
    lineNumber += 1
  }
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
        afterQuote = true
      } else {
        field += char
      }
      if (field.length > BOQ_MAX_CELL_CHARS) {
        throw new Error(`يتجاوز نص الخلية حد ${BOQ_MAX_CELL_CHARS} حرفًا قرب السطر ${quoteStartedAt}.`)
      }
      continue
    }
    if (char === '"') {
      if (field.length !== 0 || afterQuote) {
        throw new Error(`اقتباس CSV في غير موضعه في السطر ${lineNumber}.`)
      }
      quoted = true
      quoteStartedAt = lineNumber
      continue
    }
    if (afterQuote && char !== delimiter && char !== "\n" && char !== "\r" && char !== " " && char !== "\t") {
      throw new Error(`بيانات بعد إغلاق اقتباس CSV في السطر ${lineNumber}.`)
    }
    if (char === delimiter) {
      pushField()
      afterQuote = false
      continue
    }
    if (char === "\n") {
      pushRow()
      afterQuote = false
      continue
    }
    if (afterQuote && (char === " " || char === "\t" || char === "\r")) continue
    field += char
    if (field.length > BOQ_MAX_CELL_CHARS) {
      throw new Error(`يتجاوز نص الخلية حد ${BOQ_MAX_CELL_CHARS} حرفًا في السطر ${lineNumber}.`)
    }
  }
  if (quoted) throw new Error(`اقتباس CSV غير مغلق بدأ في السطر ${quoteStartedAt}.`)
  pushField()
  if (rows.length >= BOQ_MAX_ROWS) {
    throw new Error(`يتجاوز CSV حد ${BOQ_MAX_ROWS} صفًا. قسّمه إلى ملفات أصغر ثم أعد المحاولة.`)
  }
  rows.push(row)
  return rows
}

function assertGridLimits(grid: SheetCell[][]) {
  if (grid.length > BOQ_MAX_ROWS) {
    throw new Error(`يتجاوز جدول Excel حد ${BOQ_MAX_ROWS} صفًا. قسّمه إلى ملفات أصغر ثم أعد المحاولة.`)
  }
  for (let rowIndex = 0; rowIndex < grid.length; rowIndex += 1) {
    const row = grid[rowIndex] || []
    if (row.length > BOQ_MAX_COLUMNS) {
      throw new Error(`يتجاوز جدول Excel حد ${BOQ_MAX_COLUMNS} عمودًا في الصف ${rowIndex + 1}.`)
    }
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      if (coerceCell(row[columnIndex]).length > BOQ_MAX_CELL_CHARS) {
        throw new Error(`يتجاوز نص خلية Excel حد ${BOQ_MAX_CELL_CHARS} حرفًا في الصف ${rowIndex + 1}.`)
      }
    }
  }
}

export async function readBoqExcel(
  file: File,
): Promise<BoqSpreadsheetWorkbook> {
  if (file.size > BOQ_XLSX_MAX_BYTES) {
    throw new Error("ملف XLSX أكبر من الحد المسموح (10 م.ب.). احذف الصور أو قسّمه إلى ملفات أصغر ثم أعد المحاولة.")
  }
  validateBoqXlsxArchive(new Uint8Array(await file.arrayBuffer()))
  const { default: readXlsxFile } = await import("read-excel-file/browser")
  let raw: Array<{ sheet: string; data: SheetCell[][] }>
  try {
    raw = ((await readXlsxFile(file)) as Array<{
      sheet: string
      data: SheetCell[][]
    }>)
  } catch (cause) {
    throw new Error(
      `تعذّر فتح ملف Excel. تأكد أنه بصيغة ‎.xlsx‎ وغير محمي بكلمة مرور. ${
        cause instanceof Error ? cause.message : ""
      }`.trim(),
    )
  }
  if (!Array.isArray(raw) || raw.length === 0)
    throw new Error("لا توجد أوراق عمل في ملف Excel.")
  if (raw.length > BOQ_XLSX_MAX_SHEETS) {
    throw new Error(`يتجاوز ملف XLSX حد ${BOQ_XLSX_MAX_SHEETS} ورقة عمل.`)
  }
  const sheets = raw.map((sheet, index) =>
    parseGrid(sheet.sheet || `ورقة ${index + 1}`, sheet.data || []),
  )
  const selectedWithLines = sheets.findIndex(
    (sheet) => !sheet.error && sheet.lines.length > 0,
  )
  const selected =
    selectedWithLines >= 0
      ? selectedWithLines
      : sheets.findIndex((sheet) => !sheet.error)
  if (selected < 0) {
    const reasons = sheets
      .map(
        (sheet) =>
          `«${sheet.name}»: ${sheet.error || "لم نجد صفوف بنود صالحة."}`,
      )
      .join("، ")
    throw new Error(`لم نعثر على ورقة فيها جدول بنود قابل للقراءة. ${reasons}`)
  }
  return { sheets, selected }
}

/** Check ZIP metadata before read-excel-file expands XML into browser memory. */
export function validateBoqXlsxArchive(bytes: Uint8Array) {
  const minEnd = Math.max(0, bytes.length - 65_557)
  let end = -1
  for (let at = bytes.length - 22; at >= minEnd; at -= 1) {
    if (bytes[at] === 0x50 && bytes[at + 1] === 0x4b && bytes[at + 2] === 0x05 && bytes[at + 3] === 0x06) {
      end = at
      break
    }
  }
  if (end < 0) throw new Error("ملف XLSX غير صالح أو تالف (بنية ZIP غير مكتملة). أعد حفظه بصيغة ‎.xlsx‎.")
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const entries = view.getUint16(end + 10, true)
  const directorySize = view.getUint32(end + 12, true)
  const directoryOffset = view.getUint32(end + 16, true)
  if (entries === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new Error("ملفات XLSX الكبيرة جدًا (ZIP64) غير مدعومة. قسّم الملف ثم أعد المحاولة.")
  }
  if (entries > 2_000 || directoryOffset + directorySize > end) {
    throw new Error("ملف XLSX غير صالح أو يحتوي عددًا غير مسموح من الملفات الداخلية.")
  }
  let at = directoryOffset
  let totalUnpacked = 0
  let sheetXmlCount = 0
  const decoder = new TextDecoder("utf-8", { fatal: true })
  for (let index = 0; index < entries; index += 1) {
    if (view.getUint32(at, true) !== 0x02014b50 || at + 46 > bytes.length) {
      throw new Error("ملف XLSX غير صالح أو تالف (سجل ZIP غير مكتمل).")
    }
    const unpacked = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const endEntry = at + 46 + nameLength + extraLength + commentLength
    if (unpacked === 0xffffffff || endEntry > bytes.length) {
      throw new Error("ملف XLSX يستخدم بنية ZIP64 أو سجلًا داخليًا غير صالح.")
    }
    let name = ""
    try {
      name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    } catch {
      throw new Error("ملف XLSX يحتوي أسماء ملفات داخلية بترميز غير صالح.")
    }
    totalUnpacked += unpacked
    if (/^xl\/worksheets\/sheet[^/]*\.xml$/i.test(name)) sheetXmlCount += 1
    if (totalUnpacked > BOQ_XLSX_MAX_UNPACKED_BYTES) {
      throw new Error("محتوى ملف XLSX بعد فك الضغط يتجاوز 30 م.ب. احذف الصور أو قسّمه إلى ملفات أصغر.")
    }
    at = endEntry
  }
  if (sheetXmlCount > BOQ_XLSX_MAX_SHEETS) {
    throw new Error(`يتجاوز ملف XLSX حد ${BOQ_XLSX_MAX_SHEETS} ورقة عمل.`)
  }
}

export function selectBoqSheet(
  workbook: BoqSpreadsheetWorkbook,
  sheetName: string,
): BoqSpreadsheetWorkbook {
  const selected = workbook.sheets.findIndex(
    (sheet) => sheet.name === sheetName && !sheet.error,
  )
  if (selected < 0)
    throw new Error("الورقة المختارة لا تحتوي عناوين جدول بنود مقروءة.")
  return { ...workbook, selected }
}
