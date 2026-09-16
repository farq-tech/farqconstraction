/**
 * Split a supplier reply into its new content and the quoted history.
 *
 * Email replies carry the whole previous message back. The AP Tools reply is
 * four useful lines (a redirect to another contact) followed by ~660 quoted
 * lines of the original RFQ, which buries the only part a buyer needs to read.
 *
 * Detection is deliberately conservative: when the evidence is weak, or when
 * cutting would leave nothing visible, the full text is returned as visible and
 * nothing is hidden. Hiding real content is worse than showing extra text.
 */

/** Bidi controls (RLE/LRE/PDF/LRM/RLM) appear inside Gmail attribution lines. */
const BIDI = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g

const normalize = (line: string) => line.replace(BIDI, '').trim()

const isQuoted = (line: string) => /^\s*>/.test(line.replace(BIDI, ''))

/**
 * "On Tue, Sep 15, 2026 at 7:59 PM … wrote:" and its Arabic/Outlook variants.
 * Gmail wraps this line, so callers test a joined window too.
 */
function isAttribution(text: string): boolean {
  const line = normalize(text)
  if (!line || line.length > 400) return false
  if (/^-{2,}\s*(original message|forwarded message|رسالة أصلية|الرسالة الأصلية)\s*-{2,}$/i.test(line)) return true
  if (/^(from|sent|to|subject)\s*:/i.test(line) && /@/.test(line)) return true
  if (/^(من|إلى|بتاريخ|في)\s*:/.test(line) && /@/.test(line)) return true
  if (/wrote:\s*$/i.test(line) && /^on\b/i.test(line)) return true
  // Gmail Arabic: «في ١٥ سبتمبر ٢٠٢٦، كتب فرق <info@farq.sa>:» — the date word
  // opens the line, a writing verb appears, and the line ends on a colon.
  if (/^(في|بتاريخ)\s/.test(line) && /(كتب|كتبت|أرسل)/.test(line) && /:\s*$/.test(line)) return true
  return false
}

/**
 * Zendesk sends no `>` and no attribution; it separates the new message from
 * the ticket history with its own banner and a long ruler.
 */
function isZendeskBanner(text: string): boolean {
  const line = normalize(text)
  return /^#{0,2}-?\s*(الرجاء كتابة ردك فوق هذا الخط|please type your reply above this line)\s*-?#{0,2}$/i.test(line)
}

const isRuler = (text: string) => /^([-_=])\1{19,}$/.test(normalize(text))

export type SplitReply = {
  /** The supplier's new content — always non-empty when the input had content. */
  visible: string
  /** Quoted history, or null when nothing was confidently detected. */
  quoted: string | null
  reason: 'NO_QUOTE' | 'QUOTE_MARKER' | 'ATTRIBUTION' | 'DELIMITER'
}

/** Quoted lines must be a real block, not a single `>` used for emphasis. */
const MIN_QUOTED_LINES = 4
/** A bare ruler is weaker evidence than an attribution: demand a long tail. */
const MIN_DELIMITER_TAIL_LINES = 10

export function splitQuotedReply(input: string | null | undefined): SplitReply {
  const text = String(input ?? '')
  if (!text.trim()) return { visible: text, quoted: null, reason: 'NO_QUOTE' }
  const lines = text.split(/\r?\n/)

  let cut = -1
  let reason: SplitReply['reason'] = 'NO_QUOTE'

  // Some providers open with their own banner (Zendesk puts "reply above this
  // line" on line 1). Cutting there would hide everything, so keep looking for
  // the next marker instead of abandoning the split.
  const headEmpty = (index: number) => !lines.slice(0, index).join('\n').trim()

  for (let i = 0; i < lines.length; i += 1) {
    // Gmail splits the attribution across two lines ("… <\nsender@host> wrote:").
    const window = [lines[i], lines[i + 1] ?? '', lines[i + 2] ?? '']
    const joined = normalize(window.join(' '))
    if (headEmpty(i)) continue
    if (isAttribution(lines[i]) || isAttribution(joined)) {
      cut = i
      reason = 'ATTRIBUTION'
      break
    }
    if (isQuoted(lines[i])) {
      const quotedAhead = lines.slice(i).filter(isQuoted).length
      if (quotedAhead >= MIN_QUOTED_LINES) {
        cut = i
        reason = 'QUOTE_MARKER'
        break
      }
    }
    if ((isZendeskBanner(lines[i]) || isRuler(lines[i])) && lines.length - i > MIN_DELIMITER_TAIL_LINES) {
      cut = i
      reason = 'DELIMITER'
      break
    }
  }

  if (cut < 0) return { visible: text, quoted: null, reason: 'NO_QUOTE' }

  const head = lines.slice(0, cut).join('\n').replace(/\s+$/, '')
  const tail = lines.slice(cut).join('\n').trim()
  // An empty head means the message *is* the quote (a bare forward): show it all.
  if (!head.trim() || !tail) return { visible: text, quoted: null, reason: 'NO_QUOTE' }
  return { visible: head, quoted: tail, reason }
}
