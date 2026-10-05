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
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [greet, setGreet] = useState(false)
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null)
  const dragMoved = useRef(false)
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', text: 'هلا، أنا أحمد، مساعدك الآلي للمشتريات. أساعدك تراجع العروض وتجهّز طلب التخفيض مع الحفاظ على المواصفات. وش تحتاج اليوم؟' }])
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function resize() { setPosition(p => p ? { x: Math.max(0, Math.min(p.x, window.innerWidth - 120)), y: Math.max(0, Math.min(p.y, window.innerHeight - 240)) } : p) }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
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
      .ahmad-character { transform-origin: 50% 90%; animation: ahmad-idle 5s ease-in-out infinite; transition: filter .2s; }
      .ahmad-pet-button:hover .ahmad-character { animation: ahmad-greet .8s ease-in-out infinite; }
      .ahmad-pet-button:focus-visible { outline: 3px solid #7caf91; outline-offset: 4px; border-radius: 20px; }
      .ahmad-pet-button[data-dragging=true] .ahmad-character { animation: none; transform: rotate(-6deg) translateY(-6px); }
      @keyframes ahmad-idle { 0%,100% { transform: translateY(0) rotate(0); } 25% { transform: translateY(-3px) rotate(1.5deg); } 50% { transform: translateX(7px) rotate(-1.5deg); } 75% { transform: translateX(-3px) translateY(-2px) rotate(1deg); } }
      @keyframes ahmad-greet { 0%,100% { transform: rotate(-3deg) translateY(0); } 50% { transform: rotate(3deg) translateY(-7px); } }
      @media (max-width: 767px) { .ahmad-procurement-pet { bottom: calc(80px + env(safe-area-inset-bottom, 0px)); } }
      @media (prefers-reduced-motion: reduce) { .ahmad-character, .ahmad-pet-button:hover .ahmad-character { animation: none; } }
    `}</style>
    {greet && !open && <div style={{ position: 'absolute', bottom: 176, left: 0, width: 140, background: '#fff', border: '1px solid #dce5df', borderRadius: 16, padding: 8, color: '#17452d', fontSize: 12, textAlign: 'center' }}>هلا! أنا معك 👋</div>}
    {open && <section aria-label="مساعد المشتريات أحمد" style={{ position: 'fixed', bottom: 'calc(256px + env(safe-area-inset-bottom, 0px))', left: 16, width: 'min(370px, calc(100vw - 32px))', height: 'min(510px, calc(100dvh - 280px))', minHeight: 200, display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #dce5df', borderRadius: 24, boxShadow: '0 16px 60px #173c2429', overflow: 'hidden' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: '#eff6f0', borderBottom: '1px solid #dce5df' }}>
        <div style={{ flex: 1 }}><strong style={{ fontSize: 18, color: '#17452d' }}>أحمد</strong><div style={{ fontSize: 12, color: '#53665a' }}>مساعدك الآلي للمشتريات</div></div>
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
      onPointerDown={e => { if (e.button !== 0) return; const rect = e.currentTarget.parentElement!.getBoundingClientRect(); dragMoved.current = false; drag.current = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top, moved: false }; e.currentTarget.setPointerCapture(e.pointerId) }}
      onPointerMove={e => { const d = drag.current; if (!d) return; if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) d.moved = true; if (d.moved) { setDragging(true); setPosition({ x: Math.max(0, Math.min(window.innerWidth - 112, d.left + e.clientX - d.x)), y: Math.max(0, Math.min(window.innerHeight - 240, d.top + e.clientY - d.y)) }) } }}
      onPointerUp={() => { dragMoved.current = Boolean(drag.current?.moved); drag.current = null; setDragging(false) }}
      onPointerCancel={() => { drag.current = null; setDragging(false); dragMoved.current = true }}
      onClick={() => { if (dragMoved.current) { dragMoved.current = false; return } setOpen(v => !v) }} style={{ touchAction: 'none', width: 112, height: 170, display: 'flex', flexDirection: 'column', alignItems: 'center', border: 0, background: 'transparent', cursor: dragging ? 'grabbing' : 'grab', padding: 0, filter: 'drop-shadow(0 4px 8px #173c2420)' }}>
      <img className="ahmad-character" src="/ahmad-procurement.png" alt="أحمد مساعد المشتريات" draggable={false} style={{ width: 104, height: 142, objectFit: 'cover', objectPosition: 'center', borderRadius: 18 }} />
      <span style={{ background: '#17452d', color: '#fff', padding: '4px 14px', borderRadius: 20, fontSize: 13, marginTop: -4 }}>أحمد</span>
      <span style={{ fontSize: 10, color: '#17452d', background: '#fff', padding: '1px 6px', borderRadius: 8 }}>مساعد المشتريات</span>
    </button>
  </div>
}
