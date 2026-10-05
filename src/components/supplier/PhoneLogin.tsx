import { useState } from 'react'
import { supplierPortalClient, SupplierPortalError } from '../../api/supplierPortalClient'
import { Card, PrimaryButton } from './PortalChrome'

/**
 * «دخول المورد» — phone + password (api: POST /supplier/login), for a
 * supplier who joined through «انضم لفرق كمورد». The session is held like a
 * link's session; `onDone` opens the portal on it.
 */
export default function PhoneLogin({ onDone, initialPhone = '' }: { onDone: () => void; initialPhone?: string }) {
  const [phone, setPhone] = useState(initialPhone)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!phone.trim() || !password) return
    setBusy(true)
    setError(null)
    try {
      await supplierPortalClient().loginWithPhone(phone.trim(), password)
      setPassword('')
      onDone()
    } catch (err) {
      setError(err instanceof SupplierPortalError ? err.message : 'تعذّر الدخول — أعد المحاولة.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-base font-black text-[#0D1F1D] mb-3">دخول المورد</h2>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="block text-xs font-bold text-neutral-600 mb-1">رقم الجوال</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="username"
            dir="ltr"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="05xxxxxxxx"
            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-sm text-right"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-bold text-neutral-600 mb-1">كلمة السر</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-sm"
          />
        </label>
        {error ? <p className="text-xs font-semibold text-red-700">{error}</p> : null}
        <PrimaryButton type="submit" disabled={busy || !phone.trim() || !password}>
          {busy ? 'جاري الدخول…' : 'دخول'}
        </PrimaryButton>
      </form>
    </Card>
  )
}
