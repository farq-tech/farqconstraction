import { avatarTone, supplierInitials } from '../../lib/inboxChat'

/** Brand-adjacent tints only — an avatar is a landmark, not decoration. */
const TONES = [
  'bg-[#CFF5DC] text-[#123F3A]',
  'bg-[#123F3A] text-[#CFF5DC]',
  'bg-[#E6EFE9] text-[#123F3A]',
  'bg-[#F3E9D2] text-[#5C4A1E]',
  'bg-[#DDEBF3] text-[#1F4A5E]',
  'bg-[#EFE3EC] text-[#5A2F50]',
]

export function SupplierAvatar({ name, size = 'md' }: { name: string; size?: 'md' | 'sm' }) {
  const tone = TONES[avatarTone(name, TONES.length)]
  return (
    <div
      aria-hidden="true"
      className={`flex-shrink-0 rounded-full flex items-center justify-center font-black select-none ${tone} ${
        size === 'sm' ? 'w-10 h-10 text-sm' : 'w-12 h-12 text-base'
      }`}
    >
      {supplierInitials(name)}
    </div>
  )
}

export default SupplierAvatar
