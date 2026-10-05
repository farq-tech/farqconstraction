import { describe, it, expect } from "vitest"
import {
  cheapestSupplier,
  buildBookletMatrix,
  statedValidityLabel,
  waveLabel,
} from "./booklet"
import { quoteCoverage, groupTimeline, lowestPerLine } from "./requestFile"
import type {
  ConstructionBookletOffer,
  ConstructionComparison,
} from "../api/constructionClient"
const offer = (
  supplier_id: string,
  price: number,
  tax: boolean | null = false,
): ConstructionBookletOffer => ({
  supplier_id,
  unit_price: price,
  total: price * 10,
  currency: "SAR",
  uom: "م",
  rfq_id: "r",
  quote_version_id: "q",
  notes: null,
  prices_include_tax: tax,
})
describe("meeting audit regressions", () => {
  it("does not call one invited line full coverage of a six-line request", () => {
    expect(
      quoteCoverage(
        { coverage: { requested: 1, priced: 1, complete: true } },
        6,
      ),
    ).toMatchObject({
      complete: false,
      requested: 6,
      priced: 1,
      label: "عرض جزئي — 1 من 6 بنود الطلب",
    })
  })
  it("compares only known matching VAT and currency, with competing suppliers", () => {
    expect(cheapestSupplier([offer("a", 1)])).toBeNull()
    expect(cheapestSupplier([offer("a", 1), offer("b", 2, true)])).toBeNull()
    expect(cheapestSupplier([offer("a", 1), offer("b", 2, null)])).toBeNull()
    expect(cheapestSupplier([offer("a", 1), offer("b", 2)])).toBe("a")
    expect(cheapestSupplier([offer("a", 1), offer("b", 1)])).toBeNull()
    expect(cheapestSupplier([offer("a", -1), offer("b", 2)])).toBeNull()
  })
  it("does not trust an incompatible server best pick", () => {
    const matrix = buildBookletMatrix({
      lines: [
        { line_key: "l", position: 1, name_ar: "بند", quantity: 10, uom: "م" },
      ],
      matrix: [
        {
          line_key: "l",
          best_supplier_id: "a",
          offers: [offer("a", 1), offer("b", 2, true)],
        },
      ],
    })
    expect(matrix.rows[0]!.best_supplier_id).toBeNull()
  })
  it("keeps wave identity without a misleading position denominator", () => {
    expect(waveLabel(6, 5)).toBe("دفعة رقم 6")
    expect(waveLabel(2, 5)).toBe("دفعة رقم 2")
  })
  it("ignores supplier validity because all offers follow the booklet deadline", () => {
    expect(statedValidityLabel("2020-01-05")).toBeNull()
  })
  it("groups sending by its recorded minute and preserves the individual evidence", () => {
    const events = [
      { key: "a", at: "2026-10-05T10:01:20Z", title: "تم إرسال الطلب إلى أ" },
      { key: "b", at: "2026-10-05T10:01:10Z", title: "تم إرسال الطلب إلى ب" },
      { key: "c", at: null, title: "تم استلام عرض من ج" },
    ]
    const grouped = groupTimeline(events)
    expect(grouped).toHaveLength(2)
    expect(grouped[0]!.children).toEqual(events.slice(0, 2))
    expect(grouped[1]).toEqual(events[2])
  })
  it('uses the newest dated supplier version and holds undated contradictory repeats', () => {
    const detail = { lines: [{ line_key: 'l', position: 1, name_ar: 'بند', quantity: 10, uom: 'م' }], matrix: [{ line_key: 'l', best_supplier_id: null, offers: [{ ...offer('a', 1), submitted_at: '2026-10-01T10:00:00Z' }, { ...offer('a', 3), submitted_at: '2026-10-02T10:00:00Z' }, offer('b', 2)] }] }
    const row = buildBookletMatrix(detail).rows[0]!
    expect(row.cells.get('a')!.unit_price).toBe(3)
    expect(row.best_supplier_id).toBe('b')
    detail.matrix[0]!.offers.forEach((o) => { delete (o as ConstructionBookletOffer).submitted_at })
    expect(buildBookletMatrix(detail).rows[0]!.cells.get('a')!.held).toBe(true)
  })

})
