/**
 * Reading the same supplier list when it arrives as a workbook.
 *
 * The owner works in Excel, so `.xlsx` is the native case and CSV is the
 * export. Cells reach `buildSupplierParse` as the identical grid the CSV reader
 * produces, which is what lets the same list give the same verdict either way.
 *
 * WHAT A WORKBOOK DOES THAT A CSV CANNOT
 * --------------------------------------
 *   - It has more than one sheet. Taking the first one silently is wrong: real
 *     supplier files routinely open on a «تعليمات» or cover sheet. Every sheet
 *     is parsed, the first one that yields suppliers is chosen, and the choice
 *     is named in the UI with the others offered.
 *   - Its cells are typed. A phone loses its leading zero and a commercial
 *     registration arrives as a float; both are handled in `coerceCell` and
 *     `restoreLeadingZero`.
 *   - It has merged cells and trailing empty rows. A merged title banner leaves
 *     the header on row 2, which `buildSupplierParse` finds by looking for the
 *     name column rather than assuming row 1.
 */

import {
  buildSupplierParse,
  SupplierSheetError,
  type SheetCell,
  type SupplierSheetParse,
} from './supplierImportSheet'

export type SupplierWorkbookSheet = {
  /** Sheet name as it appears on the tab in Excel. */
  name: string
  /** 1-based tab position. */
  position: number
  /** Rows the sheet occupies, before interpretation. */
  rowCount: number
  /** Suppliers found, or null when the sheet has no supplier columns. */
  parse: SupplierSheetParse | null
  /** Why this sheet yielded nothing, in Arabic, when it yielded nothing. */
  error: string | null
}

export type SupplierWorkbook = {
  sheets: SupplierWorkbookSheet[]
  /** Index into `sheets` of the one that was read. */
  selected: number
}

export function isExcelFilename(name: string): boolean {
  return /\.xlsx$/i.test(name)
}

export function isLegacyExcelFilename(name: string): boolean {
  return /\.xls$/i.test(name)
}

/**
 * Parse every sheet and pick the one that actually holds suppliers.
 *
 * `read-excel-file` is loaded on demand: it carries an unzip and an XML parser,
 * and the supplier screen should not pay for them until a workbook is chosen.
 * The `/browser` entry point is the same one the main Farq frontend imports.
 */
export async function readSupplierWorkbook(file: File | Blob): Promise<SupplierWorkbook> {
  const { default: readXlsxFile } = await import('read-excel-file/browser')

  let workbook: RawWorkbook
  try {
    // Reading every sheet in one pass; the default export returns them all.
    workbook = (await readXlsxFile(file as File)) as never
  } catch (cause) {
    throw new SupplierSheetError(
      `تعذّر فتح ملف Excel — تأكد أنه بصيغة ‎.xlsx‎ وغير محمي بكلمة مرور. (${
        cause instanceof Error ? cause.message : 'خطأ غير معروف'
      })`,
    )
  }

  return selectSupplierSheet(workbook)
}

/** A workbook as `read-excel-file` hands it over, from any of its entry points. */
export type RawWorkbook = Array<{ sheet: string; data: SheetCell[][] }>

/**
 * Parse every sheet and choose one — the whole decision, with no file reading
 * in it, so the browser reader and the verification script exercise the same
 * code and the "same file, same result" claim covers the choice too.
 */
export function selectSupplierSheet(workbook: RawWorkbook): SupplierWorkbook {
  if (!Array.isArray(workbook) || !workbook.length) {
    throw new SupplierSheetError('لا توجد أوراق عمل في الملف.')
  }

  const sheets: SupplierWorkbookSheet[] = workbook.map((sheet, offset) => {
    const data = Array.isArray(sheet?.data) ? sheet.data : []
    try {
      return {
        name: sheet?.sheet || `ورقة ${offset + 1}`,
        position: offset + 1,
        rowCount: data.length,
        parse: buildSupplierParse(data),
        error: null,
      }
    } catch (cause) {
      return {
        name: sheet?.sheet || `ورقة ${offset + 1}`,
        position: offset + 1,
        rowCount: data.length,
        parse: null,
        error: cause instanceof Error ? cause.message : 'تعذّرت قراءة الورقة.',
      }
    }
  })

  const selected = sheets.findIndex((sheet) => sheet.parse)
  if (selected < 0) {
    // Every sheet failed; lead with the first sheet's reason rather than a
    // generic one, since that is usually the sheet he meant to upload.
    const named = sheets.map((sheet) => `«${sheet.name}»: ${sheet.error}`).join(' — ')
    throw new SupplierSheetError(`لم نجد موردين في أي ورقة. ${named}`)
  }

  return { sheets, selected }
}
