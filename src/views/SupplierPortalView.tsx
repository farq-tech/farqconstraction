/**
 * THE SUPPLIER PORTAL (Figma «Supplier / المورد (Prototype)», frames 0–4 + F).
 *
 * The supplier arrives with the invitation link (lib/supplierLink lifts the
 * token out of the address bar). The link is traded for a 12-hour session
 * (api/supplierPortalClient); with a session the supplier gets:
 *   • a first-open banner «جهّزنا لك حساباً…» with «ليس حسابي»;
 *   • «طلباتك» across companies, each with a deadline countdown;
 *   • inside a request: العرض (the quote form) / المحادثة / حالة العرض;
 *   • «حسابي» with an optional password (email code, then password).
 *
 * When the session routes are not on the API yet, the portal runs exactly as
 * before on the token routes: the quote form and a status path that only says
 * what the token route knows.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { NavProps } from '../types'
import {
  ConstructionApiError,
  getPublicSupplierInvite,
  type PublicSupplierInvite,
} from '../api/constructionClient'
import {
  supplierPortalClient,
  type SupplierAccount,
  type SupplierRequest,
  type SupplierSession,
} from '../api/supplierPortalClient'
import { captureSupplierLink } from '../lib/supplierLink'
import { legacyDeadline, requestFromLegacyInvite, shortCompany, type LineRef } from '../lib/supplierPortal'
import {
  BottomSheet,
  Card,
  LockIcon,
  PortalHeader,
  PrimaryButton,
  RequestTabs,
  SecondaryButton,
  type RequestTab,
} from '../components/supplier/PortalChrome'
import { AccountIcon } from '../icons'
import { QuoteForm } from '../components/supplier/QuoteForm'
import { StatusPanel } from '../components/supplier/StatusPanel'
import { RequestsList } from '../components/supplier/RequestsList'
import { SupplierChat } from '../components/supplier/SupplierChat'
import { AccountView } from '../components/supplier/AccountView'

type Phase = 'no-token' | 'loading' | 'expired' | 'error' | 'ready'
type Screen = 'list' | 'request' | 'account'

/** Lets the header and the composer sit clear of the notch and the home bar. */
function useCoverViewport() {
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]')
    if (!meta) return
    const before = meta.getAttribute('content') || ''
    if (!before.includes('viewport-fit')) meta.setAttribute('content', `${before}, viewport-fit=cover`)
    return () => meta.setAttribute('content', before)
  }, [])
}

/** The part of the screen the keyboard leaves free (iOS does not shrink 100dvh for it). */
function useVisualViewport(active: boolean): { height: number; top: number } | null {
  const [box, setBox] = useState<{ height: number; top: number } | null>(null)
  useEffect(() => {
    if (!active) return
    const vv = window.visualViewport
    const update = () => setBox({ height: vv ? vv.height : window.innerHeight, top: vv ? vv.offsetTop : 0 })
    update()
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [active])
  return active ? box : null
}

function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

function inviteErrorIsExpired(err: unknown): boolean {
  return err instanceof ConstructionApiError && (err.status === 404 || err.status === 410)
}

export function SupplierPortalView(_props: NavProps) {
  useCoverViewport()
  const link = useMemo(() => captureSupplierLink(), [])
  const token = link?.token || ''
  const client = useMemo(() => supplierPortalClient(), [])
  const now = useNow()

  const [phase, setPhase] = useState<Phase>(token ? 'loading' : 'no-token')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mode, setMode] = useState<'session' | 'legacy'>('legacy')
  const [session, setSession] = useState<SupplierSession | null>(null)
  const [account, setAccount] = useState<SupplierAccount | null>(null)
  const [invite, setInvite] = useState<PublicSupplierInvite | null>(null)
  const [requests, setRequests] = useState<SupplierRequest[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [screen, setScreen] = useState<Screen>('request')
  const [tab, setTab] = useState<RequestTab>('quote')
  const [lineRef, setLineRef] = useState<LineRef | null>(null)
  const [declineOpen, setDeclineOpen] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [declineError, setDeclineError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setPhase('loading')
    setLoadError(null)
    const [opened, portal] = await Promise.allSettled([client.openSession(token), getPublicSupplierInvite(token)])
    const legacyInvite = portal.status === 'fulfilled' ? portal.value : null
    setInvite(legacyInvite)

    if (opened.status === 'fulfilled' && opened.value.mode === 'expired') {
      setPhase('expired')
      return
    }
    if (opened.status === 'fulfilled' && opened.value.mode === 'session') {
      const held = opened.value.session
      setSession(held)
      setAccount(held.account)
      setMode('session')
      let list: SupplierRequest[] = []
      try {
        list = await client.listRequests()
      } catch {
        list = legacyInvite ? [requestFromLegacyInvite(legacyInvite)] : []
      }
      if (legacyInvite && !list.some((r) => r.invite_id === legacyInvite.invite_id)) {
        list = [requestFromLegacyInvite(legacyInvite), ...list]
      }
      setRequests(list)
      const first = legacyInvite?.invite_id || list[0]?.invite_id || null
      setSelectedId(first)
      setScreen(first ? 'request' : 'list')
      setTab(legacyInvite ? 'quote' : 'status')
      if (link?.intent === 'decline' && held.account.status !== 'DECLINED') setDeclineOpen(true)
      setPhase('ready')
      return
    }

    // The token routes, as the portal has always worked.
    setMode('legacy')
    if (!legacyInvite) {
      if (portal.status === 'rejected' && inviteErrorIsExpired(portal.reason)) {
        setPhase('expired')
        return
      }
      const reason = portal.status === 'rejected' ? portal.reason : null
      setLoadError(reason instanceof Error ? reason.message : 'تعذّر فتح الدعوة.')
      setPhase('error')
      return
    }
    setRequests([requestFromLegacyInvite(legacyInvite)])
    setSelectedId(legacyInvite.invite_id)
    setScreen('request')
    setTab('quote')
    setPhase('ready')
  }, [client, token, link])

  useEffect(() => {
    void load()
  }, [load])

  const selected = requests.find((r) => r.invite_id === selectedId) || null
  const declined = account?.status === 'DECLINED'
  const chatEnabled = mode === 'session' && !declined
  const supplierName =
    session?.supplier.name_ar || invite?.supplier.name_ar || invite?.supplier.name_en || 'المورد'
  const selectedIsLinked = Boolean(invite && selected && invite.invite_id === selected.invite_id)
  const multi = requests.length > 1

  const openRequest = (id: string) => {
    setSelectedId(id)
    setScreen('request')
    setLineRef(null)
    setTab(invite?.invite_id === id ? 'quote' : 'status')
  }

  const markRead = useCallback(() => {
    setRequests((prev) =>
      prev.map((r) => (r.invite_id === selectedId && r.unread_count ? { ...r, unread_count: 0 } : r)),
    )
  }, [selectedId])

  const refreshRequests = useCallback(async () => {
    if (mode !== 'session') return
    try {
      const list = await client.listRequests()
      setRequests((prev) => {
        const linked = prev.find((r) => r.invite_id === invite?.invite_id)
        return linked && !list.some((r) => r.invite_id === linked.invite_id) ? [linked, ...list] : list
      })
    } catch {
      /* the list on screen stays */
    }
  }, [client, mode, invite])

  const decline = async () => {
    setDeclining(true)
    setDeclineError(null)
    try {
      const next = await client.declineAccount()
      setAccount((prev) => next || (prev ? { ...prev, status: 'DECLINED' } : prev))
      setDeclineOpen(false)
      setSelectedId(invite?.invite_id || selectedId)
      setScreen('request')
      setTab('quote')
    } catch (err) {
      setDeclineError(err instanceof Error ? err.message : 'تعذّر إلغاء الحساب — أعد المحاولة.')
    } finally {
      setDeclining(false)
    }
  }

  const chatActive = phase === 'ready' && screen === 'request' && tab === 'chat' && chatEnabled && Boolean(selected)
  const viewport = useVisualViewport(chatActive)

  // ─── Screens that are not a request ────────────────────────────────────

  if (phase === 'no-token') {
    return (
      <Frame>
        <PortalHeader kind="home" title="بوابة المورد" subtitle="فرق للبناء" />
        <Centered>
          <Card className="text-center p-6">
            <h1 className="text-xl font-black text-[#0D1F1D] mb-2">افتح رابط الدعوة</h1>
            <p className="text-sm text-neutral-500 leading-relaxed">
              تدخل البوابة من الرابط اللي وصلك من الشركة بالإيميل أو الواتساب.
            </p>
          </Card>
        </Centered>
      </Frame>
    )
  }

  if (phase === 'loading') {
    return (
      <Frame>
        <PortalHeader kind="home" title="بوابة المورد" subtitle="فرق للبناء" />
        <div className="text-center py-16 text-neutral-400 font-semibold">جاري تحميل الدعوة…</div>
      </Frame>
    )
  }

  if (phase === 'expired') {
    return (
      <Frame>
        <PortalHeader kind="home" title="بوابة المورد" subtitle="فرق للبناء" />
        <Centered>
          <ExpiredLink token={token} />
        </Centered>
      </Frame>
    )
  }

  if (phase === 'error') {
    return (
      <Frame>
        <PortalHeader kind="home" title="بوابة المورد" subtitle="فرق للبناء" />
        <Centered>
          <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
            <div className="font-bold text-red-700 mb-2">تعذر فتح الدعوة</div>
            <div className="text-sm text-red-600 mb-4">{loadError || 'حاول مرة ثانية.'}</div>
            <button type="button" onClick={() => void load()} className="text-sm font-bold text-[#123F3A]">
              أعد المحاولة
            </button>
          </div>
        </Centered>
      </Frame>
    )
  }

  if (screen === 'account' && account) {
    return (
      <AccountView
        client={client}
        account={account}
        supplierName={supplierName}
        onAccountChange={setAccount}
        onClose={() => setScreen(selected ? 'request' : 'list')}
      />
    )
  }

  const onAccount = mode === 'session' && account && !declined ? () => setScreen('account') : null

  if (screen === 'list' || !selected) {
    return (
      <Frame>
        <PortalHeader kind="home" title="بوابة المورد" subtitle={supplierName} onAccount={onAccount} />
        <main className="max-w-2xl mx-auto px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+24px)]">
          <RequestsList requests={requests} onOpen={openRequest} now={now} />
        </main>
      </Frame>
    )
  }

  // ─── One request ───────────────────────────────────────────────────────

  const hiddenTabs: RequestTab[] = declined ? ['chat', 'status'] : chatEnabled ? [] : ['chat']
  const header = multi ? (
    <PortalHeader
      kind="back"
      title={selected.buyer_company || 'المشتري'}
      subtitle={selected.reference || null}
      onBack={() => {
        setScreen('list')
        void refreshRequests()
      }}
      onAccount={onAccount}
    />
  ) : (
    <PortalHeader kind="home" title="بوابة المورد" subtitle={supplierName} onAccount={onAccount} />
  )
  const tabs = declined ? null : (
    <RequestTabs active={tab} onChange={setTab} unread={selected.unread_count} hidden={hiddenTabs} />
  )

  const banner =
    mode === 'session' && account?.status === 'PROVISIONED' ? (
      <AccountReadyBanner
        supplierName={supplierName}
        company={shortCompany(selected.buyer_company || 'المشتري')}
        onDecline={() => {
          setDeclineError(null)
          setDeclineOpen(true)
        }}
      />
    ) : declined ? (
      <div className="bg-neutral-100 border border-neutral-200 rounded-2xl px-4 py-3 text-[13px] font-semibold text-neutral-700 leading-relaxed">
        ألغينا الحساب. الرابط يبقى صالحاً لتقديم عرضك فقط — ولن تصلك تحديثات أو رسائل هنا.
      </div>
    ) : null

  const sheet = (
    <BottomSheet open={declineOpen} onClose={() => setDeclineOpen(false)} label="ليس حسابي">
      <h2 className="text-[18px] font-extrabold text-[#0D1F1D]">هذا الحساب مو لكم؟</h2>
      <p className="text-[14px] text-neutral-600 leading-[1.7]">
        إذا وصلكم الرابط بالغلط أو ما تمثّلون {supplierName}، نلغي الحساب ولا نرسل لكم تحديثات.
      </p>
      <p className="text-[13px] font-semibold text-neutral-500">الرابط يبقى صالحاً لتقديم العرض فقط.</p>
      {declineError && <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{declineError}</div>}
      <PrimaryButton disabled={declining} onClick={() => void decline()}>
        {declining ? 'جارٍ الإلغاء…' : 'نعم، ليس حسابي'}
      </PrimaryButton>
      <SecondaryButton onClick={() => setDeclineOpen(false)}>رجوع</SecondaryButton>
    </BottomSheet>
  )

  if (chatActive) {
    return (
      <div
        dir="rtl"
        className="fixed inset-x-0 top-0 flex flex-col bg-[#FAFAF8] overflow-hidden"
        style={viewport ? { height: viewport.height, transform: `translateY(${viewport.top}px)` } : { height: '100dvh' }}
      >
        {header}
        {tabs}
        <SupplierChat
          key={selected.invite_id}
          client={client}
          inviteId={selected.invite_id}
          company={selected.buyer_company || 'المشتري'}
          lineRef={lineRef}
          onClearLineRef={() => setLineRef(null)}
          onRead={markRead}
          now={now}
        />
        {sheet}
      </div>
    )
  }

  const effectiveTab: RequestTab = declined ? 'quote' : tab

  return (
    <Frame>
      {header}
      {tabs}
      <main className="max-w-2xl mx-auto px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+32px)]">
        {effectiveTab === 'quote' &&
          (selectedIsLinked && invite ? (
            <QuoteForm
              key={invite.invite_id}
              token={token}
              invite={invite}
              deadline={selected.deadline || legacyDeadline(invite)}
              now={now}
              banner={banner}
              onSubmitted={() => void refreshRequests()}
              onInquire={
                chatEnabled
                  ? (ref) => {
                      setLineRef(ref)
                      setTab('chat')
                    }
                  : null
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {banner}
              <Card className="text-center p-6">
                <div className="text-[15px] font-bold text-[#0D1F1D] mb-1">{selected.buyer_company || 'المشتري'}</div>
                <p className="text-[13px] text-neutral-500 leading-relaxed">
                  لتقديم عرضك على هذا الطلب أو تعديله، افتح الرابط اللي وصلكم من {shortCompany(selected.buyer_company || 'الشركة')} لهذا الطلب.
                </p>
              </Card>
            </div>
          ))}
        {effectiveTab === 'status' && (
          <StatusPanel request={selected} now={now} onMessage={chatEnabled ? () => setTab('chat') : null} />
        )}
      </main>
      {sheet}
    </Frame>
  )
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[#FAFAF8]" dir="rtl">
      {children}
    </div>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="max-w-md mx-auto px-4 py-8">{children}</div>
}

function AccountReadyBanner({
  supplierName,
  company,
  onDecline,
}: {
  supplierName: string
  company: string
  onDecline: () => void
}) {
  return (
    <div className="bg-[#F1FBF5] border border-[#CFF5DC] rounded-2xl p-3.5 flex flex-col gap-2.5">
      <div className="flex items-start gap-2.5">
        <span className="w-8 h-8 flex-shrink-0 rounded-full bg-white text-[#1a7a45] flex items-center justify-center">
          <AccountIcon className="w-[18px] h-[18px]" />
        </span>
        <p className="flex-1 min-w-0 text-[13px] font-bold leading-[1.65] text-[#123F3A]">
          جهّزنا لك حساباً باسم {supplierName} — تابع عرضك وراسل {company} هنا
        </p>
      </div>
      <div>
        <SecondaryButton small onClick={onDecline}>
          ليس حسابي
        </SecondaryButton>
      </div>
    </div>
  )
}

function ExpiredLink({ token }: { token: string }) {
  const client = useMemo(() => supplierPortalClient(), [])
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'unavailable'>('idle')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const ask = async () => {
    setState('sending')
    try {
      const out = await client.requestNewLink(token)
      setSentTo(out.sent_to)
      setState('sent')
    } catch {
      setState('unavailable')
    }
  }
  return (
    <Card className="text-center p-6">
      <span className="mx-auto mb-4 w-12 h-12 rounded-full bg-neutral-100 text-neutral-500 flex items-center justify-center">
        <LockIcon className="w-5 h-5" />
      </span>
      <h1 className="text-[20px] font-black text-[#0D1F1D] mb-2">انتهت صلاحية هذا الرابط</h1>
      <p className="text-[13px] text-neutral-600 leading-relaxed mb-5">
        لحمايتكم، روابط الدخول لها مدة صلاحية. حسابكم وعروضكم محفوظة.
      </p>
      {state === 'sent' ? (
        <div className="text-[13px] font-bold text-[#1a7a45]">
          أرسلنا لكم رابطاً جديداً{sentTo ? <> على <bdi dir="ltr">{sentTo}</bdi></> : null}.
        </div>
      ) : state === 'unavailable' ? (
        <div className="text-[13px] text-neutral-600">اطلب من الشركة اللي أرسلت لكم الطلب رابطاً جديداً.</div>
      ) : (
        <PrimaryButton disabled={state === 'sending'} onClick={() => void ask()}>
          {state === 'sending' ? 'جارٍ الإرسال…' : 'أرسل لي رابط جديد'}
        </PrimaryButton>
      )}
    </Card>
  )
}

export default SupplierPortalView
