import { useEffect, useState } from 'react'
import { fetchTaseerSupplier, fetchTaseerSuppliers } from '../api/taseerClient'

export function TaseerSellersView() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchTaseerSuppliers>>>([])
  const [open, setOpen] = useState<string | null>(null)
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchTaseerSupplier>> | null>(null)

  useEffect(() => {
    fetchTaseerSuppliers().then(setRows).catch(() => setRows([]))
  }, [])

  useEffect(() => {
    if (!open) {
      setDetail(null)
      return
    }
    fetchTaseerSupplier(open).then(setDetail).catch(() => setDetail(null))
  }, [open])

  return (
    <div className="px-4 py-8" dir="rtl">
      <h1 className="text-2xl font-black text-[#0D1F1D] mb-2">البائعون</h1>
      <p className="text-sm text-neutral-500 mb-6">سجل العروض كما قدّموها — بلا تقييم مخترع.</p>
      {rows.length === 0 ? (
        <div className="text-sm text-neutral-500">ما فيه عروض محفوظة بعد.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <button
              key={row.key}
              type="button"
              onClick={() => setOpen(open === row.key ? null : row.key)}
              className="w-full text-right rounded-2xl bg-white border border-neutral-100 px-4 py-3"
            >
              <div className="font-bold text-[#0D1F1D] break-words">{row.name}</div>
              <div className="text-xs text-neutral-500 mt-1">
                {row.offerCount} عرض
                {row.offerCount > 1 ? ' — سبق أن قدّم' : ''}
                {row.personPhone ? ` · ${row.personPhone}` : ''}
              </div>
              {open === row.key && detail && (
                <div className="mt-3 space-y-2 text-xs text-neutral-600">
                  {detail.offers.map((offer) => (
                    <div key={offer.id} className="rounded-xl bg-[#FAFAF8] px-3 py-2">
                      <div className="font-semibold">{offer.need}</div>
                      {offer.amount && <div>العرض: {offer.amount}</div>}
                      {offer.notes && <div className="break-words">{offer.notes}</div>}
                      <div className="text-neutral-400">{new Date(offer.submittedAt).toLocaleString('ar-SA')}</div>
                    </div>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
