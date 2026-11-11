export type BoqFileKind = "pdf" | "docx" | "xlsx" | "csv" | "unsupported"

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const CSV_MIMES = new Set(["text/csv", "application/csv"])

/**
 * Email/download flows sometimes give valid BOQs a generic filename or MIME.
 * Use either signal, and share the decision between the picker and parser so a
 * workbook accepted by the UI cannot later fall through to the PDF reader.
 */
export function boqFileKind(file: Pick<File, "name" | "type">): BoqFileKind {
  const name = String(file.name || "")
    .trim()
    .toLowerCase()
  const mime = String(file.type || "")
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase()

  if (name.endsWith(".docx") || mime === DOCX_MIME) return "docx"
  if (name.endsWith(".xlsx") || mime === XLSX_MIME) return "xlsx"
  if (name.endsWith(".csv") || CSV_MIMES.has(mime || "")) return "csv"
  if (name.endsWith(".pdf") || mime === "application/pdf") return "pdf"
  return "unsupported"
}
