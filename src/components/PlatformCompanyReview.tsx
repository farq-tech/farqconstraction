import { useEffect, useState } from 'react'
import { getConstructionMe, getPlatformReviewCompanies } from '../api/constructionClient'
import { getPlatformReviewScope, setPlatformReviewScope } from '../api/platformReviewScope'
import { useFarqSession } from '../api/useFarqSession'
import { useProcurement } from '../procurementContext'

export default function PlatformCompanyReview() {
  const session = useFarqSession()
  const { navigate } = useProcurement()
  const [companies, setCompanies] = useState<Array<{ owner_user_id: string; label: string }> | null>(null)
  const [selected, setSelected] = useState(getPlatformReviewScope() || '')
  const [error, setError] = useState('')
  const [allowed, setAllowed] = useState(false)
  useEffect(() => {
    let cancelled = false
    setAllowed(false); setCompanies(null); setError(''); setSelected(getPlatformReviewScope() || '')
    if (!session.user?.id) return
    const userId = session.user.id
    getConstructionMe().then(async me => {
      if (cancelled || me.user_id !== userId || me.permissions?.view_all_company_booklets !== true) return
      setAllowed(true)
      try { const result = await getPlatformReviewCompanies(); if (!cancelled) setCompanies(result.companies) }
      catch { if (!cancelled) setError('تعذر تحميل قائمة الشركات. أعد تحميل الصفحة للمحاولة.') }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [session.user?.id])
  if (!allowed) return null
  return <section className="mx-4 mt-4 rounded-xl border border-[#123F3A]/20 bg-white p-4 text-sm" aria-label="مراجعة مالك المنصة">
    <label className="flex flex-wrap items-center gap-3">مراجعة مالك المنصة
      <select className="max-w-full rounded-lg border border-neutral-200 p-2" value={selected} disabled={!companies} onChange={event => {
        const next = event.target.value
        setSelected(next); setPlatformReviewScope(next || null); navigate('rfq-list')
      }}><option value="">حسابي</option>{companies?.map(company => <option key={company.owner_user_id} value={company.owner_user_id}>{company.label}</option>)}</select>
    </label>
    {selected && <p className="mt-2 text-neutral-600">مراجعة شركة أخرى للقراءة فقط — الأعداد الفعلية والكراسات.</p>}
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
  </section>
}
