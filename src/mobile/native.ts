/**
 * Thin access to the iOS shell. Capacitor's bridge exposes installed plugins on
 * `window.Capacitor.Plugins`; in a browser there is none and every call is a no-op.
 */
type StatusBarPlugin = { setStyle: (o: { style: 'DARK' | 'LIGHT' }) => Promise<void> }
type HapticsLike = { impact?: (o: { style: string }) => Promise<void> }

function plugins(): Record<string, unknown> | null {
  const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor
  return cap?.Plugins ?? null
}

/** `onDark` = light text, for the green screens; otherwise dark text. */
export function statusBar(onDark: boolean): void {
  const bar = plugins()?.StatusBar as StatusBarPlugin | undefined
  void bar?.setStyle({ style: onDark ? 'DARK' : 'LIGHT' }).catch(() => {})
}

export function tapFeedback(): void {
  const h = plugins()?.Haptics as HapticsLike | undefined
  void h?.impact?.({ style: 'LIGHT' }).catch(() => {})
}
