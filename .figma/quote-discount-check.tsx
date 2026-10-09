// Dev-only visual harness. Does not contact the API or real suppliers.
import React from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import DiscountRequestDialog from '../src/components/DiscountRequestDialog'
import type { QuoteDiscountRequest } from '../src/api/constructionClient'
let jobs: QuoteDiscountRequest[] = []
window.fetch = async (url, options) => {
  if (!String(url).includes('/discount-requests')) throw new Error('المعاينة لا تتصل بخادم حقيقي')
  if (options?.method === 'POST') {
    if (String(url).endsWith('/cancel')) jobs = jobs.map(j => ({ ...j, state: 'CANCELLED' }))
    else {
      const body = JSON.parse(String(options.body))
      jobs.unshift({ id: body.idempotency_key, quote_version_id: body.quote_version_id, text: body.text, send_at: new Date(Date.now() + body.delay_minutes * 60000).toISOString(), state: body.delay_minutes ? 'SCHEDULED' : 'SENT' })
    }
    return new Response(JSON.stringify({ ok: true, data: jobs[0] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify({ ok: true, data: { requests: jobs, can_schedule: true } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
createRoot(document.getElementById('root')!).render(<><div className="p-8">معاينة ببيانات وهمية — لا ترسل للموردين</div><DiscountRequestDialog inviteId="00000000-0000-4000-8000-000000000005" quoteVersionId="00000000-0000-4000-8000-000000000006" supplierName="المورد التجريبي" onClose={() => {}} /></>)
