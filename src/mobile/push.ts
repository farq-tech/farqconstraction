/**
 * iPhone notifications for the buyer app.
 *
 * After sign-in the app asks once for permission, registers with Apple and
 * hands the device token to the API (POST /api/construction/devices). The
 * server then pushes «رد جديد» / «عرض سعر جديد» to this phone. Tapping one
 * opens the conversation or the request. Sign-out stops the device first,
 * while the session can still prove who is asking.
 */
import { apiBase } from '../api/apiBase'
import { constructionHeaders } from '../api/constructionAuth'

type Listener = { remove: () => Promise<void> }
type PushPlugin = {
  checkPermissions: () => Promise<{ receive: string }>
  requestPermissions: () => Promise<{ receive: string }>
  register: () => Promise<void>
  addListener: (event: string, cb: (payload: never) => void) => Promise<Listener>
}
export type PushTarget = { kind?: string; rfq_id?: string | null; invite_id?: string | null }

const TOKEN_KEY = 'farq_mobile_push_token'
let wired = false

function plugin(): PushPlugin | null {
  const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor
  return (cap?.Plugins?.PushNotifications as PushPlugin | undefined) ?? null
}

async function post(path: string, body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase()}/api/construction/${path}`, {
      method: 'POST',
      headers: constructionHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function enablePush(onOpen: (target: PushTarget) => void): Promise<void> {
  const push = plugin()
  if (!push) return
  try {
    let perm = await push.checkPermissions()
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await push.requestPermissions()
    if (perm.receive !== 'granted') return
    if (!wired) {
      wired = true
      await push.addListener('registration', ((t: { value: string }) => {
        try { localStorage.setItem(TOKEN_KEY, t.value) } catch { /* private mode */ }
        void post('devices', { token: t.value, platform: 'ios', app_version: '1.1' })
      }) as (p: never) => void)
      await push.addListener('pushNotificationActionPerformed', ((a: { notification?: { data?: PushTarget } }) => {
        const data = a.notification?.data
        if (data) onOpen(data)
      }) as (p: never) => void)
    }
    await push.register()
  } catch {
    /* notifications are a convenience; the app works without them */
  }
}

export async function disablePush(): Promise<void> {
  let token: string | null = null
  try { token = localStorage.getItem(TOKEN_KEY) } catch { /* ignore */ }
  if (!token) return
  await post('devices/unregister', { token })
  try { localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
}
