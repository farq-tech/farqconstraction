/**
 * «طلب تسعير جديد» on the home screen.
 *
 * On a wide screen the sidebar already carries a «طلب تسعير جديد» that opens
 * «كيف تبي تبدأ طلب التسعير؟», so this button keeps its old job there: pick a
 * booklet straight away. A phone has no sidebar, so this is the only way in —
 * there it opens the chooser, and search and typed lines are reachable too.
 */
import { UploadIcon } from '../../icons'

export default function NewRequestButton({ onPickFile, onStart }: { onPickFile: () => void; onStart: () => void }) {
  return (
    <>
      <button
        type="button"
        data-action="start-chooser"
        onClick={onStart}
        className="lg:hidden w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 min-h-12 bg-[#123F3A] text-white font-bold rounded-xl active:bg-[#1a5c54] transition-colors text-sm shadow-sm"
      >
        <span className="text-lg leading-none">+</span>
        طلب تسعير جديد
      </button>
      <button
        type="button"
        data-action="pick-booklet"
        onClick={onPickFile}
        className="hidden lg:flex items-center gap-2 px-5 py-3 bg-[#123F3A] text-white font-bold rounded-xl hover:bg-[#1a5c54] transition-colors text-sm shadow-sm"
      >
        <UploadIcon className="w-4 h-4" />
        طلب تسعير جديد
      </button>
    </>
  )
}
