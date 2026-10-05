import { useEffect, useRef, useState } from 'react'

type Message = { role: 'user' | 'assistant'; text: string }
export default function AhmadAssistant({ ask, onAction, signedIn = true }: {
  ask: (message: string, history: Message[]) => Promise<string>
  onAction?: (action: 'requests' | 'upload' | 'offers') => void
  signedIn?: boolean
}) {
  const [open, setOpen] = useState(false)
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
      const answer = signedIn ? await ask(value.trim(), history) : 'سجّل دخولك أولًا حتى أراجع طلبات شركتك وعروضها. تقدر تسألني بعدها عن الأسعار والمواصفات والتفاوض.'
      setMessages(m => [...m, { role: 'assistant', text: answer }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', text: 'ما قدرت أوصل لبياناتك الآن. جرّب مرة ثانية؛ ما أرسلت أي رسالة للموردين.' }])
    } finally { setBusy(false) }
  }
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
      @keyframes ahmad-idle { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(1.012); } }
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
      <span className="ahmad-character" role="img" aria-label="أحمد مساعد المشتريات" data-pose={frame} style={{ position: 'relative', display: 'block', width: 104 * size, height: 156 * size, flexShrink: 0, mixBlendMode: 'multiply' }}>
        {dragging ? <span aria-hidden="true" data-direction={runDirection} style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/ahmad-procurement-run.png)', backgroundSize: '400% 200%', backgroundPosition: `${runFrame * 100 / 3}% ${runDirection === 'right' ? 0 : 100}%`, backgroundRepeat: 'no-repeat' }} /> : [previousFrame, frame].map((pose, layer) => <span key={layer === 1 ? `current-${pose}` : `previous-${pose}-${frame}`} aria-hidden="true" className={layer === 1 ? 'ahmad-pose-enter' : 'ahmad-pose-leave'} style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/ahmad-procurement-sprites-v2.png)', backgroundSize: '400% 200%', backgroundPosition: `${(pose % 4) * 100 / 3}% ${pose < 4 ? 0 : 100}%`, backgroundRepeat: 'no-repeat' }} />)}
      </span>
      <span style={{ background: '#17452d', color: '#fff', padding: '4px 14px', borderRadius: 20, fontSize: 13, marginTop: -4 }}>أحمد</span>
      <span style={{ fontSize: 10, color: '#17452d', background: '#fff', padding: '1px 6px', borderRadius: 8 }}>مساعد المشتريات</span>
      <span style={{ fontSize: 9, lineHeight: 1.4, color: '#17452d', background: '#fff', padding: '1px 4px', borderRadius: 8, whiteSpace: 'nowrap' }}>شركة الدفع للتجارة والمقاولات</span>
    </button>
    <div role="group" aria-label="حجم شخصية أحمد" style={{ position: 'absolute', top: 20, right: -22, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <button type="button" aria-label="تكبير أحمد" disabled={size >= 1.45} onClick={() => resizePet(0.15)} style={{ width: 24, height: 24, borderRadius: 12, border: '1px solid #dce5df', background: '#fff', color: '#17452d', fontSize: 18 }}>+</button>
      <button type="button" aria-label="تصغير أحمد" disabled={size <= 0.65} onClick={() => resizePet(-0.15)} style={{ width: 24, height: 24, borderRadius: 12, border: '1px solid #dce5df', background: '#fff', color: '#17452d', fontSize: 18 }}>−</button>
    </div>
  </div>
}
