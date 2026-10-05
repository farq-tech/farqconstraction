import { useEffect, useState } from 'react'
import {
  getPrewarmCapabilities,
  getPrewarmRecipients,
  getPrewarmReview,
  releasePrewarmKnowledge,
  revokePrewarmKnowledge,
  type ConstructionPrewarmReview,
} from '../../api/constructionClient'

export default function PrewarmRelease({ rfqId }: { rfqId: string }) {
  const [allowed, setAllowed] = useState(false)
  const [review, setReview] = useState<ConstructionPrewarmReview | null>(null)
  const [recipients, setRecipients] = useState<
    Array<{ id: string; name: string; reference?: string }>
  >([])
  const [line, setLine] = useState(''),
    [message, setMessage] = useState(''),
    [recipient, setRecipient] = useState('')
  const [quote, setQuote] = useState('')
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('')
  useEffect(() => {
    let alive = true
    setAllowed(false)
    setReview(null)
    setConfirmed(false)
    setNotice('')
    setQuote('')
    setLine('')
    setMessage('')
    setRecipient('')
    setRecipients([])
    getPrewarmCapabilities()
      .then(async (c) => {
        if (!alive || !c.can_release) return
        setAllowed(true)
        const [source, accounts] = await Promise.all([
          getPrewarmReview(rfqId),
          getPrewarmRecipients(),
        ])
        if (alive) {
          setReview(source)
          setRecipients(accounts.recipients)
        }
      })
      .catch(() => {
        if (alive)
          setNotice(
            'تعذر تحميل بيانات اعتماد المشاركة. أعد فتح الطلب للمحاولة.',
          )
      })
    return () => {
      alive = false
    }
  }, [rfqId])
  if (!allowed) return null
  const selected = review?.messages.find((m) => m.id === message)
  return (
    <details className="my-4 border rounded-2xl p-4 bg-white">
      <summary className="font-bold text-[#123F3A] cursor-pointer">
        الاستباق — اعتماد معرفة مورد لحساب عميل
      </summary>
      <p className="text-xs text-neutral-600 my-3">
        صلاحية داخلية فقط. تُشارك الرسالة الأصلية المحددة عن البند دون بيانات
        الطلب أو ملفاته، وتبقى بتاريخها الحقيقي. لا يُرسل شيء للمورد.
      </p>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-xs font-bold">
          حساب العميل
          <select
            value={recipient}
            onChange={(e) => {
              setRecipient(e.target.value)
              setConfirmed(false)
            }}
            className="block w-full mt-1 border rounded-xl p-2"
          >
            <option value="">اختر الحساب</option>
            {recipients.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.reference ? ` · ${r.reference}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold">
          البند
          <select
            value={line}
            onChange={(e) => {
              setLine(e.target.value)
              setConfirmed(false)
              setQuote('')
            }}
            className="block w-full mt-1 border rounded-xl p-2"
          >
            <option value="">اختر البند</option>
            {review?.lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold">
          رسالة المورد
          <select
            value={message}
            onChange={(e) => {
              setMessage(e.target.value)
              setConfirmed(false)
              setQuote('')
            }}
            className="block w-full mt-1 border rounded-xl p-2"
          >
            <option value="">اختر الرسالة</option>
            {review?.messages.map((m) => (
              <option key={m.id} value={m.id} disabled={m.attachment_count > 0}>
                {m.sender} ·{' '}
                {new Date(m.received_at).toLocaleString(
                  'ar-SA-u-ca-gregory-nu-latn',
                )}
                {m.attachment_count ? ' · مرفقات تحتاج مراجعة منفصلة' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      {selected && line && (
        <label className="text-xs font-bold block mt-3">
          عرض سعر مرتبط — اختياري
          <select
            value={quote}
            onChange={(e) => {
              setQuote(e.target.value)
              setConfirmed(false)
            }}
            className="block w-full mt-1 border rounded-xl p-2"
          >
            <option value="">بدون عرض مرتبط</option>
            {review?.quotes
              ?.filter(
                (q) =>
                  q.invite_id === selected.invite_id &&
                  q.lines.some((l) => l.line_id === line),
              )
              .map((q) => (
                <option key={q.id} value={q.id}>
                  عرض المورد ·{' '}
                  {q.lines.find((l) => l.line_id === line)?.unit_price ??
                    'لم يسعّر'}{' '}
                  ر.س
                </option>
              ))}
          </select>
        </label>
      )}
      {selected && (
        <div className="rounded-xl bg-neutral-50 p-3 mt-3 text-sm whitespace-pre-wrap">
          {selected.body_text}
        </div>
      )}
      <label className="flex gap-2 mt-3 text-xs leading-relaxed">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        راجعت النص والمرسل، وهذه الرسالة تخص البند المختار فقط ولا تتضمن اسم
        عميل أو مشروع أو عنوانًا أو بيانات تواصل خاصة أو معلومات سرية. أعتمد
        مشاركتها مع الحساب المحدد.
      </label>
      {notice && (
        <p role="status" className="text-sm mt-3">
          {notice}
        </p>
      )}
      <button
        disabled={
          busy || !confirmed || !line || !message || !recipient || !review
        }
        onClick={async () => {
          if (busy) return
          setBusy(true)
          setNotice('')
          try {
            const released = await releasePrewarmKnowledge({
              source_line_id: line,
              message_id: message,
              recipient_scope_id: recipient,
              review_confirmation: 'SUPPLIER_ONLY_NO_CUSTOMER_CONTEXT',
              ...(quote ? { quote_version_id: quote } : {}),
            })
            setNotice(
              'اعتمدت المشاركة. سيجدها الطلب المطابق في حساب العميل؛ لم تُرسل رسالة للمورد.',
            )
            setConfirmed(false)
            setReview((previous) =>
              previous
                ? {
                    ...previous,
                    releases: [
                      ...(previous.releases || []).filter(
                        (r) => r.id !== released.id,
                      ),
                      {
                        id: released.id,
                        source_line_id: line,
                        message_id: message,
                        recipient_scope_id: recipient,
                      },
                    ],
                  }
                : previous,
            )
          } catch {
            setNotice(
              'لم تعتمد المشاركة. قد يحتوي النص سياقًا خاصًا أو لا يمكن إثبات البند؛ راجع الاختيارات والمحتوى.',
            )
          } finally {
            setBusy(false)
          }
        }}
        className="mt-3 rounded-xl bg-[#123F3A] text-white px-4 py-2 font-bold disabled:opacity-40"
      >
        {busy ? 'جارٍ الاعتماد…' : 'اعتماد المشاركة'}
      </button>
      {!!review?.releases?.length && (
        <div className="border-t pt-3 mt-3">
          <p className="text-xs font-bold">المشاركات المعتمدة لهذا الطلب</p>
          {review.releases.map((release) => (
            <div
              key={release.id}
              className="flex justify-between gap-3 items-center mt-2 text-xs"
            >
              <span>
                {review.lines.find((l) => l.id === release.source_line_id)
                  ?.name || 'بند'}{' '}
                ·{' '}
                {recipients.find((r) => r.id === release.recipient_scope_id)
                  ?.name || 'حساب عميل معتمد'}
              </span>
              <button
                disabled={busy}
                className="underline text-red-700 disabled:opacity-40"
                onClick={async () => {
                  if (busy) return
                  setBusy(true)
                  try {
                    await revokePrewarmKnowledge(release.id)
                    setReview((previous) =>
                      previous
                        ? {
                            ...previous,
                            releases: previous.releases?.filter(
                              (r) => r.id !== release.id,
                            ),
                          }
                        : previous,
                    )
                    setNotice(
                      'سُحبت المشاركة. لن يعرض النظام هذا المرجع في القراءات التالية.',
                    )
                  } catch {
                    setNotice('تعذر سحب المشاركة. أعد المحاولة.')
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                سحب المشاركة
              </button>
            </div>
          ))}
        </div>
      )}
    </details>
  )
}
