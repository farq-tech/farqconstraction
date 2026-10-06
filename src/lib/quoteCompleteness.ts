
const text = (v:unknown) => typeof v === "string" && v.trim().length > 0;
const money = (v:unknown) => v !== "" && v != null && Number.isFinite(Number(v)) && Number(v) >= 0;
export function quoteCompleteness(q:Record<string, any>, now = Date.now()) {
  const missing: string[] = [];
  if (typeof q?.prices_include_tax !== "boolean") missing.push("تحديد الضريبة");
  if (!["INCLUDED", "FEE", "PICKUP"].includes(q?.shipping_mode) || !money(q?.delivery)) missing.push("طريقة الشحن وتكلفته");
  if (!money(q?.unloading) || !money(q?.mandatory_fees)) missing.push("رسوم التنزيل والرسوم الإضافية");
  if (!Number.isInteger(q?.lead_time_days) || q.lead_time_days < 1) missing.push("مدة التوريد");
  if (!text(q?.payment_terms) || q.payment_status !== "CONFIRMED") missing.push("شروط الدفع");
  if (!text(q?.valid_until) || !Number.isFinite(Date.parse(q.valid_until)) || Date.parse(q.valid_until) < now) missing.push("صلاحية العرض");
  if (q?.declaration_accepted !== true) missing.push("تأكيد المورد للبيانات");
  const lines = Array.isArray(q?.lines) ? q.lines : [];
  if (!lines.length) missing.push("بنود العرض");
  lines.forEach((l:Record<string, any>, i:number) => {
    const prefix = `البند ${i + 1}: `;
    if (l.available === false) { if (!text(l.notes)) missing.push(prefix + "سبب عدم التوفر"); return; }
    if (l.available !== true || !money(l.unit_price ?? l.sale_unit_price)) missing.push(prefix + "التوفر والسعر");
    if (!Number.isFinite(l.available_quantity) || l.available_quantity <= 0) missing.push(prefix + "الكمية المتاحة");
    if (l.compliance === "ALTERNATIVE") {
      if (!text(l.deviations) || !(text(l.datasheet_file) || text(l.reference_photo_url))) missing.push(prefix + "تفاصيل البديل وصورته أو مواصفاته");
      missing.push(prefix + "مراجعة واعتماد البديل");
    } else if (l.compliance !== "MATCH") missing.push(prefix + "تأكيد المطابقة");
    if (l.product_details_required && (!text(l.offered_description) || !(Number(l.roll_length_m)>0) || !(Number.isInteger(l.rolls_per_carton) && l.rolls_per_carton>0) || !text(l.offered_brand) || !(text(l.datasheet_file) || text(l.reference_photo_url)))) missing.push(prefix + "طول اللفة وعدد اللفات والماركة والصورة أو المواصفات");
  });
  const partial = lines.some((l:Record<string, any>) => l.available === false || (Number.isFinite(l.available_quantity) && l.available_quantity < Number(l.requested_quantity ?? l.quantity)));
  return { status: missing.length ? "NEEDS_COMPLETION" : partial ? "PARTIAL" : "COMPLETE", missing, partial };
}
