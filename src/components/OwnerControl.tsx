import { useEffect, useState } from 'react'
import {
  listCompanyMembers,
  transferBookletOwner,
  transferRfqOwner,
  type ConstructionCompanyMembers,
  type ConstructionOwner,
} from '../api/constructionClient'
import {
  canTransferOwnership,
  currentOwnerId,
  displayName,
  ownerLabel,
  roleLabel,
  transferSuccessMessage,
  type OwnerSubject,
} from '../lib/requestOwner'

type Props = {
  subject: OwnerSubject
  id: string
  owner?: ConstructionOwner | null
  assignedUserId?: string | null
  /** Re-read the page's data after a transfer. */
  onTransferred?: () => void | Promise<void>
}

/**
 * «المسؤول: …» on a request or booklet header, and for an ADMIN a «نقل الملكية»
 * button that moves it to another colleague.
 */
export function OwnerControl({ subject, id, owner, assignedUserId, onTransferred }: Props) {
  const [members, setMembers] = useState<ConstructionCompanyMembers | null>(null)
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // Silent on failure: an older API or a non-admin simply gets no control.
    listCompanyMembers()
      .then((result) => {
        if (!cancelled) setMembers(result)
      })
      .catch(() => {
        if (!cancelled) setMembers(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const currentId = currentOwnerId(owner, assignedUserId)
  const label = ownerLabel(owner, assignedUserId, members?.members)
  const canTransfer = canTransferOwnership(members)

  const close = () => {
    if (saving) return
    setOpen(false)
    setPicked(null)
    setError(null)
  }

  const confirm = async () => {
    if (!picked) return
    const target = members?.members.find((m) => m.user_id === picked)
    setSaving(true)
    setError(null)
    try {
      const result =
        subject === 'booklet' ? await transferBookletOwner(id, picked) : await transferRfqOwner(id, picked)
      setNotice(transferSuccessMessage(subject, displayName(target) || 'غير محدد', result))
      setOpen(false)
      setPicked(null)
      try {
        await onTransferred?.()
      } catch {
        setNotice((n) => `${n || ''} — تعذّر تحديث الصفحة، حدّثها يدويًا.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر نقل الملكية')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <span className="flex items-center gap-2">
        <span>
          المسؤول:{' '}
          <span dir="ltr" className="font-semibold text-[#0D1F1D]">
            {label}
          </span>
        </span>
        {canTransfer && (
          <button
            type="button"
            onClick={() => {
              setNotice(null)
              setOpen(true)
            }}
            className="px-2.5 py-1 border border-neutral-200 text-[#123F3A] font-bold rounded-lg text-xs hover:bg-neutral-50"
          >
            نقل الملكية
          </button>
        )}
      </span>
      {notice && (
        <span className="w-full text-xs font-semibold text-[#1a7a45] bg-[#f0faf7] rounded-lg px-3 py-1.5">{notice}</span>
      )}

      {open && members && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />
          <div className="relative w-full sm:max-w-md max-h-[92vh] bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-100">
              <div className="text-lg font-black text-[#0D1F1D]">نقل الملكية</div>
              <div className="text-xs text-neutral-500 mt-1">
                {subject === 'booklet'
                  ? 'تنتقل الكراسة وكل دفعاتها إلى الزميل الذي تختاره.'
                  : 'ينتقل الطلب إلى الزميل الذي تختاره؛ وإن كان دفعة من كراسة تنتقل الكراسة كاملة.'}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-neutral-50">
              {members.members.length === 0 && (
                <div className="px-5 py-6 text-sm text-neutral-500 text-center">لا يوجد زملاء في الشركة.</div>
              )}
              {members.members.map((m) => {
                const isCurrent = m.user_id === currentId
                return (
                  <label
                    key={m.user_id}
                    className={`flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-neutral-50 ${picked === m.user_id ? 'bg-[#f0faf7]' : ''}`}
                  >
                    <input
                      type="radio"
                      name="owner-transfer"
                      checked={picked === m.user_id}
                      onChange={() => setPicked(m.user_id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div dir="ltr" className="text-sm font-semibold text-[#0D1F1D] truncate text-right">
                        {displayName(m) || 'غير محدد'}
                      </div>
                      <div className="text-xs text-neutral-500">{roleLabel(m.role)}</div>
                    </div>
                    {isCurrent && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#CFF5DC] text-[#1a7a45]">
                        المسؤول الحالي
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
            {error && <div className="mx-5 mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
            <div className="px-5 py-4 flex gap-2 justify-end">
              <button
                type="button"
                onClick={close}
                disabled={saving}
                className="px-4 py-2 border border-neutral-200 text-neutral-600 font-semibold rounded-xl text-sm disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={saving || !picked || picked === currentId}
                className="px-4 py-2 bg-[#123F3A] text-white font-bold rounded-xl text-sm disabled:opacity-50"
              >
                {saving ? 'جارٍ النقل…' : 'تأكيد النقل'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default OwnerControl
