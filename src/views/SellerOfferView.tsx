import { useEffect, useMemo, useState } from 'react'
import { fetchInvite, submitSellerOffer } from '../api/taseerClient'

function tokenFromLocation(): string {
  try {
    const path = window.location.pathname
    if (path.startsWith('/s/')) return decodeURIComponent(path.slice(3).split('/')[0] || '')
    return new URLSearchParams(window.location.search).get('supplier_token') || ''
  } catch {
    return ''
  }
}

export function SellerOfferView() {
  const token = useMemo(tokenFromLocation, [])
  const [need, setNeed] = useState('')
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [personName, setPersonName] = useState('')
  const [personPhone, setPersonPhone] = useState('')
  const [personEmail, setPersonEmail] = useState('')
  const [amount, setAmount] = useState('')
  const [extraAmount, setExtraAmount] = useState('')
  const [includesMaterials, setIncludesMaterials] = useState<boolean | undefined>(undefined)
  const [includesAttendance, setIncludesAttendance] = useState<boolean | undefined>(undefined)
  const [includesDelivery, setIncludesDelivery] = useState<boolean | undefined>(undefined)
  const [deliveryAmount, setDeliveryAmount] = useState('')
  const [appointment, setAppointment] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('الرابط غير صالح.')
      return
    }
    fetchInvite(token)
      .then((invite) => {
        setNeed(invite.need)
        setTitle(invite.listingTitle)
        if (invite.sellerName) setPersonName(invite.sellerName)
      })
      .catch(() => setError('هذا الرابط غير معروف أو انتهت صلاحيته.'))
  }, [token])

  const submit = async () => {
    if (!token || saving) return
    setSaving(true)
    setError('')
    try {
      const result = await submitSellerOffer({
        token,
        amount,
        extraAmount,
        deliveryAmount,
        includesMaterials,
        includesAttendance,
        includesDelivery,
        appointment,
        notes,
        personName,
        personPhone,
        personEmail,
      })
      setDone(
        result.priorOffers > 0
          ? 'تم حفظ عرضك، وأُضيف إلى سجلّك السابق.'
          : 'تم حفظ عرضك.',
      )
    } catch {
      setError('تعذّر حفظ العرض. أعد المحاولة.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-full px-4 py-8" dir="rtl">
      <div className="text-2xl font-black text-[#0D1F1D] mb-1">تقديم العرض</div>
      <div className="text-sm text-neutral-500 mb-6">فرق تسعير</div>
      {need && (
        <div className="mb-5 rounded-2xl bg-white border border-neutral-100 px-4 py-3 text-sm">
          <div className="text-neutral-400 text-xs mb-1">الاحتياج</div>
          <div className="font-bold text-[#0D1F1D] break-words">{need}</div>
          {title && <div className="text-xs text-neutral-500 mt-1 break-words">{title}</div>}
        </div>
      )}
      {done ? (
        <div className="rounded-2xl bg-[#f0faf7] text-[#123F3A] font-bold px-4 py-4">{done}</div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <input className={field} placeholder="اسمك أو اسم المحل" value={personName} onChange={(e) => setPersonName(e.target.value)} />
          <input className={field} placeholder="الجوال (اختياري)" value={personPhone} onChange={(e) => setPersonPhone(e.target.value)} dir="ltr" />
          <input className={field} placeholder="البريد (اختياري)" value={personEmail} onChange={(e) => setPersonEmail(e.target.value)} dir="ltr" />
          <input className={field} placeholder="السعر أو العرض" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input className={field} placeholder="مبلغ إضافي إن وُجد (غير التوصيل)" value={extraAmount} onChange={(e) => setExtraAmount(e.target.value)} />
          <input className={field} placeholder="الموعد (مثال: اليوم 7 مساءً)" value={appointment} onChange={(e) => setAppointment(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-[#0D1F1D]">
            <input
              type="checkbox"
              checked={includesMaterials === true}
              onChange={(e) => setIncludesMaterials(e.target.checked ? true : false)}
            />
            يشمل المواد
          </label>
          <label className="flex items-center gap-2 text-sm text-[#0D1F1D]">
            <input
              type="checkbox"
              checked={includesAttendance === true}
              onChange={(e) => setIncludesAttendance(e.target.checked ? true : false)}
            />
            يشمل الحضور
          </label>
          <label className="flex items-center gap-2 text-sm text-[#0D1F1D]">
            <input
              type="checkbox"
              checked={includesDelivery === true}
              onChange={(e) => setIncludesDelivery(e.target.checked ? true : false)}
            />
            يشمل التوصيل أو النقل
          </label>
          {includesDelivery === true && (
            <input
              className={field}
              placeholder="مبلغ التوصيل أو النقل إن وُجد (اختياري)"
              value={deliveryAmount}
              onChange={(e) => setDeliveryAmount(e.target.value)}
            />
          )}
          <textarea className={`${field} min-h-24`} placeholder="ملاحظات" value={notes} onChange={(e) => setNotes(e.target.value)} />
          {error && <div className="text-sm font-semibold text-red-700">{error}</div>}
          <button type="submit" disabled={saving || !token} className="w-full py-3 rounded-xl bg-[#123F3A] text-white font-bold disabled:opacity-40">
            تقديم العرض
          </button>
        </form>
      )}
    </div>
  )
}

const field = 'w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm bg-white outline-none'
