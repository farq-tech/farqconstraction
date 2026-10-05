import { useEffect, useRef, useState } from 'react'
import { executeAhmadReply, type AhmadAction, type AhmadAnswer } from '../lib/ahmadAgent'
import { getBoqItems, setCartItems } from '../store/session'
import { appendToCart, newCartDocumentId } from '../lib/rfqCart'
import { farqSession } from '../api/farqSession'

type Message = { role: 'user' | 'assistant'; text: string }
// Constrain every pose to its silhouette envelope so neighbouring sprite noise
// cannot flash while cross-fading on dark surfaces.
const POSE_CLIPS = [
  'polygon(41% 3%, 68% 3%, 78% 18%, 76% 27%, 84% 35%, 83% 51%, 77% 56%, 81% 90%, 84% 95%, 39% 95%, 38% 90%, 40% 57%, 36% 43%, 36% 31%, 42% 24%, 39% 17%)',
  'polygon(36% 3%, 61% 3%, 72% 16%, 71% 25%, 77% 35%, 77% 61%, 72% 65%, 75% 90%, 78% 95%, 33% 95%, 31% 90%, 34% 52%, 26% 43%, 27% 34%, 36% 25%, 32% 17%)',
  'polygon(32% 3%, 60% 3%, 69% 17%, 68% 26%, 75% 35%, 75% 62%, 70% 66%, 73% 90%, 77% 95%, 32% 95%, 30% 90%, 33% 41%, 21% 37%, 19% 27%, 20% 16%, 29% 14%, 31% 21%, 31% 23%, 28% 15%)',
  'polygon(31% 3%, 61% 3%, 68% 16%, 68% 26%, 75% 35%, 75% 62%, 70% 66%, 73% 90%, 78% 95%, 32% 95%, 30% 90%, 32% 41%, 20% 37%, 18% 26%, 17% 17%, 28% 12%, 32% 23%, 27% 16%)',
  'polygon(38% 2%, 68% 2%, 80% 17%, 77% 26%, 84% 36%, 84% 62%, 78% 67%, 79% 90%, 82% 96%, 39% 96%, 37% 91%, 38% 37%, 27% 35%, 27% 29%, 37% 16%)',
  'polygon(33% 2%, 63% 2%, 73% 17%, 71% 26%, 78% 36%, 78% 62%, 72% 67%, 74% 90%, 78% 96%, 33% 96%, 31% 91%, 33% 37%, 21% 35%, 21% 29%, 33% 16%)',
  'polygon(31% 2%, 60% 2%, 68% 17%, 67% 26%, 75% 36%, 75% 62%, 70% 67%, 72% 90%, 77% 96%, 32% 96%, 30% 91%, 32% 35%, 19% 30%, 19% 20%, 29% 5%)',
  'polygon(31% 2%, 61% 2%, 68% 17%, 67% 26%, 75% 36%, 75% 62%, 70% 67%, 73% 90%, 78% 96%, 32% 96%, 30% 91%, 32% 44%, 26% 39%, 27% 32%, 32% 26%, 29% 16%)',
]
const RUN_CLIP = 'polygon(39% 4%, 78% 4%, 85% 23%, 82% 32%, 90% 34%, 92% 44%, 82% 49%, 81% 57%, 91% 85%, 98% 87%, 99% 94%, 82% 98%, 62% 94%, 53% 90%, 29% 88%, 22% 87%, 17% 89%, 10% 89%, 5% 81%, 5% 69%, 20% 68%, 30% 56%, 26% 51%, 17% 50%, 16% 44%, 20% 37%, 22% 34%, 10% 29%, 10% 20%, 35% 10%)'
export default function AhmadAssistant({ ask, onAction, signedIn = true }: {
  ask: (message: string, history: Message[]) => Promise<AhmadAnswer>
  onAction?: (action: 'requests' | 'upload' | 'offers') => void
  signedIn?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('ahmad-pet-hidden') === '1' } catch { return false } })
  const [pendingAction, setPendingAction] = useState<AhmadAction | null>(null)
  const executing = useRef(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [size, setSize] = useState(0.85)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [runDirection, setRunDirection] = useState<'left' | 'right'>('right')
  const [runFrame, setRunFrame] = useState(0)
  const lastPointerX = useRef(0)
  const [greet, setGreet] = useState(false)
  const [frame, setFrame] = useState(0)
  const [previousFrame, setPreviousFrame] = useState(0)
  const frameRef = useRef(0)
  const lastGreeting = useRef(0)
  const lastIdleGesture = useRef('')
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null)
  const dragMoved = useRef(false)
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', text: 'هلا، أنا أحمد، مساعد المشتريات الآلي لشركة الدفع للتجارة والمقاولات. أساعدك تراجع العروض وتجهّز طلب التخفيض مع الحفاظ على المواصفات. وش تحتاج اليوم؟' }])
  const end = useRef<HTMLDivElement>(null)
  function toggleHidden(value: boolean) {
    setHidden(value)
    setOpen(false)
    try { localStorage.setItem('ahmad-pet-hidden', value ? '1' : '0') } catch { /* optional preference */ }
  }
  useEffect(() => {
    if (!dragging || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setRunFrame(f => (f + 1) % 4), 120)
    return () => window.clearInterval(timer)
  }, [dragging])
  const petWidth = Math.max(128, 104 * size)
  const petHeight = 156 * size + 48
  useEffect(() => { try { const saved = Number(localStorage.getItem('ahmad-pet-size')); if (saved >= 0.65 && saved <= 1.45) setSize(saved) } catch { /* optional preference */ } }, [])
  function resizePet(delta: number) {
    const next = Math.max(0.65, Math.min(1.45, Math.round((size + delta) * 100) / 100))
    setSize(next)
    try { localStorage.setItem('ahmad-pet-size', String(next)) } catch { /* optional preference */ }
  }
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setFrame(0); return }
    let stopped = false
    const timers: number[] = []
    function later(fn: () => void, ms: number) { timers.push(window.setTimeout(() => { if (!stopped) fn() }, ms)) }
    function pose(next: number) { if (frameRef.current === next) return; setPreviousFrame(frameRef.current); frameRef.current = next; setFrame(next) }
    function perform(kind: string, done?: () => void) {
      const frames = kind === 'wave' ? [0, 1, 2, 3, 2, 1, 0] : kind === 'scratch' ? [0, 4, 5, 6, 5, 7, 0] : [0, 1, 7, 0]
      let at = 0
      frames.forEach((next, i) => { later(() => pose(next), at); at += (i === 3 ? 850 : 360) + Math.random() * 170 })
      if (done) later(done, at)
    }
    function rest() {
      later(() => {
        const choices = ['scratch', 'wave', 'settle'].filter(g => g !== lastIdleGesture.current)
        const kind = choices[Math.floor(Math.random() * choices.length)]
        lastIdleGesture.current = kind; perform(kind, rest)
      }, 18000 + Math.random() * 27000)
    }
    if (dragging) pose(1)
    else if (busy) perform('scratch', rest)
    else if (greet && Date.now() - lastGreeting.current > 15000) { lastGreeting.current = Date.now(); perform('wave', rest) }
    else { pose(0); rest() }
    return () => { stopped = true; timers.forEach(window.clearTimeout) }
  }, [busy, greet, dragging])
  useEffect(() => {
    function resize() { setPosition(p => p ? { x: Math.max(0, Math.min(p.x, window.innerWidth - petWidth - 24)), y: Math.max(0, Math.min(p.y, window.innerHeight - petHeight - 80)) } : p) }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [petWidth, petHeight])
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [messages, busy, open])
  async function send(value: string) {
    if (busy || !value.trim()) return
    const history = messages.slice(-10)
    setText(''); setMessages(m => [...m, { role: 'user', text: value.trim() }]); setBusy(true)
    try {
      const answer = signedIn ? await ask(value.trim(), history) : { text: 'سجّل دخولك أولًا حتى أراجع طلبات شركتك وعروضها.' }
      setPendingAction(answer.action || null)
      setMessages(m => [...m, { role: 'assistant', text: answer.text }])
    } catch (error) {
      setMessages(m => [...m, { role: 'assistant', text: error instanceof Error ? error.message : 'تعذّر قراءة البيانات الآن. أعد المحاولة.' }])
    } finally { setBusy(false) }
  }
  async function confirmAction() {
    if (!pendingAction || executing.current) return
    if (pendingAction.kind === 'create') {
      if (pendingAction.lines?.length) {
        if (pendingAction.userId !== farqSession.getUser()?.id) { setPendingAction(null); return }
        setCartItems(appendToCart(getBoqItems(), pendingAction.lines), newCartDocumentId)
      }
      onAction?.('upload'); setOpen(false); setPendingAction(null); return
    }
    executing.current = true
    setBusy(true)
    try {
      const result = await executeAhmadReply(pendingAction)
      setMessages(m => [...m, { role: 'assistant', text: result }])
      setPendingAction(null)
    } catch (error) {
      setMessages(m => [...m, { role: 'assistant', text: error instanceof Error ? error.message : 'تعذّر تأكيد حالة الإرسال. راجع المراسلات.' }])
      // Inspect the thread before any new attempt; never blindly repeat an uncertain write.
      setPendingAction(null)
    } finally { executing.current = false; setBusy(false) }
  }
  if (hidden) return <button type="button" onClick={() => toggleHidden(false)} aria-label="إظهار مساعد المشتريات أحمد" style={{ position: 'fixed', left: 12, bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))', zIndex: 80, border: '1px solid #dce5df', borderRadius: 20, background: '#fff', color: '#17452d', padding: '6px 10px', fontSize: 11 }}>إظهار أحمد</button>
  return <div className="ahmad-procurement-pet" dir="rtl" style={{ position: 'fixed', left: position?.x ?? 16, top: position?.y, bottom: position ? 'auto' : undefined, zIndex: 80, fontFamily: 'inherit' }}>
    <style>{`
      .ahmad-procurement-pet { bottom: calc(16px + env(safe-area-inset-bottom, 0px)); }
      .ahmad-character { transform-origin: 50% 90%; animation: ahmad-idle 5s ease-in-out infinite; }
      .ahmad-pose-enter { animation: ahmad-pose-fade .34s ease-in-out both; }
      .ahmad-pose-leave { animation: ahmad-pose-out .34s ease-in-out both; }
      @keyframes ahmad-pose-fade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes ahmad-pose-out { from { opacity: 1; } to { opacity: 0; } }
      .ahmad-pet-button:focus-visible { outline: 3px solid #7caf91; outline-offset: 4px; border-radius: 20px; }
      .ahmad-pet-button[data-dragging=true] .ahmad-character { animation: none; }
      @keyframes ahmad-idle { 0%,100% { transform: translateY(0) rotate(-1deg); } 50% { transform: translateY(-8px) rotate(1deg); } }
      @media (max-width: 767px) { .ahmad-procurement-pet { bottom: calc(80px + env(safe-area-inset-bottom, 0px)); } }
      @media (prefers-reduced-motion: reduce) { .ahmad-character, .ahmad-pose-enter, .ahmad-pose-leave { animation: none; } .ahmad-pose-leave { opacity: 0; } }
    `}</style>
    {greet && !open && <div style={{ position: 'absolute', bottom: 176, left: 0, width: 140, background: '#fff', border: '1px solid #dce5df', borderRadius: 16, padding: 8, color: '#17452d', fontSize: 12, textAlign: 'center' }}>هلا! أنا معك 👋</div>}
    {open && <section aria-label="مساعد المشتريات أحمد" style={{ position: 'fixed', bottom: 'calc(256px + env(safe-area-inset-bottom, 0px))', left: 16, width: 'min(370px, calc(100vw - 32px))', height: 'min(510px, calc(100dvh - 280px))', minHeight: 200, display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #dce5df', borderRadius: 24, boxShadow: '0 16px 60px #173c2429', overflow: 'hidden' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: '#eff6f0', borderBottom: '1px solid #dce5df' }}>
        <div style={{ flex: 1 }}><strong style={{ fontSize: 18, color: '#17452d' }}>أحمد — مساعد المشتريات</strong><div style={{ fontSize: 12, color: '#53665a' }}>شركة الدفع للتجارة والمقاولات</div><div style={{ fontSize: 10, color: '#53665a' }}>مساعد آلي</div></div>
        <button type="button" aria-label="إغلاق محادثة أحمد" onClick={() => setOpen(false)} style={{ background: '#fff', borderRadius: 20, width: 32, height: 32, border: '1px solid #dce5df' }}>×</button>
      </header>
      <div role="log" aria-live="polite" style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((m, i) => <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-start' : 'flex-end', maxWidth: '92%', padding: '10px 14px', borderRadius: 16, background: m.role === 'user' ? '#17452d' : '#f2f5f2', color: m.role === 'user' ? '#fff' : '#263d2e', fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{m.text}</div>)}
        {busy && <p style={{ fontSize: 13, color: '#53665a' }}>أحمد يراجع طلبك…</p>}<div ref={end} />
      </div>
      {pendingAction && <div style={{ padding: 12, borderTop: '1px solid #dce5df', maxHeight: 180, overflowY: 'auto', fontSize: 12 }}>
        {pendingAction.kind === 'reply' && <><strong>{pendingAction.recipient}</strong><div style={{ whiteSpace: 'pre-wrap', margin: '8px 0' }}>{pendingAction.text}</div></>}
        {pendingAction.kind === 'create' && pendingAction.lines?.map((line, i) => <div key={i} style={{ marginBottom: 6 }}>{line.qty} {line.unit} · {line.name}</div>)}
        <button type="button" disabled={busy} onClick={() => void confirmAction()} style={{ background: '#17452d', color: '#fff', padding: '8px 12px', borderRadius: 12, border: 0 }}>{pendingAction.label}</button>
        <button type="button" disabled={busy} onClick={() => setPendingAction(null)} style={{ marginRight: 8, padding: '8px 12px', background: '#fff', border: '1px solid #dce5df', borderRadius: 12 }}>إلغاء</button>
      </div>}
      {onAction && <div style={{ display: 'flex', gap: 6, padding: '0 12px 10px', flexWrap: 'wrap' }}>{([['requests', 'طلباتي'], ['offers', 'العروض والتخفيض'], ['upload', 'طلب شراء جديد']] as const).map(([action, label]) => <button key={action} type="button" onClick={() => { onAction(action); setOpen(false) }} style={{ padding: '6px 10px', border: '1px solid #dce5df', borderRadius: 20, background: '#fff', color: '#17452d', fontSize: 12 }}>{label}</button>)}</div>}
      <form onSubmit={e => { e.preventDefault(); void send(text) }} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #e6ece7' }}>
        <input aria-label="رسالتك لأحمد" maxLength={2000} value={text} onChange={e => setText(e.target.value)} placeholder="اسأل أحمد عن مشترياتك…" style={{ flex: 1, minWidth: 0, border: '1px solid #dce5df', borderRadius: 12, padding: 10, fontSize: 14 }} />
        <button type="submit" disabled={busy || !text.trim()} style={{ background: '#17452d', color: '#fff', border: 0, borderRadius: 12, padding: '8px 12px', opacity: busy || !text.trim() ? 0.5 : 1 }}>إرسال</button>
      </form>
    </section>}
    <button className="ahmad-pet-button" data-dragging={dragging} type="button" aria-label={open ? 'إغلاق مساعد المشتريات أحمد' : 'تحدث مع أحمد مساعد المشتريات'} aria-expanded={open}
      onPointerEnter={() => setGreet(true)} onPointerLeave={() => setGreet(false)}
      onPointerDown={e => { if (e.button !== 0) return; const rect = e.currentTarget.parentElement!.getBoundingClientRect(); lastPointerX.current = e.clientX; dragMoved.current = false; drag.current = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top, moved: false }; e.currentTarget.setPointerCapture(e.pointerId) }}
      onPointerMove={e => { const d = drag.current; if (!d) return; if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) d.moved = true; if (d.moved) { if (Math.abs(e.clientX - lastPointerX.current) > 1) setRunDirection(e.clientX > lastPointerX.current ? 'right' : 'left'); lastPointerX.current = e.clientX; setDragging(true); setPosition({ x: Math.max(0, Math.min(window.innerWidth - petWidth - 24, d.left + e.clientX - d.x)), y: Math.max(0, Math.min(window.innerHeight - petHeight - 80, d.top + e.clientY - d.y)) }) } }}
      onPointerUp={() => { dragMoved.current = Boolean(drag.current?.moved); drag.current = null; setDragging(false) }}
      onPointerCancel={() => { drag.current = null; setDragging(false); dragMoved.current = true }}
      onClick={() => { if (dragMoved.current) { dragMoved.current = false; return } setOpen(v => !v) }} style={{ touchAction: 'none', width: petWidth, height: petHeight, display: 'flex', flexDirection: 'column', alignItems: 'center', border: 0, background: 'transparent', cursor: dragging ? 'grabbing' : 'grab', padding: 0, filter: 'drop-shadow(0 4px 8px #173c2420)' }}>
      <span className="ahmad-character" role="img" aria-label="أحمد مساعد المشتريات" data-pose={frame} style={{ position: 'relative', display: 'block', width: 104 * size, height: 156 * size, flexShrink: 0 }}>
        {dragging ? <span aria-hidden="true" data-direction={runDirection} style={{ position: 'absolute', inset: 0, backgroundImage: `url(${import.meta.env.BASE_URL}ahmad-procurement-run-transparent.png)`, backgroundSize: '400% 200%', backgroundPosition: `${runFrame * 100 / 3}% 0%`, backgroundRepeat: 'no-repeat', clipPath: RUN_CLIP, transform: runDirection === 'left' ? 'scaleX(-1)' : undefined }} /> : [previousFrame, frame].map((pose, layer) => <span key={layer === 1 ? `current-${pose}` : `previous-${pose}-${frame}`} aria-hidden="true" className={layer === 1 ? 'ahmad-pose-enter' : 'ahmad-pose-leave'} style={{ position: 'absolute', inset: 0, backgroundImage: `url(${import.meta.env.BASE_URL}ahmad-procurement-sprites-transparent.png)`, backgroundSize: '400% 200%', backgroundPosition: `${(pose % 4) * 100 / 3}% ${pose < 4 ? 0 : 100}%`, backgroundRepeat: 'no-repeat', clipPath: POSE_CLIPS[pose] }} />)}
      </span>
      <span style={{ background: '#17452d', color: '#fff', padding: '4px 14px', borderRadius: 20, fontSize: 13, marginTop: -4 }}>أحمد</span>
      <span style={{ fontSize: 10, color: '#17452d', padding: '1px 6px', textShadow: '0 1px 3px #fff, 0 0 6px #fff' }}>مساعد المشتريات</span>
      <span style={{ fontSize: 9, lineHeight: 1.4, color: '#17452d', padding: '1px 4px', textShadow: '0 1px 3px #fff, 0 0 6px #fff', whiteSpace: 'nowrap' }}>شركة الدفع للتجارة والمقاولات</span>
    </button>
    <div role="group" aria-label="حجم شخصية أحمد" style={{ position: 'absolute', top: 20, right: -22, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <button type="button" aria-label="إخفاء أحمد" title="إخفاء أحمد" onClick={() => toggleHidden(true)} style={{ width: 24, height: 24, borderRadius: 12, border: '1px solid #dce5df', background: '#fff', color: '#17452d', fontSize: 16 }}>×</button>
      <button type="button" aria-label="تكبير أحمد" disabled={size >= 1.45} onClick={() => resizePet(0.15)} style={{ width: 24, height: 24, borderRadius: 12, border: '1px solid #dce5df', background: '#fff', color: '#17452d', fontSize: 18 }}>+</button>
      <button type="button" aria-label="تصغير أحمد" disabled={size <= 0.65} onClick={() => resizePet(-0.15)} style={{ width: 24, height: 24, borderRadius: 12, border: '1px solid #dce5df', background: '#fff', color: '#17452d', fontSize: 18 }}>−</button>
    </div>
  </div>
}
