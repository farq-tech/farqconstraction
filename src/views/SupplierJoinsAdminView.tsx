import { useEffect, useMemo, useState } from 'react'
import type { NavProps } from '../types'
import {
  ConstructionApiError,
  createSupplierJoinLink,
  listSupplierJoins,
  type SupplierJoinRow,
  type SupplierJoinStatus,
} from '../api/constructionClient'

/*
 * «انضمام الموردين» — the owner's list (api GET /supplier-joins, owner only):
 * every supplier invited to join, and whether it joined or declined.
 */

const LABEL: Record<SupplierJoinStatus, string> = { INVITED: 'مدعو', JOINED: 'انضم', DECLINED: 'رفض' }
const TONE: Record<SupplierJoinStatus, string> = {
  INVITED: 'bg-amber-50 text-amber-800',
  JOINED: 'bg-[#CFF5DC] text-[#123F3A]',
  DECLINED: 'bg-neutral-100 text-neutral-600',
}

function day(value: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('ar-SA-u-nu-latn', { day: 'numeric', month: 'short' })
  } catch {
    return '—'
  }
}

export function SupplierJoinsAdminView({ navigate }: NavProps) {
  const [rows, setRows] = useState<SupplierJoinRow[]>([])
  const [counts, setCounts] = useState<Record<SupplierJoinStatus, number>>({ INVITED: 0, JOINED: 0, DECLINED: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [filter, setFilter] = useState<SupplierJoinStatus | 'ALL'>('ALL')

  useEffect(() => {
    let cancelled = false
    listSupplierJoins()
      .then((result) => {
        if (cancelled) return
        setRows(result.suppliers)
        setCounts(result.counts)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        if (e instanceof ConstructionApiError && e.status === 403) setForbidden(true)
        else setError(e instanceof Error ? e.message : 'تعذّر تحميل القائمة.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const shown = useMemo(() => (filter === 'ALL' ? rows : rows.filter((r) => r.status === filter)), [rows, filter])

  async function copyNewLink(row: SupplierJoinRow) {
    if (!window.confirm(`إنشاء رابط انضمام جديد لـ«${row.name || 'المورد'}»؟ الرابط السابق يتوقف. لا يُرسل شيء للمورد.`)) return
    try {
      const { url } = await createSupplierJoinLink(row.supplier_id)
      await navigator.clipboard?.writeText(url)
      window.alert('نُسخ الرابط. صالح 14 يوماً ولمرة واحدة.')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'تعذّر إنشاء الرابط.')
    }
  }

  if (forbidden) {
    return (
      <div dir="rtl" className="max-w-sm mx-auto px-4 py-24 text-center">
        <h1 className="text-2xl font-black text-[#0D1F1D] mb-2">انضمام الموردين</h1>
        <p className="text-neutral-500 text-sm mb-8">هذه الصفحة لمالك المنصة فقط.</p>
        <button onClick={() => navigate('home')} className="px-6 py-3 bg-[#123F3A] text-white font-bold rounded-xl text-sm">
          العودة للرئيسية
        </button>
      </div>
    )
  }

  return (
    <div dir="rtl" className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-black text-[#0D1F1D] mb-1">انضمام الموردين</h1>
      <p className="text-neutral-500 text-sm mb-5">الموردون اللي جهّزنا لهم حساب: من دُعي، من انضم، ومن رفض.</p>

      <div className="flex flex-wrap gap-2 mb-5">
        {(['ALL', 'INVITED', 'JOINED', 'DECLINED'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${filter === key ? 'bg-[#123F3A] text-white' : 'bg-neutral-100 text-neutral-600'}`}
          >
            {key === 'ALL' ? `الكل ${rows.length}` : `${LABEL[key]} ${counts[key] || 0}`}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>}

      {loading ? (
        <p className="text-neutral-500 text-sm">جارٍ التحميل…</p>
      ) : shown.length === 0 ? (
        <p className="text-neutral-500 text-sm">لا يوجد موردون في هذه القائمة.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="text-right font-bold px-4 py-3">المورد</th>
                <th className="text-right font-bold px-4 py-3">الجوال</th>
                <th className="text-right font-bold px-4 py-3">الحالة</th>
                <th className="text-right font-bold px-4 py-3">دُعي</th>
                <th className="text-right font-bold px-4 py-3">أحمد دعاه</th>
                <th className="text-right font-bold px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.supplier_id} className="border-t border-neutral-100">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[#0D1F1D]">{row.name || '—'}</div>
                    {row.city && <div className="text-[11px] text-neutral-400">{row.city}</div>}
                  </td>
                  <td className="px-4 py-3 text-neutral-600" dir="ltr">{row.phone_masked || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${TONE[row.status]}`}>{LABEL[row.status]}</span>
                    <span className="ms-2 text-[11px] text-neutral-400">
                      {row.status === 'JOINED' ? day(row.joined_at) : row.status === 'DECLINED' ? day(row.declined_at) : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{day(row.invited_at)}</td>
                  <td className="px-4 py-3 text-neutral-600">{row.ahmad_invited_at ? day(row.ahmad_invited_at) : '—'}</td>
                  <td className="px-4 py-3">
                    {row.status === 'INVITED' && (
                      <button onClick={() => void copyNewLink(row)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-neutral-100 text-[#123F3A]">
                        نسخ رابط جديد
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
