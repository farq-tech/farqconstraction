import { useCallback, useEffect, useState } from 'react'
import {
  decideConstructionInboxAiDraft,
  fetchConstructionInboxAi,
  type ConstructionAiAnalysis,
  type ConstructionAiDraft,
} from '../../api/constructionClient'
import {
  aiErrorAr,
  confidenceAr,
  declineScopeAr,
  deliveryAr,
  humanReasonAr,
  leadTimeAr,
  panelDrafts,
  priceLineAr,
  profileChoicesReady,
  profileUpdateAr,
  REPLY_KIND_AR,
  vatAr,
} from '../../lib/inboxAi'

type Props = {
  inviteId: string
  /** Changes when a new message arrives, so the reading is fetched again. */
  refreshKey: string | null | undefined
  /** A write-disabled build or a member without write access. */
  readOnly?: boolean
}

type Decide = (draft: ConstructionAiDraft, body: { action: 'APPROVE' | 'EDIT' | 'REJECT'; edit?: Record<string, unknown>; choices?: string[] }) => Promise<void>

/**
 * «فهم الرسالة» above the composer: what the supplier's latest message means
 * and what the system proposes — nothing happens until «اعتماد». Shown only
 * when the server has drafts turned on (CONSTRUCTION_INBOX_AI_DRAFTS_ENABLED).
 */
export default function InboxAiPanel({ inviteId, refreshKey, readOnly = false }: Props) {
  const [data, setData] = useState<ConstructionAiAnalysis | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await fetchConstructionInboxAi(inviteId))
    } catch {
      setData(null) // the normal inbox continues without it
    }
  }, [inviteId])

  useEffect(() => { void load() }, [load, refreshKey])

  const decide: Decide = async (draft, body) => {
    setBusy(draft.id)
    setError(null)
    try {
      await decideConstructionInboxAiDraft(inviteId, draft.id, body)
      await load()
    } catch (e) {
      const err = e as { code?: string; message?: string }
      setError(aiErrorAr(err.code && err.code !== 'UNKNOWN' ? err.code : err.message))
    } finally {
      setBusy(null)
    }
  }

  if (!data || !data.drafts_enabled || !data.analysis) return null
  const a = data.analysis
  const drafts = panelDrafts(data.drafts)
  const quote = drafts.find((d) => d.type === 'QUOTE_DRAFT')
  const lines = quote?.payload.lines || a.quote?.items || []
  const actionsOff = !data.actions_enabled || readOnly

  return (
    <div className="rounded-2xl border border-[#123F3A]/15 bg-[#F7FAF9] px-3.5 py-2.5 mb-2 text-[12px]" dir="rtl">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-bold rounded-full bg-[#123F3A]/10 text-[#123F3A] px-2 py-0.5">فهم الرسالة</span>
        <span className="text-[10px] text-neutral-500">ما يتنفذ شيء إلا إذا ضغطت «اعتماد»</span>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1">
        <Fact label="نوع الرد" value={REPLY_KIND_AR[a.reply_kind] || a.reply_kind} />
        <Fact label="الثقة" value={confidenceAr(a.confidence)} />
        {lines.length > 0 && <Fact label="الضريبة" value={vatAr(lines[0].includes_vat, lines[0].vat_inferred)} />}
        {(quote || a.terms?.delivery_included != null) && <Fact label="التوصيل" value={deliveryAr(quote?.payload.delivery_included ?? a.terms?.delivery_included)} />}
        {(quote || a.terms?.lead_time_days) && <Fact label="المدة" value={leadTimeAr(quote?.payload.lead_time_days ?? a.terms?.lead_time_days)} />}
      </dl>
      {a.human_required && a.human_reasons.length > 0 && (
        <p className="mt-1.5 text-[11px] font-bold text-amber-900">
          يحتاج مراجعتك: {[...new Set(a.human_reasons.map(humanReasonAr))].join('، ')}
        </p>
      )}
      {drafts.map((draft) =>
        draft.type === 'QUOTE_DRAFT' ? (
          <QuoteDraft key={draft.id} draft={draft} busy={busy === draft.id} disabled={actionsOff} onDecide={decide} />
        ) : draft.type === 'DECLINE_DRAFT' ? (
          <DeclineDraft key={draft.id} draft={draft} busy={busy === draft.id} disabled={actionsOff} onDecide={decide} />
        ) : (
          <ProfileDraft key={draft.id} draft={draft} busy={busy === draft.id} disabled={actionsOff} onDecide={decide} />
        ),
      )}
      {actionsOff && drafts.length > 0 && !readOnly && (
        <p className="mt-1 text-[10px] text-neutral-500">التنفيذ موقوف حالياً — تقدر ترفض، والاعتماد يرجع بعد تفعيله.</p>
      )}
      {error && <p className="mt-1 text-[11px] font-bold text-red-700">{error}</p>}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] text-neutral-500">{label}</dt>
      <dd className="font-bold text-[#0D1F1D] truncate">{value}</dd>
    </div>
  )
}

function Buttons({ busy, disabled, onApprove, onEdit, onReject, approveLabel = 'اعتماد', editLabel = 'تعديل', rejectLabel = 'رفض' }: {
  busy: boolean; disabled: boolean; onApprove: () => void; onEdit?: () => void; onReject: () => void; approveLabel?: string; editLabel?: string; rejectLabel?: string
}) {
  return (
    <div className="flex items-center gap-2 mt-2">
      <button type="button" disabled={busy || disabled} onClick={onApprove} className="rounded-full bg-[#123F3A] text-white text-[11px] font-bold px-4 py-1.5 disabled:opacity-40">
        {busy ? '…' : approveLabel}
      </button>
      {onEdit && (
        <button type="button" disabled={busy || disabled} onClick={onEdit} className="rounded-full border border-[#123F3A] text-[#123F3A] text-[11px] font-bold px-4 py-1.5 disabled:opacity-40">
          {editLabel}
        </button>
      )}
      <button type="button" disabled={busy} onClick={onReject} className="text-[11px] font-bold text-neutral-500 hover:underline disabled:opacity-40">
        {rejectLabel}
      </button>
    </div>
  )
}

function QuoteDraft({ draft, busy, disabled, onDecide }: { draft: ConstructionAiDraft; busy: boolean; disabled: boolean; onDecide: Decide }) {
  const lines = draft.payload.lines || []
  const [editing, setEditing] = useState(false)
  const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.line_key, String(l.unit_price)])))
  const [vat, setVat] = useState<string>(draft.payload.prices_include_tax === true ? 'yes' : draft.payload.prices_include_tax === false ? 'no' : 'unknown')
  const save = () => onDecide(draft, {
    action: 'EDIT',
    edit: {
      lines: lines.map((l) => ({ line_key: l.line_key, unit_price: Number(prices[l.line_key]), includes_vat: vat === 'yes' ? true : vat === 'no' ? false : null })),
    },
  })
  return (
    <div className="mt-2 rounded-xl bg-white border border-neutral-200 px-3 py-2">
      <p className="text-[11px] font-bold text-[#123F3A] mb-1">عرض سعر مقترح — يُسجَّل بعد اعتمادك</p>
      <ul className="space-y-1">
        {lines.map((l) => (
          <li key={l.line_key} className="flex items-center justify-between gap-2">
            <span className="text-neutral-700 truncate">البند: {l.name || l.line_key}</span>
            {editing ? (
              <input
                inputMode="decimal"
                value={prices[l.line_key] ?? ''}
                onChange={(e) => setPrices({ ...prices, [l.line_key]: e.target.value })}
                aria-label={`سعر ${l.name || l.line_key}`}
                className="w-24 rounded-lg border border-neutral-300 px-2 py-0.5 text-[12px] text-start"
              />
            ) : (
              <span className="font-bold text-[#0D1F1D] whitespace-nowrap">السعر: {priceLineAr(l)}</span>
            )}
          </li>
        ))}
      </ul>
      {editing && (
        <label className="mt-1.5 flex items-center gap-2 text-[11px]">
          الضريبة:
          <select value={vat} onChange={(e) => setVat(e.target.value)} className="rounded-lg border border-neutral-300 px-1.5 py-0.5">
            <option value="yes">شامل</option>
            <option value="no">غير شامل</option>
            <option value="unknown">غير مذكورة</option>
          </select>
        </label>
      )}
      {(draft.payload.sanity || []).map((f) => (
        <p key={`${f.line_key}-${f.code}`} className="mt-1 text-[11px] text-amber-900">{f.reason_ar}{f.suggestion_ar ? ` — ${f.suggestion_ar}` : ''}</p>
      ))}
      {editing ? (
        <Buttons busy={busy} disabled={disabled} approveLabel="اعتماد بعد التعديل" onApprove={() => void save()} onReject={() => setEditing(false)} rejectLabel="إلغاء" />
      ) : (
        <Buttons busy={busy} disabled={disabled} onApprove={() => void onDecide(draft, { action: 'APPROVE' })} onEdit={() => setEditing(true)} onReject={() => void onDecide(draft, { action: 'REJECT' })} />
      )}
    </div>
  )
}

function DeclineDraft({ draft, busy, disabled, onDecide }: { draft: ConstructionAiDraft; busy: boolean; disabled: boolean; onDecide: Decide }) {
  const actions = draft.payload.actions || { status: true, hide: true, suppress: false, activity: false }
  const [hide, setHide] = useState(actions.hide)
  return (
    <div className="mt-2 rounded-xl bg-white border border-neutral-200 px-3 py-2">
      <p className="text-[11px] font-bold text-[#123F3A]">اعتذار المورد: {declineScopeAr(draft.payload.scope)}</p>
      <p className="text-[11px] text-neutral-600 mt-0.5">
        عند الاعتماد: نسجّل اعتذاره عن هذا الطلب{actions.suppress ? '، وما نقترحه لنفس المواد مرة ثانية' : ''}{actions.activity ? '، ونضيف نشاطه لملفه' : ''}.
      </p>
      <label className="mt-1 flex items-center gap-1.5 text-[11px]">
        <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
        أخفِ المحادثة من القائمة
      </label>
      <Buttons
        busy={busy}
        disabled={disabled}
        onApprove={() => void onDecide(draft, hide === actions.hide ? { action: 'APPROVE' } : { action: 'EDIT', edit: { actions: { hide } } })}
        onReject={() => void onDecide(draft, { action: 'REJECT' })}
      />
    </div>
  )
}

function ProfileDraft({ draft, busy, disabled, onDecide }: { draft: ConstructionAiDraft; busy: boolean; disabled: boolean; onDecide: Decide }) {
  const updates = draft.payload.updates || []
  const [choices, setChoices] = useState<Record<number, string>>({})
  const ready = profileChoicesReady(updates, choices)
  return (
    <div className="mt-2 rounded-xl bg-white border border-neutral-200 px-3 py-2">
      <p className="text-[11px] font-bold text-[#123F3A] mb-1">معلومة جديدة عن المورد</p>
      <ul className="space-y-1">
        {updates.map((u, i) => (
          <li key={`${u.type}-${u.normalized_value}`} className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-[#0D1F1D]">{profileUpdateAr(u)}</span>
            {u.raw_evidence && <span className="text-[10px] text-neutral-500 truncate max-w-[16rem]">«{u.raw_evidence}»</span>}
            {u.merge === 'CONFLICT' && (
              <span className="inline-flex items-center gap-1">
                <span className="text-[10px] font-bold text-amber-900">يتعارض مع ملفه:</span>
                {([['ADD', 'إضافة'], ['REPLACE', 'استبدال'], ['IGNORE', 'تجاهل']] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setChoices({ ...choices, [i]: value })}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${choices[i] === value ? 'bg-[#123F3A] text-white border-[#123F3A]' : 'border-neutral-300 text-neutral-700'}`}
                  >
                    {label}
                  </button>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>
      <Buttons
        busy={busy}
        disabled={disabled || !ready}
        onApprove={() => void onDecide(draft, { action: 'APPROVE', choices: updates.map((u, i) => choices[i] || (u.merge === 'CONFLICT' ? '' : 'ADD')) })}
        onReject={() => void onDecide(draft, { action: 'REJECT' })}
        rejectLabel="تجاهل"
      />
    </div>
  )
}
