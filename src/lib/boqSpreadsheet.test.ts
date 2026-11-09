import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  BOQ_CSV_MAX_BYTES,
  parseBoqCsv,
  readBoqCsv,
  selectBoqSheet,
  validateBoqXlsxArchive,
  type BoqSpreadsheetWorkbook,
} from "./boqSpreadsheet"

describe("BOQ spreadsheet intake", () => {
  it("reads Arabic CSV columns, quoted commas, Arabic digits, specs, and item codes", () => {
    const workbook = parseBoqCsv(
      '\uFEFFرقم البند,اسم البند,الكمية,الوحدة,المواصفة\r\n"B-01","أنابيب، ضغط عالٍ",١٬٢٠٠,متر,"PN16, مطابق"\r\nB-02,صمام رئيسي,2.5,حبة,معدني',
    )
    const sheet = workbook.sheets[workbook.selected]!
    expect(sheet.error).toBeNull()
    expect(sheet.lines).toEqual([
      {
        id: 2,
        itemCode: "B-01",
        name: "أنابيب، ضغط عالٍ",
        qty: "1200",
        unit: "متر",
        spec: "PN16, مطابق",
      },
      {
        id: 3,
        itemCode: "B-02",
        name: "صمام رئيسي",
        qty: "2.5",
        unit: "حبة",
        spec: "معدني",
      },
    ])
  })

  it("surfaces rows with a missing name, invalid quantity, or missing unit", () => {
    const sheet = parseBoqCsv(
      "اسم البند;الكمية;الوحدة;المواصفة\nمواسير;2;متر;حديد\n;3;حبة;صمام\nمضخة;كمية;حبة;كهرباء\nصمام;1;;نحاس",
    ).sheets[0]!
    expect(sheet.expectedRows).toBe(4)
    expect(sheet.lines).toHaveLength(1)
    expect(sheet.issues).toEqual([
      "صف 3: لم يُقرأ (اسم البند).",
      "صف 4: لم يُقرأ (كمية موجبة).",
      "صف 5: لم يُقرأ (الوحدة).",
    ])
  })

  it("rejects ambiguous workbook selection and switches to the requested table sheet", () => {
    const workbook: BoqSpreadsheetWorkbook = {
      sheets: [
        {
          name: "تعليمات",
          headers: [],
          expectedRows: 0,
          lines: [],
          issues: [],
          error: "لا جدول",
        },
        {
          name: "مواد",
          headers: ["اسم البند", "الكمية", "الوحدة"],
          expectedRows: 1,
          lines: [{ id: 2, name: "أسمنت", qty: "3", unit: "كيس" }],
          issues: [],
          error: null,
        },
        {
          name: "أجهزة",
          headers: ["اسم البند", "الكمية", "الوحدة"],
          expectedRows: 1,
          lines: [{ id: 2, name: "مضخة", qty: "1", unit: "عدد" }],
          issues: [],
          error: null,
        },
      ],
      selected: 1,
    }
    expect(selectBoqSheet(workbook, "أجهزة").selected).toBe(2)
    expect(() => selectBoqSheet(workbook, "تعليمات")).toThrow("لا تحتوي عناوين")
  })

  it("accepts decimal comma and semicolon CSV used by Arabic locale exports", () => {
    const sheet = parseBoqCsv("اسم البند;الكمية;الوحدة\nبلاط;2,5;م²").sheets[0]!
    expect(sheet.lines[0]?.qty).toBe("2.5")
  })

  it("detects the table delimiter after a title row", () => {
    const sheet = parseBoqCsv(
      "كراسة اختبار كبيرة - مشروع مجمع سكني\nم\tالبند\tالكمية\tالوحدة\n1\tبلاط بورسلين\t87\tم²\n2\tأرضيات رخام\t124\tم²",
    ).sheets[0]!
    expect(sheet.lines.map(({ name, qty, unit }) => ({ name, qty, unit }))).toEqual([
      { name: "بلاط بورسلين", qty: "87", unit: "م²" },
      { name: "أرضيات رخام", qty: "124", unit: "م²" },
    ])
  })

  it("does not mis-detect delimiters when the CSV title contains a quoted newline", () => {
    const sheet = parseBoqCsv(
      '"ملخص الكراسة\nنسخة للتسعير"\nاسم البند;الكمية;الوحدة\nمضخة;2;عدد',
    ).sheets[0]!
    expect(sheet.lines[0]?.name).toBe("مضخة")
  })

  it("reads the bundled 480-line tab-separated BOQ fixture", () => {
    const fixture = readFileSync(
      path.resolve(__dirname, "../../fixtures/boq/large-boq-480-lines.csv"),
      "utf8",
    )
    const sheet = parseBoqCsv(fixture).sheets[0]!
    expect(sheet.expectedRows).toBe(480)
    expect(sheet.lines).toHaveLength(480)
    expect(sheet.issues).toHaveLength(0)
  })

  it("rejects unclosed and misplaced CSV quotes instead of reading partial rows", () => {
    expect(() =>
      parseBoqCsv('اسم البند,الكمية,الوحدة\n"مواسير,2,متر'),
    ).toThrow("اقتباس CSV غير مغلق")
    expect(() =>
      parseBoqCsv('اسم البند,الكمية,الوحدة\nم"واسير,2,متر'),
    ).toThrow("اقتباس CSV في غير موضعه")
    expect(() =>
      parseBoqCsv('اسم البند,الكمية,الوحدة\n"مواسير"خطأ,2,متر'),
    ).toThrow("بيانات بعد إغلاق اقتباس CSV")
  })

  it("supports UTF-16 exports and rejects invalid UTF-8", async () => {
    const csv = "اسم البند,الكمية,الوحدة\nمواسير,2,متر"
    const utf16 = new Uint8Array(2 + csv.length * 2)
    utf16.set([0xff, 0xfe])
    const view = new DataView(utf16.buffer)
    Array.from(csv).forEach((char, index) =>
      view.setUint16(2 + index * 2, char.charCodeAt(0), true),
    )
    expect(
      (await readBoqCsv(new File([utf16], "items.csv"))).sheets[0]?.lines[0]
        ?.name,
    ).toBe("مواسير")
    await expect(
      readBoqCsv(new File([new Uint8Array([0xc3, 0x28])], "bad.csv")),
    ).rejects.toThrow("تعذّر فك ترميز CSV")
  })

  it("enforces CSV byte, row, column, and cell limits", () => {
    expect(() => parseBoqCsv("x".repeat(BOQ_CSV_MAX_BYTES + 1))).toThrow(
      "أكبر من الحد المسموح",
    )
    expect(() => parseBoqCsv("x\n".repeat(50_001))).toThrow("حد 50000 صفًا")
    expect(() =>
      parseBoqCsv(`${Array(202).fill("x").join("\t")}\n`),
    ).toThrow("حد 200 عمودًا")
    expect(() =>
      parseBoqCsv(`اسم البند,الكمية,الوحدة\n${"x".repeat(20_001)},1,عدد`),
    ).toThrow("حد 20000 حرفًا")
  })

  it("checks XLSX ZIP expansion metadata before opening workbook XML", () => {
    const name = new TextEncoder().encode("xl/worksheets/sheet1.xml")
    const centralOffset = 30 + name.length
    const endOffset = centralOffset + 46 + name.length
    const bytes = new Uint8Array(endOffset + 22)
    const view = new DataView(bytes.buffer)
    view.setUint32(0, 0x04034b50, true)
    view.setUint16(26, name.length, true)
    bytes.set(name, 30)
    view.setUint32(centralOffset, 0x02014b50, true)
    view.setUint32(centralOffset + 24, 31 * 1024 * 1024, true)
    view.setUint16(centralOffset + 28, name.length, true)
    bytes.set(name, centralOffset + 46)
    view.setUint32(endOffset, 0x06054b50, true)
    view.setUint16(endOffset + 8, 1, true)
    view.setUint16(endOffset + 10, 1, true)
    view.setUint32(endOffset + 12, 46 + name.length, true)
    view.setUint32(endOffset + 16, centralOffset, true)
    expect(() => validateBoqXlsxArchive(bytes)).toThrow(
      "بعد فك الضغط يتجاوز 30 م.ب.",
    )
    expect(() => validateBoqXlsxArchive(new Uint8Array([1, 2, 3]))).toThrow(
      "بنية ZIP غير مكتملة",
    )
  })
})
