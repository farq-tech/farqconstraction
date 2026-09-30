import { useEffect, useMemo, useState } from 'react'
import type { NavProps } from '../types'
import { ClockIcon } from '../icons'
import {
  ConstructionApiError,
  closeConstructionBooklet,
  formatRfqApiStatus,
  getConstructionBooklet,
  type ConstructionBookletDetail,
} from '../api/constructionClient'
import { useProcurement } from '../procurementContext'
import MarketNameNote from '../components/MarketNameNote'
import OwnerControl from '../components/OwnerControl'
import PriceReviewNote from '../components/priceReview/PriceReviewNote'
import SupplierScoreBadge from '../components/priceReview/SupplierScoreBadge'
import VatUnknownChip from '../components/priceReview/VatUnknownChip'
import { useConstructionAdmin } from '../components/priceReview/useConstructionAdmin'
import { heldSummaryLabel } from '../lib/priceReview'
import {
  bookletClosed,
  bookletDeadline,
  bookletMoney,
  bookletStateLabel,
  columnTotal,
  buildBookletMatrix,
  coverage,
  formatQuantity,
  sortWaves,
  statedValidityLabel,
  waveLabel,
} from '../lib/booklet'

/**
 * One booklet (الكراسة), every wave (دفعة) at once.
 *
 * The same BOQ sent as several RFQs used to leave its quotes scattered across
 * as many comparisons. Here each supplier who quoted is one column, however
 * many waves invited him, and each line shows its best offer. The award still
 * happens inside each request.
 *
 * Supplier quotes never expire («عروض الموردين لا تنتهي الصلاحية»): the
 * booklet is «مفتوحة» until the account admin closes it here («إغلاق
 * الكراسة»), which ends quoting on every wave. A supplier's stated validity is
 * shown as neutral information only.
 */
export function BookletView({ navigate }: NavProps) {
  const { selectedBookletId, openRfq } = useProcurement()
  const [data, setData] = useState<ConstructionBookletDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ status?: number; message: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [confirmingClose, setConfirmingClose] = useState(false)
  const [closeNote, setCloseNote] = useState('')
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)
  const isAdmin = useConstructionAdmin()

  async function closeBooklet() {
    if (!selectedBookletId || closing) return
    setClosing(true)
    setCloseError(null)
    try {
      setData(await closeConstructionBooklet(selectedBookletId, closeNote.trim()))
      setConfirmingClose(false)
    } catch (err) {
      const status = err instanceof ConstructionApiError ? err.status : undefined
      setCloseError(status === 403 ? 'تقدر تغلق الكراسات المسندة لك فقط.' : err instanceof Error ? err.message : 'تعذّر إغلاق الكراسة')
    } finally {
      setClosing(false)
    }
  }

  useEffect(() => {
    if (!selectedBookletId) {
      setLoading(false)
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    getConstructionBooklet(selectedBookletId)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (cancelled) return
        setData(null)
        setError({
          status: err instanceof ConstructionApiError ? err.status : undefined,
          message: err instanceof Error ? err.message : 'تعذّر تحميل الكراسة',
        })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedBookletId, attempt])

  // After an ownership transfer: re-read in place, without the loading screen.
  const refresh = async () => {
    if (!selectedBookletId) return
    setData(await getConstructionBooklet(selectedBookletId))
  }

  const matrix = useMemo(() => buildBookletMatrix(data), [data])
  const waves = useMemo(() => sortWaves(data?.waves), [data])

  const back = (
    <button onClick={() => navigate('booklets')} className="text-neutral-400 hover:text-neutral-600">
      الكراسات
    </button>
  )

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8">
        <div className="text-xs mb-2">{back}</div>
        <div className="text-center py-20 text-sm text-neutral-500">جارٍ تحميل الكراسة…</div>
      </div>
    )
  }

  if (!selectedBookletId || error || !data) {
    const notFound = !selectedBookletId || error?.status === 404
    return (
      <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8">
        <div className="text-xs mb-2">{back}</div>
        <h1 className="text-2xl font-black text-[#0D1F1D] mb-2">{notFound ? 'لم نجد هذه الكراسة' : 'تعذّرت قراءة الكراسة'}</h1>
        <p className="text-sm text-neutral-500 mb-4">
          {notFound
            ? 'قد تكون حُذفت أو لا تملك صلاحية عرضها. ارجع إلى قائمة الكراسات واختر واحدة.'
            : `${error?.message || ''} — هذا فشل في القراءة، وليس دليلًا على عدم وجود عروض.`}
        </p>
        <div className="flex gap-2">
          {!notFound && (
            <button onClick={() => setAttempt((n) => n + 1)} className="px-4 py-2 bg-[#123F3A] text-white font-bold rounded-xl text-sm">
              أعد المحاولة
            </button>
          )}
          <button onClick={() => navigate('booklets')} className="px-4 py-2 border border-neutral-200 text-[#123F3A] font-bold rounded-xl text-sm">
            كل الكراسات
          </button>
        </div>
      </div>
    )
  }

  const { booklet, summary } = data
  const deadline = bookletDeadline(booklet?.quote_deadline)
  const cov = coverage(summary?.lines_with_quotes ?? matrix.lines_with_offers, summary?.lines_total ?? matrix.lines_total)
  const bestFull = summary?.best_full_booklet || null
  const bestFullName = bestFull
    ? matrix.columns.find((c) => c.supplier_id === String(bestFull.supplier_id))?.name ||
      (data.suppliers || []).find((s) => String(s.supplier_id) === String(bestFull.supplier_id))?.name ||
      'مورد'
    : null
  const noQuotes = matrix.columns.length === 0
  const closed = bookletClosed(booklet)

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 py-6 lg:py-8">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2 flex-wrap text-xs">
          {back}
          <span className="text-neutral-300">/</span>
          {booklet?.reference && (
            <span dir="ltr" className="font-mono text-neutral-400">
              {booklet.reference}
            </span>
          )}
          <span className="px-2 py-0.5 rounded-full font-semibold bg-[#f0faf7] text-[#123F3A]">
            {waves.length} {waves.length === 1 ? 'دفعة' : 'دفعات'}
          </span>
          <span
            className={`px-2 py-0.5 rounded-full font-bold ${closed ? 'bg-neutral-100 text-neutral-600' : 'bg-[#e8f5ee] text-[#1a7a45]'}`}
          >
            {bookletStateLabel(booklet)}
          </span>
        </div>
        <h1 className="text-2xl lg:text-3xl font-black text-[#0D1F1D] leading-tight">
          {booklet?.title || booklet?.reference || 'كراسة'}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-neutral-600">
          {deadline ? (
            <span className="flex items-center gap-1">
              <ClockIcon className="w-4 h-4" /> الموعد المطلوب للعروض: {deadline.label}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-neutral-400">
              <ClockIcon className="w-4 h-4" /> لم يُحدَّد موعد للعروض
            </span>
          )}
          <span className="text-xs text-neutral-400">
            {closed ? 'العروض نهائية منذ إغلاق الكراسة' : 'العروض سارية حتى إغلاق الكراسة'}
          </span>
          {booklet?.id && (
            <OwnerControl
              subject="booklet"
              id={booklet.id}
              owner={booklet.owner}
              assignedUserId={booklet.assigned_user_id}
              onTransferred={refresh}
            />
          )}
        </div>
      </div>

      {/* Booklet state: open until the admin closes it */}
      {closed ? (
        <div className="mb-5 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm">
          <div className="font-bold text-[#0D1F1D]">
            الكراسة مغلقة{booklet?.closed_at ? ` منذ ${bookletDeadline(booklet.closed_at)?.label || ''}` : ''}
          </div>
          <div className="text-xs text-neutral-600 mt-1">
            لا يستطيع الموردون تقديم عروض جديدة أو تعديل عروضهم، ويبقى بإمكانهم الاطلاع عليها. كل العروض المستلمة متاحة للمقارنة
            والترسية.
          </div>
          {booklet?.closure_note && <div className="text-xs text-neutral-500 mt-1">سبب الإغلاق: {booklet.closure_note}</div>}
        </div>
      ) : confirmingClose ? (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <div className="font-bold text-[#0D1F1D]">إغلاق الكراسة؟</div>
          <p className="text-xs text-neutral-700 mt-1">
            يُغلق استقبال العروض في كل الدفعات ({waves.length}). لن يستطيع أي مورد تقديم عرض جديد أو تعديل عرضه بعد الإغلاق، وتبقى
            العروض المستلمة متاحة للمقارنة والترسية. لا يمكن التراجع عن الإغلاق من هنا.
          </p>
          <textarea
            value={closeNote}
            onChange={(e) => setCloseNote(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="سبب الإغلاق (اختياري)"
            className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
          />
          {closeError && <div className="text-xs text-red-700 mt-1">{closeError}</div>}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => void closeBooklet()}
              disabled={closing}
              className="px-4 py-2 bg-[#123F3A] text-white font-bold rounded-xl text-sm disabled:opacity-60"
            >
              {closing ? 'جارٍ الإغلاق…' : 'تأكيد إغلاق الكراسة'}
            </button>
            <button
              onClick={() => {
                setConfirmingClose(false)
                setCloseError(null)
              }}
              disabled={closing}
              className="px-4 py-2 border border-neutral-200 text-[#123F3A] font-bold rounded-xl text-sm"
            >
              تراجع
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm">
          <span className="text-neutral-600">
            الكراسة مفتوحة: عروض الموردين لا تنتهي صلاحيتها، ويستطيعون تقديمها وتعديلها حتى تُغلق الكراسة.
          </span>
          <button
            onClick={() => setConfirmingClose(true)}
            className="shrink-0 px-3 py-1.5 border border-neutral-200 text-[#123F3A] font-bold rounded-lg text-xs hover:bg-neutral-50"
          >
            إغلاق الكراسة
          </button>
        </div>
      )}

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <Tile value={String(summary?.unique_suppliers_invited ?? 0)} label="موردون فريدون" />
        <Tile value={String(summary?.replies ?? 0)} label="ردود" />
        <Tile value={String(summary?.quotes ?? 0)} label="عروض" strong={(summary?.quotes ?? 0) > 0} />
        <Tile value={cov.label} label="تغطية البنود" />
      </div>
      <div className="mb-5 bg-white border border-neutral-100 rounded-2xl px-4 py-3">
        <div className="flex items-baseline justify-between mb-1.5 text-sm">
          <span className="font-semibold text-[#0D1F1D]">{cov.label} بنود لها عرض واحد على الأقل</span>
          <span className="text-xs text-neutral-400 tabular-nums">{cov.percent}%</span>
        </div>
        <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
          <div className="h-full rounded-full bg-[#1a7a45]" style={{ width: `${cov.percent}%` }} />
        </div>
      </div>

      {/* Waves */}
      <section className="mb-6">
        <h2 className="text-lg font-black text-[#0D1F1D] mb-2">الدفعات</h2>
        {waves.length === 0 ? (
          <div className="text-center py-8 bg-white border border-neutral-100 rounded-2xl text-sm text-neutral-500">
            لم تُرسل أي دفعة من هذه الكراسة بعد.
          </div>
        ) : (
          <div className="bg-white border border-neutral-100 rounded-2xl divide-y divide-neutral-50">
            {waves.map((w) => (
              <div key={`${w.wave_number}-${w.rfq_id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-bold text-[#0D1F1D] text-sm">{waveLabel(w.wave_number, waves.length)}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    {formatRfqApiStatus(w.status)} · {w.invites ?? 0} {w.invites === 1 ? 'دعوة' : 'دعوات'}
                  </div>
                </div>
                {w.rfq_id && (
                  <button
                    onClick={() => openRfq(w.rfq_id, 'rfq-detail')}
                    className="shrink-0 px-3 py-1.5 border border-neutral-200 text-[#123F3A] font-bold rounded-lg text-xs hover:bg-neutral-50"
                  >
                    فتح الطلب
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Best full booklet */}
      {bestFull && (
        <div className="mb-4 rounded-2xl border border-[#1a7a45]/30 bg-[#f0faf7] px-4 py-3 text-sm">
          <span className="font-bold text-[#1a7a45]">أفضل عرض للكراسة كاملة: </span>
          <span className="font-semibold text-[#0D1F1D]">{bestFullName}</span>
          <span className="text-[#123F3A]"> — {bookletMoney(bestFull.total, bestFull.currency)}</span>
          <div className="text-[11px] text-neutral-500 mt-1">
            أقل إجمالي بين الموردين الذين سعّروا كل البنود. مقارنة حسابية فقط، وليست ترسية.
          </div>
        </div>
      )}

      {/* Unified comparison */}
      <section>
        <h2 className="text-lg font-black text-[#0D1F1D] mb-2">مقارنة موحّدة لكل الدفعات</h2>
        {noQuotes ? (
          <div className="text-center py-16 bg-white border border-neutral-100 rounded-2xl">
            <div className="font-semibold text-[#0D1F1D] mb-1">لم يصل أي عرض على هذه الكراسة بعد</div>
            <p className="text-sm text-neutral-500">تظهر المقارنة هنا فور وصول أول عرض مسعّر من أي دفعة.</p>
          </div>
        ) : (
          <div className="bg-white border border-neutral-100 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-right">
                  <th className="sticky right-0 z-10 bg-white px-4 py-3 font-bold text-[#0D1F1D] min-w-[200px]">البند</th>
                  {matrix.columns.map((c) => (
                    <th key={c.supplier_id} className="px-4 py-3 font-bold text-[#0D1F1D] min-w-[150px] align-top">
                      {c.name}
                      <SupplierScoreBadge score={c.score} className="ms-1.5" />
                      {c.price_review_held && (
                        <div className="text-[10px] font-semibold text-amber-800 mt-0.5">
                          {heldSummaryLabel({ held: true, lines: c.held_lines })}
                        </div>
                      )}
                      {c.tax_unknown && <VatUnknownChip value={null} className="mt-0.5" />}
                      <div className="text-[10px] font-semibold text-neutral-400 mt-0.5">
                        {c.waves.length ? `دفعة ${c.waves.join('، ')}` : ''}
                        {c.waves.length ? ' · ' : ''}
                        {c.priced_lines} من {matrix.lines_total} بنود
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.line_key} className={`border-b border-neutral-50 align-top ${row.no_offers ? 'bg-amber-50/40' : ''}`}>
                    <td className={`sticky right-0 z-10 px-4 py-3 ${row.no_offers ? 'bg-amber-50' : 'bg-white'}`}>
                      <div className="font-semibold text-[#0D1F1D]">
                        {row.position != null && <span className="text-neutral-400 tabular-nums me-1">{row.position}.</span>}
                        {row.name}
                      </div>
                      <MarketNameNote name={row.market_name} />
                      <div className="text-xs text-neutral-400">{formatQuantity(row.quantity, row.uom)}</div>
                      {row.no_offers && (
                        <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">بلا عروض</span>
                      )}
                    </td>
                    {matrix.columns.map((c) => {
                      const cell = row.cells.get(c.supplier_id)
                      return (
                        <td
                          key={c.supplier_id}
                          className={`px-4 py-3 ${cell?.best ? 'bg-[#f0faf7] ring-1 ring-inset ring-[#1a7a45]/30' : cell?.held ? 'bg-amber-50/50' : ''}`}
                        >
                          {cell?.held ? (
                            <>
                              {cell.unit_price != null && (
                                <div className="text-xs text-neutral-400 line-through decoration-amber-400/70">
                                  {bookletMoney(cell.unit_price, cell.currency)}
                                </div>
                              )}
                              {cell.price_review ? (
                                <PriceReviewNote
                                  review={cell.price_review}
                                  currency={cell.currency}
                                  rfqId={cell.rfq_id}
                                  quoteVersionId={cell.quote_version_id}
                                  isAdmin={isAdmin}
                                  onResolved={() => refresh().catch(() => {})}
                                />
                              ) : (
                                <span className="inline-block mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                  يحتاج مراجعة
                                </span>
                              )}
                            </>
                          ) : cell ? (
                            <>
                              <div className={`font-semibold ${cell.best ? 'text-[#1a7a45]' : 'text-[#0D1F1D]'}`}>
                                {bookletMoney(cell.unit_price, cell.currency)}
                              </div>
                              <div className="text-xs text-neutral-400">الإجمالي {bookletMoney(cell.total, cell.currency)}</div>
                              {cell.best && <div className="text-[10px] font-bold text-[#1a7a45] mt-0.5">الأفضل لهذا البند</div>}
                              <VatUnknownChip value={cell.prices_include_tax} className="mt-0.5" />
                              {cell.notes && <div className="text-[10px] text-neutral-500 mt-0.5 line-clamp-2">{cell.notes}</div>}
                              {statedValidityLabel(cell.valid_until) && (
                                <div className="text-[10px] text-neutral-400 mt-0.5">{statedValidityLabel(cell.valid_until)}</div>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-neutral-400">لم يسعّره</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <tr className="bg-[#f0faf7]">
                  <td className="sticky right-0 z-10 bg-[#f0faf7] px-4 py-3 font-black text-[#0D1F1D]">إجمالي العرض</td>
                  {matrix.columns.map((c) => (
                    <td key={c.supplier_id} className="px-4 py-3">
                      {(() => {
                        const t = columnTotal(matrix, c)
                        return (
                          <>
                            <div className="font-black text-[#123F3A]">{bookletMoney(t.value, c.currency)}</div>
                            {t.value != null && t.of > 0 && (
                              <div className="text-[10px] text-neutral-500">
                                {t.priced === t.of ? 'كل البنود' : `سعّر ${t.priced} من ${t.of} بنود`}
                                {!t.complete && ' · بدون التوصيل'}
                              </div>
                            )}
                          </>
                        )
                      })()}
                      {bestFull && String(bestFull.supplier_id) === c.supplier_id && (
                        <div className="text-[10px] font-semibold text-[#1a7a45]">الأفضل للكراسة كاملة</div>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            {matrix.rows.length === 0 && (
              <div className="px-4 py-3 text-xs text-neutral-500">لم يُرجع الخادم بنود الكراسة؛ الإجماليات أعلاه هي ما وصل.</div>
            )}
            <div className="px-4 py-3 text-[11px] text-neutral-400 border-t border-neutral-50">
              كل مورد يظهر مرة واحدة مهما تعددت الدفعات التي دُعي فيها. «الأفضل لهذا البند» أقل سعر وحدة بين العروض المستلمة،
              وليس ترسية؛ الترسية تتم من داخل كل طلب. السعر «يحتاج مراجعة» لا يدخل المقارنة ولا الإجمالي حتى يُعتمد.
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function Tile({ value, label, strong }: { value: string; label: string; strong?: boolean }) {
  return (
    <div className="bg-white border border-neutral-100 rounded-2xl px-3 py-3 text-center">
      <div className={`text-2xl font-black tabular-nums ${strong ? 'text-[#1a7a45]' : 'text-[#0D1F1D]'}`}>{value}</div>
      <div className="text-[11px] text-neutral-500 mt-0.5">{label}</div>
    </div>
  )
}

export default BookletView
