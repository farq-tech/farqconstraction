// Local presentation acceptance fixture. No real API, provider, user or supplier.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import PrewarmRelease from '../src/components/procurement/PrewarmRelease'
import PrewarmIntelligence from '../src/components/procurement/PrewarmIntelligence'
import ChatPane from '../src/components/inbox/ChatPane'
const A = '10000000-0000-4000-8000-000000000010',
  B = '10000000-0000-4000-8000-000000000020',
  L = '10000000-0000-4000-8000-000000000012',
  M = '10000000-0000-4000-8000-000000000014',
  I = '10000000-0000-4000-8000-000000000023'
const old = {
  id: M,
  direction: 'INBOUND',
  employee_name: 'sales@supplier.test',
  subject: 'EMT availability',
  body_text: 'EMT Pipe 1 inch available. Unit price SAR 12.',
  created_at: '2026-10-04T17:17:00.000Z',
  channel: 'EMAIL',
  state: 'RECEIVED',
  files: [],
  historical: true,
  origin_label: 'محادثة سابقة عن نفس المادة — ليست ردًا على الطلب الحالي',
}
let released = false,
  live = false,
  account = 'A',
  releasedKind = 'RESPONDED'
window.fetch = async (input, init) => {
  const path = new URL(String(input), 'http://localhost').pathname
  let data: unknown
  if (path.endsWith('/prewarm/capabilities'))
    data = { enabled: true, can_release: account === 'A' }
  else if (path.endsWith('/prewarm/recipients'))
    data = {
      recipients: [
        {
          id: '10000000-0000-4000-8000-000000000002',
          name: 'شركة العميل — حساب اختبار',
        },
      ],
    }
  else if (path.endsWith('/prewarm/review'))
    data = {
      lines: [{ id: L, name: 'ماسورة EMT مقاس 1 بوصة — 500 حبة' }],
      messages: [
        {
          id: M,
          invite_id: 'source-test',
          sender: old.employee_name,
          body_text: old.body_text,
          received_at: old.created_at,
          channel: 'EMAIL',
          attachment_count: 0,
        },
      ],
      quotes: [
        {
          id: '10000000-0000-4000-8000-000000000016',
          invite_id: 'source-test',
          lines: [{ line_id: L, unit_price: 12, available: true }],
        },
      ],
    }
  else if (path.includes('/prewarm/releases/') && path.endsWith('/revoke')) { released=false;data={revoked:true} }
  else if (path.endsWith('/prewarm/releases') && init?.method === 'POST') {
    released = true
    releasedKind = JSON.parse(String(init.body)).quote_version_id
      ? 'PRICED'
      : 'RESPONDED'
    data = { id: 'approved-test-reference' }
  } else if (path.endsWith('/prewarm'))
    data = {
      rfq_id: B,
      lines: [
        {
          line_id: 'target-line',
          line_name: 'EMT Pipe 1" — Qty 500',
          intelligence: released
            ? [
                {
                  evidence_id: 'approved-test-reference',
                  supplier_id: 'supplier-test',
                  supplier_name: 'مورد الكهرباء — اختبار',
                  tier: 'A',
                  kind: releasedKind,
                  message: old,
                },
              ]
            : [],
        },
      ],
      external_sends: 0,
    }
  else if (path.includes('/inbox/threads/'))
    data = {
      invite_id: I,
      supplier_id: 'supplier-test',
      supplier_name_ar: 'مورد الكهرباء — اختبار',
      rfq_id: B,
      channel: 'EMAIL',
      locked: false,
      owner_user_id: null,
      owner_name: null,
      unread_count: 0,
      needs_reply: false,
      reply_channel: 'EMAIL',
      reply_recipient: 'sales@supplier.test',
      requests: [
        { rfq_id: B, invite_id: I, reference: 'RFQ TEST B', locked: false },
      ],
      messages: live
        ? [
            {
              id: 'current-message',
              invite_id: I,
              direction: 'INBOUND',
              employee_name: old.employee_name,
              body_text: 'EMT Pipe 1 inch still available today.',
              created_at: '2026-10-05T17:17:00.000Z',
              channel: 'EMAIL',
              state: 'RECEIVED',
              unread: false,
              files: [],
            },
          ]
        : [],
      historical_messages: released ? [old] : [],
      older_than: null,
      last_message_id: live ? 'current-message' : null,
      send_channels: [],
      send_allowed: false,
    }
  else if (path.includes('/comparison'))
    data = { rfq: { id: B }, lines: [], quotes: [], invites: [] }
  else if (path.endsWith('/rfqs/' + B))
    data = {
      rfq: { id: B, status: 'DRAFT' },
      version: {
        payload: {
          lines: [{ name_en: 'EMT Pipe 1"', quantity: 500, uom: 'EA' }],
        },
      },
      lines: [],
      invites: [],
    }
  else throw new Error('Local acceptance blocks all other network calls')
  return new Response(JSON.stringify({ ok: true, data }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
function Acceptance() {
  const [phase, setPhase] = useState('A'),
    [revision, setRevision] = useState(0)
  return (
    <main className="max-w-5xl mx-auto p-5 text-[#123F3A]">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm mb-4">
        اختبار محلي ببيانات وهمية — جميع اتصالات الموردين محجوبة
      </div>
      <h1 className="font-black text-2xl">فرق · الاستباق</h1>
      <div className="flex gap-3 my-4">
        <button
          className="border rounded-xl p-3"
          onClick={() => {
            account = 'A'
            setPhase('A')
          }}
        >
          Account A — اعتماد المعرفة
        </button>
        <button
          className="border rounded-xl p-3"
          onClick={() => {
            account = 'B'
            setPhase('B')
            setRevision((r) => r + 1)
          }}
        >
          Account B — الطلب الجديد
        </button>
        {phase === 'B' && (
          <button
            className="border rounded-xl p-3"
            onClick={() => {
              live = true
              setRevision((r) => r + 1)
            }}
          >
            إضافة رد مباشر تجريبي
          </button>
        )}
      </div>
      {phase === 'A' ? (
        <PrewarmRelease rfqId={A} />
      ) : (
        <>
          <p>EMT Pipe 1" — Qty 500</p>
          <PrewarmIntelligence key={'knowledge' + revision} rfqId={B} />
          <div className="h-[700px] border rounded-2xl overflow-hidden">
            <ChatPane
              key={revision}
              inviteId={I}
              requestScoped
              onBack={() => {}}
              onOpenRfq={() => {}}
            />
          </div>
        </>
      )}
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<Acceptance />)
