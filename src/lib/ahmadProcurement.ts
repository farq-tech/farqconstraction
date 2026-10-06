import { getConstructionRfq, getConstructionComparison, updateConstructionRfqDraft, type ConstructionRfq, type ConstructionComparison, type AhmadDocument } from '../api/constructionClient'
import { farqSession } from '../api/farqSession'
export type DraftEditAction = { kind: 'edit'; label: string; rfqId: string; versionId: string; lines: Array<Record<string, unknown>>; userId: string; preview: string }
export type DiscountAction = { kind: 'discount'; label: string; inviteId: string; quoteVersionId: string; supplierName: string; userId: string }
export function missingSpecifications(r: ConstructionRfq) {
  const lines = r.current_version?.payload?.lines || []
  return lines.map((line, i) => {
    const l = line as Record<string, unknown>, spec = (l.spec_card || {}) as Record<string, unknown>
    const missing: string[] = []
    if (!l.quantity || Number(l.quantity) <= 0) missing.push('الكمية')
    if (!l.uom) missing.push('الوحدة')
    if (!spec.material) missing.push('الخامة / وصف المنتج')
    if (!spec.dimensions && !spec.thickness && !l.item_note) missing.push('المقاس أو المواصفة الفنية')
    if (/mastic|ماستك|butyl|شريط|لفة|لفه/i.test(String(l.name_ar || l.original_name))) {
      const description = JSON.stringify([spec,l.item_note])
      if (!/طول.{0,12}\d|\d.{0,8}(?:متر|m\b)/i.test(description)) missing.push('طول اللفة')
      if (!/\d.{0,10}(?:لفة|لفات)|(?:عدد اللفات).{0,10}\d/.test(description)) missing.push('عدد اللفات بالكرتون')
      if (!spec.reference_photo_url) missing.push('صورة فعلية أو ورقة مواصفات')
    }
    return missing.length ? `البند ${i+1} (${String(l.name_ar || l.original_name || 'بدون اسم')}): ${missing.join('، ')}` : null
  }).filter(Boolean)
}
export function comparisonSummary(c: ConstructionComparison, selectedQuote?: string | null) {
  const rows = c.supplier_responses.filter(r => !selectedQuote || String(r.offer.quoteVersionId) === selectedQuote)
  if (!rows.length) return 'لا يوجد عرض حالي في هذا السياق. لم تُفترض أي أسعار.'
  const matrix = c.quote_matrix?.supplier_summaries || []
  const eligible: Array<{name:string;total:number}> = []
  const summaries = rows.map(r => {
    const o=r.offer, name=r.supplier.name_ar || r.supplier.name_en || 'مورد', total=o.totals?.total
    const coverage=matrix.find(s=>s.supplier_id===r.supplier.id)?.coverage
    const tax=o.totals?.tax, currency=o.currency || 'عملة غير محددة'
    const knownTotal=typeof total==='number' && Number.isFinite(total) && total>=0
    const differences:string[]=[]
    for(const l of o.lines || []){const wanted=(c.rfq.current_version?.payload?.lines || []).find(w=>w.line_key && w.line_key===l.line_key);if(!wanted)continue;const spec=(wanted.spec_card || {}) as Record<string,unknown>, offered=(l.spec_card || {}) as Record<string,unknown>;for(const k of ['brand','thickness','dimensions','material','finish'])if(spec[k] && offered[k] && String(spec[k])!==String(offered[k]))differences.push(`${k}: المطلوب ${spec[k]}، المعروض ${offered[k]}`);if(l.quantity!=null && Number(l.quantity)!==Number(wanted.quantity))differences.push('كمية معروضة مختلفة عن الطلب')} 
    if(knownTotal && !differences.length && coverage?.complete && currency==='SAR') eligible.push({name,total})
    return `${name}: الإجمالي ${knownTotal?`${total} ${currency}`:'غير معروف'}؛ الضريبة ${typeof tax==='number'?tax:'غير معروفة'}؛ الشحن ${o.delivery ? JSON.stringify(o.delivery) : 'غير معروف'}؛ الرسوم ${o.mandatory_fees ? JSON.stringify(o.mandatory_fees) : 'غير معروفة'}؛ التوريد ${o.terms ? JSON.stringify(o.terms) : 'غير معروف'}؛ اختلافات معلنة ${differences.length?differences.join('، '):'لا توجد اختلافات يمكن إثباتها من الحقول المقروءة؛ المطابقة الفنية تحتاج تأكيدًا'}؛ تغطية البنود ${coverage?.complete?'كاملة':coverage?`${coverage.priced}/${coverage.requested}`:'غير معروفة'}.`
  })
  eligible.sort((a,b)=>a.total-b.total)
  return `${summaries.join('\n\n')}\n\n${eligible.length?`الأقل إجماليًا بين العروض مكتملة البنود وبعملة SAR: ${eligible[0].name}.`:'لا يمكن تحديد الأقل بين عروض متكافئة من البيانات المتاحة.'} لا يمكن الجزم بالأنسب قبل تأكيد تطابق المواصفات وأساس الضريبة والشحن؛ الإجمالي وحده لا يثبت المطابقة.\nالمصدر: عروض الطلب الحالية وبيان تغطية البنود. وقت القراءة: ${new Date().toISOString()}.`
}
export async function prepareDraftEdit(message: string, rfqId?: string | null): Promise<{text:string;action?:DraftEditAction}> {
  if(!rfqId)return {text:'افتح الطلب الذي تريد تعديله أولًا.'}
  const match=message.match(/(?:عدّل|عدل|غيّر|غير)\s+(السماكة|السماكه|العرض|المقاس|اللون|الخامة|الخامه|المادة|الماده|المعيار)\s*(?:للبند\s*(\d+)\s*)?(?:إلى|الى|إلي|الي|=|:)\s*(.+)/)
  if(!match)return {text:'حدد القيمة الجديدة مثل: عدّل السماكة إلى 5 مم. إذا فيه عدة بنود، اكتب: عدّل السماكة للبند 2 إلى 5 مم.'}
  const r=await getConstructionRfq(rfqId), lines=r.current_version?.payload?.lines || []
  if(r.status!=='DRAFT_NOT_SENT')return {text:'الطلب أُرسل أو أغلق؛ افتح تعديل الطلب لإعداد نسخة جديدة ومراجعة مستلميها.'}
  if(!match[2] && lines.length!==1)return {text:'حدد رقم البند حتى لا أغيّر بنودًا أخرى.'}
  const index=match[2]?Number(match[2])-1:0
  if(index<0||index>=lines.length)return {text:'رقم البند غير موجود في الطلب.'}
  const keys:Record<string,string>={السماكة:'thickness',السماكه:'thickness',العرض:'dimensions',المقاس:'dimensions',اللون:'finish',الخامة:'material',الخامه:'material',المادة:'material',الماده:'material',المعيار:'standard'}
  const key=keys[match[1]], value=match[3].trim(), max=key==='thickness'?80:160
  if(!value || value.length>max)return {text:'القيمة طويلة جدًا؛ اختصر المواصفة.'}
  const userId=farqSession.getUser()?.id
  if(!userId || !r.current_version?.id)return {text:'لا يمكن تجهيز التعديل قبل تسجيل الدخول وقراءة نسخة الطلب الحالية.'}
  const next=lines.map((line,i)=>({...line,line_key:String(line.line_key || `${i+1}:${line.farq_spec_id}`),name_ar:String(line.name_ar || line.original_name || ''),uom:String(line.uom || ''),item_note:String(line.item_note || ''),spec_card:i===index?{...(line.spec_card||{}),[key]:value}:line.spec_card || {}}))
  const old=String((lines[index].spec_card as Record<string,unknown> || {})[key] || 'غير مسجل')
  const preview=`البند ${index+1}: ${match[1]} من «${old}» إلى «${value}». لن تتغير الكمية والوحدة أو الماركة. لن يُرسل للموردين.`
  return {text:preview+'\nراجع ثم اضغط تأكيد حفظ التعديل.',action:{kind:'edit',label:'تأكيد حفظ التعديل',rfqId,versionId:r.current_version.id,lines:next,userId,preview}}
}
export async function executeDraftEdit(action:DraftEditAction){
 if(action.userId!==farqSession.getUser()?.id)throw new Error('تغيّر الحساب. جهّز التعديل من جديد.')
 await updateConstructionRfqDraft(action.rfqId,action.versionId,action.lines)
 window.dispatchEvent(new CustomEvent('ahmad-rfq-updated',{detail:{rfqId:action.rfqId}}))
 return 'حُفظ التعديل في مسودة الطلب دون إرسال للموردين. المصدر: تأكيد الحفظ من النظام.'
}
export function documentSummary(d:AhmadDocument){return `${d.summary || 'قراءة المستند'}\n${d.items.map((l,i)=>`${i+1}. ${l.name || 'اسم غير مقروء'} · الكمية: ${l.quantity ?? 'غير معروفة'} ${l.unit || ''} · سعر الوحدة: ${l.unit_price ?? 'غير معروف'} · الإجمالي: ${l.total ?? 'غير معروف'}${l.specification?` · ${l.specification}`:''}${l.uncertain?' (يحتاج تأكيدًا)':''}`).join('\n')}\nالضريبة: ${d.tax || 'غير معروفة'}؛ الشحن: ${d.shipping || 'غير معروف'}؛ الدفع: ${d.payment || 'غير معروف'}؛ التوريد: ${d.delivery || 'غير معروف'}\nنقاط المراجعة: ${d.uncertainties.join('، ') || 'راجع كل قيمة مع أصل المستند.'}\nالمصدر: المرفق الذي اخترته — استخراج آلي أولي، لم تُحفظ الأسعار أو البنود في الطلب.`}

/** Message tabs store an invitation ID, which is distinct from a supplier ID. */
export function requestPageContext(rfq: ConstructionRfq | null, rfqId: string | null, tab: string, inviteId: string | null) {
 const invite=tab==='messages'?rfq?.invitations.find(i=>i.id===inviteId):undefined
 return {view:'rfq-detail',rfqId,tab,supplierId:invite?.supplier?.id || invite?.supplier_id || undefined,threadId:invite?.id}
}
