import { useEffect, useRef, useState } from 'react'
import { ConstructionApiError, getQuoteDiscountRequests, createQuoteDiscountRequest, cancelQuoteDiscountRequest, type QuoteDiscountRequest } from '../api/constructionClient'
import { isReadOnlyBuild } from '../api/readOnlyMode'

type Props = { inviteId: string; quoteVersionId: string; supplierName: string; onClose: () => void }
function errorText(e: unknown): string {
  if (e instanceof ConstructionApiError) {
    const messages: Record<string, string> = {
      DISCOUNT_ALREADY_REQUESTED: 'يوجد طلب تخفيض لهذا الإصدار. أغلق النافذة وافتحها لعرض حالته.',
      DISCOUNT_QUOTE_CHANGED_OR_AWARDED: 'تغيّر العرض أو تمت الترسية. حدّث الصفحة لمراجعة الحالة الحالية.',
      DISCOUNT_SCHEDULER_UNAVAILABLE: 'الإرسال المجدول غير متاح لهذا الحساب حاليًا.',
      DISCOUNT_NOT_SCHEDULED: 'بدأ تنفيذ الطلب أو تغيّرت حالته؛ تعذّر إلغاؤه.',
      INBOX_OWNER_REQUIRED: 'طلب التخفيض متاح للموظف المسؤول عن مراسلات هذا الطلب.',
      INBOX_NEW_MESSAGE: 'وصلت رسالة جديدة من المورد. راجع المحادثة قبل طلب التخفيض.',
      INBOX_IDEMPOTENCY_CONFLICT: 'هذا الطلب سبق تأكيده بمحتوى مختلف. راجع حالة الطلب قبل إعادة الإرسال.',
    }
    if (messages[e.code]) return messages[e.code]
  }
  return e instanceof Error ? e.message : 'تعذّر تنفيذ طلب التخفيض'
}
const labels: Record<string, string> = { SCHEDULED: 'مجدول — بانتظار أحمد', PROCESSING: 'جارٍ الإرسال', SENT: 'أُرسل طلب التخفيض', FAILED: 'تعذّر الإرسال', UNKNOWN: 'نتيجة الإرسال غير مؤكدة — راجع المحادثة', CANCELLED: 'أُلغي الطلب', SKIPPED: 'لم يُرسل: تغيّر العرض أو حالة الطلب أو الصلاحية' }
export default function DiscountRequestDialog({ inviteId, quoteVersionId, supplierName, onClose }: Props) {
  const [timing, setTiming] = useState<'now' | 'hour'>('now')
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState('')
  const [text, setText] = useState('')
  const [edited, setEdited] = useState(false)
  const [jobs, setJobs] = useState<QuoteDiscountRequest[]>([])
  const [canSchedule, setCanSchedule] = useState(false)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const key = useRef(crypto.randomUUID())
  const current = jobs.find(j => j.quote_version_id === quoteVersionId && j.state !== 'CANCELLED')
  const draft = `${timing === 'hour' ? 'السلام عليكم، معكم أحمد، مساعد المشتريات لشركة الدفع للتجارة والمقاولات.\n' : 'السلام عليكم،\n'}شكرًا على عرضكم. نرجو تقديم أفضل تخفيض ممكن على إجمالي العرض${target.trim() ? `، والتخفيض المطلوب ${target.trim()}` : ''}.${reason.trim() ? `\n${reason.trim()}` : ''}\nيرجى إرسال عرض منقح يوضح الخصم والإجمالي بعد التخفيض وأساس الضريبة، مع الحفاظ على المواصفات والكميات وشروط التوريد، أو توضيح أي تغيير فيها.`
  useEffect(() => { if (!edited) setText(draft) }, [draft, edited])
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const data = await getQuoteDiscountRequests(inviteId)
        if (active) { setJobs(data.requests); setCanSchedule(data.can_schedule); setReady(true); setError(null) }
      } catch (e) {
        if (active) setError(e instanceof ConstructionApiError && (e.status === 404 || e.status === 503) ? 'خدمة طلب التخفيض غير متاحة على الخادم الحالي.' : e instanceof Error ? e.message : 'تعذّر تحميل طلبات التخفيض')
      }
    }
    void load()
    const timer = window.setInterval(load, 10000)
    return () => { active = false; window.clearInterval(timer) }
  }, [inviteId])
  useEffect(() => {
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [onClose, busy])
  const send = async () => {
    if (busy || !ready || current || !text.trim()) return
    setBusy(true); setError(null)
    try {
      const result = await createQuoteDiscountRequest(inviteId, { idempotency_key: key.current, quote_version_id: quoteVersionId, delay_minutes: timing === 'hour' ? 60 : 0, text: text.trim() })
      setJobs(previous => [result, ...previous.filter(j => j.id !== result.id)])
    } catch (e) { setError(errorText(e)) }
    finally { setBusy(false) }
  }
  const cancel = async () => {
    if (!current) return
    setBusy(true); setError(null)
    try {
      const result = await cancelQuoteDiscountRequest(inviteId, current.id)
      setJobs(previous => previous.map(j => j.id === result.id ? result : j))
      key.current = crypto.randomUUID()
    } catch (e) { setError(errorText(e)) }
    finally { setBusy(false) }
  }
  return <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center sm:p-4" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="discount-title">
    <div className="bg-white w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
      <h2 id="discount-title" className="text-lg font-black">طلب تخفيض العرض</h2>
      <p className="text-sm text-neutral-500 mt-1 mb-4">{supplierName} — يشمل إجمالي هذا العرض فقط.</p>
      {current ? <div className="rounded-xl bg-neutral-50 p-4 space-y-2" role="status">
        <p className="font-bold">{labels[current.state] || 'حالة الطلب غير معروفة'}</p>
        {current.state === 'SCHEDULED' && <><p className="text-sm">موعد الإرسال: {new Date(current.send_at).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })} (بتوقيت الرياض). تستمر الجدولة بعد إغلاق الصفحة.</p><button disabled={busy || isReadOnlyBuild()} onClick={cancel} className="text-sm font-bold text-red-700 disabled:opacity-40">إلغاء الإرسال المجدول</button></>}
        {current.failure_code && <p className="text-xs text-neutral-600">رمز الحالة: {current.failure_code}</p>}
        <p className="whitespace-pre-wrap text-sm">{current.text}</p>
      </div> : <div className="space-y-4">
        <fieldset><legend className="text-sm font-bold mb-2">متى نرسل؟</legend><div className="grid grid-cols-2 gap-2">
          <label className={`border rounded-xl p-3 text-sm cursor-pointer ${timing === 'now' ? 'border-[#123F3A] bg-[#f3f7f5]' : 'border-neutral-200'}`}><input type="radio" name="discount-timing" checked={timing === 'now'} onChange={() => setTiming('now')} /> إرسال الآن</label>
          <label className={`border rounded-xl p-3 text-sm ${!canSchedule ? 'opacity-50' : 'cursor-pointer'} ${timing === 'hour' ? 'border-[#123F3A] bg-[#f3f7f5]' : 'border-neutral-200'}`}><input type="radio" name="discount-timing" disabled={!canSchedule} checked={timing === 'hour'} onChange={() => setTiming('hour')} /> يرسله أحمد بعد ساعة</label>
        </div></fieldset>
        {ready && !canSchedule && <p className="text-xs text-amber-700">الإرسال المجدول غير مفعّل لهذا الحساب حاليًا.</p>}
        {timing === 'hour' && <p className="text-xs text-neutral-500">بعد ساعة من تأكيدك. يُلغى الإرسال إذا تغيّر العرض أو تمت الترسية أو أُلغي الطلب.</p>}
        <label className="block text-sm font-semibold">التخفيض المطلوب (اختياري)<input autoFocus value={target} onChange={e => setTarget(e.target.value)} maxLength={120} placeholder="مثل: 5%، أو خصم 2,000 ريال" className="mt-1 w-full border border-neutral-200 rounded-xl p-3 font-normal" /></label>
        <label className="block text-sm font-semibold">السبب أو ملاحظة (اختياري)<input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} className="mt-1 w-full border border-neutral-200 rounded-xl p-3 font-normal" /></label>
        <label className="block text-sm font-semibold">الرسالة التي ستصل للمورد<textarea value={text} onChange={e => { setEdited(true); setText(e.target.value) }} maxLength={4000} className="mt-1 w-full border border-neutral-200 rounded-xl p-3 min-h-40 font-normal" /></label>
        {edited && <button onClick={() => setEdited(false)} className="text-xs text-[#123F3A] font-bold">استعادة النص المقترح</button>}
        <p className="text-xs text-neutral-500">طلب التخفيض لا يعدّل الأسعار أو يعتمد العرض. يبقى العرض السابق محفوظًا حتى يرسل المورد إصدارًا منقحًا.</p>
      </div>}
      {error && <p role="alert" className="mt-3 bg-red-50 text-red-700 rounded-xl p-3 text-sm">{error}</p>}
      {isReadOnlyBuild() && <p className="mt-3 text-xs text-amber-700">نسخة للقراءة فقط؛ الإرسال والجدولة معطّلان.</p>}
      <div className="mt-4 flex gap-2">
        {!current && <button disabled={busy || !ready || !text.trim() || isReadOnlyBuild() || (timing === 'hour' && !canSchedule)} onClick={send} className="flex-1 bg-[#123F3A] text-white rounded-xl py-3 font-bold text-sm disabled:opacity-40">{busy ? 'جارٍ التأكيد…' : timing === 'hour' ? 'تأكيد: يرسله أحمد بعد ساعة' : 'إرسال طلب التخفيض'}</button>}
        <button disabled={busy} onClick={onClose} className="border border-neutral-200 rounded-xl px-5 py-3 text-sm">إغلاق</button>
      </div>
    </div>
  </div>
}
