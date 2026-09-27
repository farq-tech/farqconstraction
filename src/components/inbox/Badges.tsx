import { ChatIcon, MailIcon, PhoneIcon } from '../../icons'
import type { ChannelKey, MeaningKey } from '../../lib/inboxFilters'
import { MEANING_LABEL } from '../../lib/inboxFilters'

/**
 * Where a conversation happens, and what it costs us. Buyer side only.
 * «عبر واتساب — يُحتسب» appears only for messages that ARRIVED on WhatsApp —
 * nothing is sent to WhatsApp from the inbox. Haraj is never named: «محادثة».
 */
export function ChannelBadge({ channel, short = false }: { channel: ChannelKey; short?: boolean }) {
  if (channel === 'whatsapp') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#E3F7EA] text-[#128C4B] px-2 py-0.5 text-[10px] font-bold whitespace-nowrap">
        <PhoneIcon className="w-3 h-3" />
        {short ? 'واتساب' : 'عبر واتساب — يُحتسب'}
      </span>
    )
  }
  if (channel === 'email') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-farq-100 text-farq px-2 py-0.5 text-[10px] font-bold whitespace-nowrap">
        <MailIcon className="w-3 h-3" />
        {short ? 'إيميل' : 'عبر الإيميل — مجاناً'}
      </span>
    )
  }
  if (channel === 'chat') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-farq-100 text-farq px-2 py-0.5 text-[10px] font-bold whitespace-nowrap">
        <ChatIcon className="w-3 h-3" />
        محادثة
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-farq-100 text-farq px-2 py-0.5 text-[10px] font-bold whitespace-nowrap">
      <ChatIcon className="w-3 h-3" />
      {short ? 'عبر المنصة' : 'عبر المنصة — مجاناً'}
    </span>
  )
}

const MEANING_CLASS: Record<MeaningKey, string> = {
  QUOTE_FILE: 'bg-emerald-600 text-white',
  PRICE_IN_TEXT: 'bg-emerald-100 text-emerald-800',
  QUESTION: 'bg-blue-100 text-blue-700',
  DECLINED: 'bg-red-100 text-red-700',
  ALT_CONTACT: 'bg-amber-100 text-amber-800',
  INTERESTED: 'bg-green-100 text-green-800',
  AUTO_REPLY: 'bg-neutral-100 text-neutral-600',
  VOICE: 'bg-neutral-100 text-neutral-600',
}

/** «معنى الرد» — the server's classification of the supplier's reply. */
export function ReplyMeaningChip({ meaning }: { meaning: MeaningKey }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${MEANING_CLASS[meaning]}`}>
      {MEANING_LABEL[meaning]}
    </span>
  )
}

/** «ملف مرفق» — same family as the reply chips. */
export function AttachmentChip() {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap bg-farq-100 text-farq">
      ملف مرفق
    </span>
  )
}

export function meaningChipClass(meaning: MeaningKey): string {
  return MEANING_CLASS[meaning]
}
