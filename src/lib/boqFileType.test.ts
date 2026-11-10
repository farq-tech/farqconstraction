import { describe, expect, it } from "vitest"
import { boqFileKind } from "./boqFileType"

describe("BOQ file type recognition", () => {
  it("recognizes standard PDF, XLSX, and CSV MIME types without filename extensions", () => {
    expect(boqFileKind({ name: "attachment", type: "application/pdf" })).toBe(
      "pdf",
    )
    expect(
      boqFileKind({
        name: "attachment",
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    ).toBe("xlsx")
    expect(
      boqFileKind({ name: "attachment", type: "text/csv; charset=utf-8" }),
    ).toBe("csv")
  })

  it("keeps extension recognition when downloads have a generic MIME type", () => {
    expect(
      boqFileKind({ name: "مواد.XLSX", type: "application/octet-stream" }),
    ).toBe("xlsx")
    expect(boqFileKind({ name: "جدول.csv", type: "" })).toBe("csv")
    expect(
      boqFileKind({ name: "كراسة.PDF", type: "application/octet-stream" }),
    ).toBe("pdf")
  })

  it("does not mistake legacy XLS for supported XLSX or CSV", () => {
    expect(
      boqFileKind({ name: "مواد.xls", type: "application/vnd.ms-excel" }),
    ).toBe("unsupported")
  })
})
