import {
  bookletMoney,
  formatQuantity,
  type BookletMatrix,
} from "../lib/booklet"

export default function BookletQuickComparison({
  matrix,
  onOpenRequest,
}: {
  matrix: BookletMatrix
  onOpenRequest: (id: string) => void
}) {
  return (
    <div className="p-4 border-b border-neutral-200 space-y-2">
      <h3 className="font-bold text-[#123F3A]">
        السعر الأقل بسرعة — حسب بنود الكراسة
      </h3>
      <p className="text-xs text-neutral-600">
        تظهر علامة الأقل عند وجود عرضين على الأقل بعملة وضريبة متطابقتين. انخفاض
        السعر لا يعني اعتماد المورد. مدة العروض موحدة حتى انتهاء مدة الكراسة، دون صلاحية منفصلة لكل مورد.
      </p>
      {matrix.rows.map((row) => {
        const cell = row.best_supplier_id
          ? row.cells.get(row.best_supplier_id)
          : null
        const name = matrix.columns.find(
          (c) => c.supplier_id === row.best_supplier_id,
        )?.name
        return (
          <details
            key={row.line_key}
            className="rounded-xl border border-neutral-200 p-3"
          >
            <summary className="cursor-pointer flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                {row.name}{" "}
                <span className="text-xs text-neutral-600">
                  {formatQuantity(row.quantity, row.uom)}
                </span>
              </span>
              <span className={`font-bold ${cell ? "text-[#1a7a45]" : row.no_offers ? "text-amber-800" : "text-neutral-600"}`}>
                {cell
                  ? `${bookletMoney(cell.unit_price, cell.currency)} · ${name}`
                  : row.no_offers
                    ? "بلا عروض"
                    : "راجع العروض — لا يوجد أقل منفرد قابل للمقارنة"}
              </span>
              <span className="text-xs text-neutral-600">تفاصيل العروض ▾</span>
            </summary>
            <div className="mt-3 space-y-2">
              {matrix.columns
                .filter((c) => row.cells.has(c.supplier_id))
                .sort(
                  (a, b) =>
                    Number(Boolean(row.cells.get(a.supplier_id)?.held)) -
                      Number(Boolean(row.cells.get(b.supplier_id)?.held)) ||
                    (row.cells.get(a.supplier_id)?.unit_price ?? Infinity) -
                      (row.cells.get(b.supplier_id)?.unit_price ?? Infinity),
                )
                .map((c) => {
                  const o = row.cells.get(c.supplier_id)!
                  return (
                    <div
                      key={c.supplier_id}
                      className="flex flex-wrap justify-between gap-2 border-t border-neutral-100 pt-2"
                    >
                      <span
                        className={o.best ? "font-bold text-[#1a7a45]" : ""}
                      >
                        {c.name}
                        {o.best ? " · الأقل" : ""}
                      </span>
                      <span>
                        {bookletMoney(o.unit_price, o.currency)} ·{" "}
                        {o.prices_include_tax === true
                          ? "شامل الضريبة"
                          : o.prices_include_tax === false
                            ? "غير شامل الضريبة"
                            : "الضريبة غير محددة"}
                        {o.held ? " · يحتاج مراجعة" : ""}
                        <span className="block text-xs text-neutral-600">
                          إجمالي البند: {bookletMoney(o.total, o.currency)}
                        </span>

                        <button
                          className="block text-xs font-bold text-[#123F3A] underline"
                          onClick={() => o.rfq_id && onOpenRequest(o.rfq_id)}
                        >
                          فتح الطلب ومراجعة الترسية
                        </button>
                      </span>
                    </div>
                  )
                })}
            </div>
          </details>
        )
      })}
    </div>
  )
}
