import { useLayoutEffect, useState, type RefObject } from 'react'

/**
 * Sizes an element to exactly the viewport space the app shell leaves it, so a
 * chat screen can scroll inside its panes while the page itself never scrolls.
 *
 * Measured rather than hardcoded: the space above varies (the read-only banner
 * wraps on narrow screens, the mobile header exists only below `lg`), and the
 * shell is not this screen's file to edit. Below: the shell's fixed bottom
 * tab bar is measured when it is showing; the `<main>` bottom padding that
 * normally clears it is cancelled with a negative margin so the two do not
 * add up.
 */
export function useFillViewport(ref: RefObject<HTMLElement | null>): {
  height: number | null
  marginBottom: number
} {
  const [box, setBox] = useState<{ height: number | null; marginBottom: number }>({
    height: null,
    marginBottom: 0,
  })

  useLayoutEffect(() => {
    const compute = () => {
      const el = ref.current
      if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY
      const main = el.closest('main')
      const mainPad = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0
      let reserve = mainPad
      const bar = main?.parentElement?.querySelector(':scope > nav')
      if (bar instanceof HTMLElement) {
        // `display: none` on wide screens → the bar reserves nothing.
        reserve = getComputedStyle(bar).position === 'fixed' ? bar.offsetHeight : 0
      }
      const height = Math.max(360, Math.floor(window.innerHeight - top - reserve))
      setBox((prev) =>
        prev.height === height && prev.marginBottom === -mainPad ? prev : { height, marginBottom: -mainPad },
      )
    }
    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('orientationchange', compute)
    // The banner above can change height without a window resize (font load, wrap).
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(compute) : null
    if (observer) observer.observe(document.body)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('orientationchange', compute)
      observer?.disconnect()
    }
  }, [ref])

  return box
}

export default useFillViewport
