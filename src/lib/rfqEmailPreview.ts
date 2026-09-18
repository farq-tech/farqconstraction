/**
 * Client-side preview of Farq construction RFQ invite email.
 * Mirrors api/lib/construction/rfq-dispatch.js → rfqEmail() (layout + wording).
 */

export type RfqEmailPreviewInput = {
  rfqId: string
  supplierName?: string
  recipientEmail?: string | null
  engineeringDepartment?: string | { key?: string; code?: string; label_ar?: string } | null
  buyerCompany?: string | null
  deliverySite?: string | null
  requiredDate?: string | null
  lines: Array<{
    /**
     * The BOQ line's own text. PREFERRED over `name_ar` for display: a catalog
     * name is only a label for a matched spec, and on ELE-RFQ-51D17AF6 ten
     * unrelated PPE lines were all rendered «ألواح أو إس بي» because the catalog
     * name won. The supplier must see what the booklet actually says.
     */
    original_name?: string
    original_description?: string
    /** Catalog name. Fallback only, and only when the line has no own text. */
    name_ar?: string
    name_en?: string
    farq_spec_id?: string
    line_key?: string
    quantity?: number | string
    uom?: string
  }>
  /** Optional portal token; preview uses a placeholder when missing. */
  portalToken?: string | null
}

const DEPT: Record<string, { code: string; label_ar: string }> = {
  CIVIL: { code: 'CIV', label_ar: 'القسم المدني والإنشائي' },
  ARCHITECTURAL: { code: 'ARC', label_ar: 'القسم المعماري' },
  ELECTRICAL: { code: 'ELE', label_ar: 'القسم الكهربائي' },
  MECHANICAL: { code: 'MEC', label_ar: 'القسم الميكانيكي' },
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeDepartment(
  value: RfqEmailPreviewInput['engineeringDepartment'],
): { code: string; label_ar: string } | null {
  if (!value) return null
  if (typeof value === 'object') {
    const key = String(value.key || value.code || '').toUpperCase()
    return DEPT[key] || (value.label_ar ? { code: key.slice(0, 3) || 'RFQ', label_ar: value.label_ar } : null)
  }
  const key = String(value).trim().toUpperCase()
  return DEPT[key] || null
}

function departmentReference(rfqId: string, department: { code: string } | null): string {
  const short = String(rfqId || '').replace(/-/g, '').slice(0, 8).toUpperCase()
  return department ? `${department.code}-${short}` : `RFQ-${short}`
}

function arabicDeliveryDate(value?: string | null): string {
  const raw = String(value || '').trim()
  if (!raw) return 'غير محدد'
  const parsed = new Date(`${raw}T12:00:00+03:00`)
  if (Number.isNaN(parsed.getTime())) return raw
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Riyadh',
  }).format(parsed)
}

/**
 * What the supplier reads for one line. The line's own description wins; the
 * catalog name is a fallback for lines that carry no text of their own.
 */
export function rfqLineLabel(line: RfqEmailPreviewInput['lines'][number]): string {
  return (
    String(line.original_name || '').trim() ||
    String(line.name_ar || '').trim() ||
    String(line.name_en || '').trim() ||
    String(line.farq_spec_id || '').trim() ||
    '—'
  )
}

function inviteBodyAr(lines: RfqEmailPreviewInput['lines'], portalUrl: string): string {
  const seen = new Set<string>()
  const names: string[] = []
  for (const line of lines) {
    // Dedupe on the REAL item text. Deduping on the catalog name collapsed ten
    // distinct PPE rows into a single «ألواح أو إس بي» entry.
    const name = rfqLineLabel(line)
    if (name === '—' || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return [
    'السلام عليكم عزيزي البائع',
    'لدينا مشتري يطلب توفير:',
    ...names,
    'في حال توفرها الرجاء الضغط على الرابط التالي لتقديم عرضك',
    portalUrl,
  ].join('\n')
}

export type RfqEmailPreview = {
  subject: string
  from: string
  to: string
  html: string
  text: string
}

/** Build the same invite email shape Farq sends via Resend. */
export function buildRfqEmailPreview(input: RfqEmailPreviewInput): RfqEmailPreview {
  const department = normalizeDepartment(input.engineeringDepartment)
  const reference = departmentReference(input.rfqId, department)
  const company = String(input.buyerCompany || 'فرق للبناء').trim() || 'فرق للبناء'
  const token = String(input.portalToken || 'PREVIEW-TOKEN').trim()
  const replyUrl = `https://www.farq.sa/Construction?supplier_token=${encodeURIComponent(token)}`
  const lines = input.lines.length
    ? input.lines
    : [{ original_name: '—', quantity: '—', uom: '' }]
  const bodyAr = inviteBodyAr(lines, replyUrl)
  const site = String(input.deliverySite || 'غير محدد')
  const when = arabicDeliveryDate(input.requiredDate)

  const rows = lines
    .map((line, index) => {
      const name = escapeHtml(rfqLineLabel(line))
      const en = line.name_en
        ? `<div dir="ltr" style="margin-top:2px;color:#69807a;font-size:13px;text-align:right">${escapeHtml(line.name_en)}</div>`
        : ''
      return `
    <tr>
      <td style="padding:${index ? '18px 0 0' : '0'};text-align:right">
        <div style="font-size:20px;line-height:1.5;font-weight:800;color:#103f38">${name}</div>
        ${en}
        <div style="margin-top:8px;color:#365f57;font-size:16px;line-height:1.6">الكمية: ${escapeHtml(line.quantity ?? '—')} ${escapeHtml(line.uom || '')}</div>
      </td>
    </tr>`
    })
    .join('')

  const subject = `طلب عرض سعر ${reference}${department ? ` — ${department.label_ar}` : ''} — ${company}`
  const from = `${company} — عبر فرق للبناء <info@farq.sa>`
  const to = String(input.recipientEmail || input.supplierName || 'supplier@example.com')

  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="margin:0;background:#f3f5f3;color:#163f39;font-family:Tahoma,Arial,sans-serif">
        <div style="box-sizing:border-box;max-width:600px;margin:0 auto;background:#fff;border-radius:22px;padding:38px 40px 32px;text-align:right">
          <div style="font-size:38px;line-height:1.25;font-weight:900;color:#0b4038">فرق للبناء</div>
          <div style="margin-top:8px;color:#748a85;font-size:16px">شركة فرق للتكنولوجيا</div>

          <h1 style="margin:34px 0 26px;font-size:38px;line-height:1.35;color:#113e37">طلب عرض سعر</h1>
          <div style="font-size:19px;line-height:1.9;color:#3f615b">
            <span style="white-space:pre-line">${escapeHtml(bodyAr)}</span>
          </div>

          <div style="margin-top:26px;border-radius:18px;background:#eff8f4;padding:24px 28px">
            <div style="color:#6b817c;font-size:15px">المواد المطلوبة</div>
            <table role="presentation" style="width:100%;border-collapse:collapse"><tbody>${rows}</tbody></table>
            <div style="margin-top:18px;color:#496b64;font-size:15px;line-height:1.8">موقع التوريد: ${escapeHtml(site)}</div>
            <div style="color:#496b64;font-size:15px;line-height:1.8">موعد التوريد: ${escapeHtml(when)}</div>
            <div style="margin-top:10px;color:#6b817c;font-size:14px;line-height:1.7">رقم الطلب<br><span dir="ltr">${escapeHtml(reference)}</span></div>
          </div>

          <a href="${replyUrl}" style="box-sizing:border-box;display:block;width:100%;margin-top:24px;border-radius:12px;background:#9ce8c6;color:#0b4038;text-align:center;text-decoration:none;padding:17px 20px;font-size:19px;font-weight:800">عرض الطلب وتقديم السعر</a>
          <div style="margin-top:14px;text-align:center;color:#5d7771;font-size:16px;line-height:1.8">ارفع عرضك أو أدخل الأسعار دون تسجيل حساب.</div>
          <div style="margin-top:14px;text-align:center;color:#8a9b97;font-size:13px">هذا طلب عرض سعر وليس أمر شراء</div>
        </div>
      </body></html>`

  return {
    subject,
    from,
    to,
    html,
    text: `طلب عرض سعر ${reference}\nالقسم: ${department?.label_ar || 'غير محدد'}\nالشركة: ${company}\nالموقع: ${site}\nالبنود: ${lines.length}\n${replyUrl}`,
  }
}
