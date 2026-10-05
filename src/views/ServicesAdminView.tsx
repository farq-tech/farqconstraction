import { useEffect, useMemo, useState } from 'react'
import type { NavProps } from '../types'
import {
  listServiceAccounts,
  setAccountService,
  type ConstructionService,
  type ConstructionServiceAccount,
} from '../api/constructionClient'
import { refreshServices, useServices } from '../api/useServices'

/*
 * «الخدمات» — Farq staff turn add-on services on or off per account.
 * The server refuses anyone else (staff only); the page just says so.
 */
export function ServicesAdminView({ navigate }: NavProps) {
  const services = useServices()
  const [catalog, setCatalog] = useState<ConstructionService[]>([])
  const [accounts, setAccounts] = useState<ConstructionServiceAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    listServiceAccounts()
      .then((result) => {
        if (cancelled) return
        setCatalog(result.services)
        setAccounts(result.accounts)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'تعذّر تحميل الحسابات.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return accounts
    return accounts.filter((a) => (a.email || '').toLowerCase().includes(q) || a.owner_user_id.includes(q))
  }, [accounts, query])

  async function toggle(account: ConstructionServiceAccount, service: ConstructionService) {
    const next = !account.services[service.key]
    const verb = next ? 'تفعيل' : 'إيقاف'
    if (!window.confirm(`${verb} «${service.name_ar}» لحساب ${account.email || account.owner_user_id}؟`)) return
    const id = `${account.owner_user_id}:${service.key}`
    setBusy(id)
    setError(null)
    try {
      await setAccountService(account.owner_user_id, service.key, next)
      setAccounts((list) =>
        list.map((a) => (a.owner_user_id === account.owner_user_id ? { ...a, services: { ...a.services, [service.key]: next } } : a)),
      )
      refreshServices()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'تعذّر حفظ التغيير.')
    } finally {
      setBusy(null)
    }
  }

  if (services.known && !services.canManage) {
    return (
      <div dir="rtl" className="max-w-sm mx-auto px-4 py-24 text-center">
        <h1 className="text-2xl font-black text-[#0D1F1D] mb-2">الخدمات</h1>
        <p className="text-neutral-500 text-sm mb-8">هذه الصفحة لفريق فرق فقط.</p>
        <button
          onClick={() => navigate('home')}
          className="px-6 py-3 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
        >
          العودة للرئيسية
        </button>
      </div>
    )
  }

  return (
    <div dir="rtl" className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-black text-[#0D1F1D] mb-1">الخدمات</h1>
      <p className="text-neutral-500 text-sm mb-6">فعّل أو أوقف الخدمات الإضافية لكل حساب. كل تغيير يُسجَّل باسمك.</p>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ابحث بالبريد"
        className="w-full sm:w-72 mb-4 px-3 py-2 border border-neutral-200 rounded-xl text-sm"
      />

      {error && <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>}

      {loading ? (
        <p className="text-neutral-500 text-sm">جارٍ التحميل…</p>
      ) : shown.length === 0 ? (
        <p className="text-neutral-500 text-sm">لا توجد حسابات.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="text-right font-bold px-4 py-3">الحساب</th>
                <th className="text-right font-bold px-4 py-3">الأعضاء</th>
                {catalog.map((service) => (
                  <th key={service.key} className="text-right font-bold px-4 py-3" title={service.description_ar}>
                    {service.name_ar}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((account) => (
                <tr key={account.owner_user_id} className="border-t border-neutral-100">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[#0D1F1D]" dir="ltr">
                      {account.email || '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{account.members}</td>
                  {catalog.map((service) => {
                    const on = account.services[service.key] === true
                    const id = `${account.owner_user_id}:${service.key}`
                    return (
                      <td key={service.key} className="px-4 py-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          aria-label={`${service.name_ar}: ${on ? 'مفعّلة' : 'موقفة'}`}
                          disabled={busy === id}
                          onClick={() => void toggle(account, service)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
                            on ? 'bg-[#123F3A] text-white hover:bg-[#1a5c54]' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                          }`}
                        >
                          {busy === id ? '…' : on ? 'مفعّلة' : 'موقفة'}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Shown in place of a screen whose service is off for this account. */
export function ServiceOffView({ navigate, serviceName }: NavProps & { serviceName: string }) {
  return (
    <div dir="rtl" className="max-w-sm mx-auto px-4 py-24 text-center">
      <h1 className="text-2xl font-black text-[#0D1F1D] mb-2">الخدمة غير مفعّلة</h1>
      <p className="text-neutral-500 text-sm leading-relaxed mb-8">
        خدمة «{serviceName}» غير مفعّلة في حسابك. تواصل مع فريق فرق لتفعيلها.
      </p>
      <button
        onClick={() => navigate('home')}
        className="w-full px-6 py-3 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm"
      >
        العودة للرئيسية
      </button>
    </div>
  )
}

export default ServicesAdminView
