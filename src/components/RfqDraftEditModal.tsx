import { useState } from 'react'
import { updateConstructionRfqDraft, type ConstructionRfq } from '../api/constructionClient'

type Line = Record<string, unknown> & { line_key: string; name_ar: string; quantity: string; uom: string; item_note: string; spec_card: Record<string, unknown> }
export default function RfqDraftEditModal({ rfq, onClose, onSaved }: { rfq: ConstructionRfq; onClose: () => void; onSaved: () => void }) {
  const payload = rfq.current_version?.payload as { lines?: Record<string, unknown>[] }
  const [lines, setLines] = useState<Line[]>(() => (payload?.lines || []).map((l, i) => ({ ...l, line_key: String(l.line_key ?? `${i + 1}:${l.farq_spec_id}`), name_ar: String(l.name_ar || l.original_name || ''), quantity: String(l.quantity ?? ''), uom: String(l.uom || ''), item_note: String(l.item_note || ''), spec_card: { ...(l.spec_card as Record<string, unknown> || {}) } })))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  function change(index: number, key: string, value: string, spec = false) {
    setLines(old => old.map((line, i) => i !== index ? line : spec ? { ...line, spec_card: { ...line.spec_card, [key]: value } } : { ...line, [key]: value }))
  }
  async function save() {
    if (lines.some(l => !l.name_ar.trim() || !l.uom.trim() || !(Number(l.quantity) > 0))) { setError('أكمل اسم البند والكمية والوحدة.'); return }
    setBusy(true); setError('')
    try { await updateConstructionRfqDraft(rfq.id, String(rfq.current_version?.id), lines.map(l => ({ ...l, quantity: Number(l.quantity) }))); onSaved(); onClose() }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر الحفظ. حاول مرة أخرى.') }
    finally { setBusy(false) }
  }
  const input = 'w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white'
  return <div className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-3" dir="rtl">
    <section role="dialog" aria-modal="true" aria-labelledby="draft-edit-title" className="bg-white rounded-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col">
      <header className="p-4 border-b"><h2 id="draft-edit-title" className="font-bold text-lg">تعديل الطلب</h2><p className="text-sm text-neutral-500">تحفظ التعديلات في المسودة، ولا تُرسل للموردين.</p></header>
      <div className="overflow-y-auto p-4 space-y-4">
        {lines.map((l, i) => <fieldset key={l.line_key} disabled={busy} className="border rounded-xl p-3 space-y-3">
          <legend className="px-2 font-bold">البند {i + 1}</legend>
          <label className="block text-sm">اسم البند<input className={input} maxLength={300} value={l.name_ar} onChange={e => change(i, 'name_ar', e.target.value)} /></label>
          <div className="grid grid-cols-2 gap-3"><label className="text-sm">الكمية<input className={input} type="number" min="0.001" step="any" value={l.quantity} onChange={e => change(i, 'quantity', e.target.value)} /></label><label className="text-sm">الوحدة<input className={input} maxLength={40} value={l.uom} onChange={e => change(i, 'uom', e.target.value)} /></label></div>
          <div className="grid grid-cols-2 gap-3">{[['material', 'المادة'], ['finish', 'اللون / التشطيب'], ['dimensions', 'المقاس / العرض'], ['thickness', 'السماكة'], ['standard', 'المعيار']].map(([k, label]) => <label className="text-sm" key={k}>{label}<input className={input} maxLength={k === 'thickness' ? 80 : 160} value={String(l.spec_card[k] || '')} onChange={e => change(i, k, e.target.value, true)} /></label>)}</div>
          <label className="block text-sm">تفاصيل إضافية / الاستخدام / التصنيف<textarea className={input} rows={4} maxLength={2000} value={l.item_note} onChange={e => change(i, 'item_note', e.target.value)} /></label>
          <label className="block text-sm">رابط صورة المنتج<input className={input} dir="ltr" type="url" maxLength={500} placeholder="https://…" value={String(l.spec_card.reference_photo_url || '')} onChange={e => change(i, 'reference_photo_url', e.target.value, true)} /></label>
          <p className="text-xs text-neutral-500">أضف رابطًا مباشرًا للصورة الفعلية للمنتج.</p>
        </fieldset>)}
        {error && <p role="alert" className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</p>}
      </div>
      <footer className="p-4 border-t flex gap-3"><button disabled={busy || !lines.length} onClick={() => void save()} className="bg-[#123F3A] text-white px-4 py-2 rounded-xl font-bold disabled:opacity-50">{busy ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}</button><button disabled={busy} onClick={onClose} className="px-4 py-2 border rounded-xl">إلغاء</button></footer>
    </section>
  </div>
}
