/**
 * Create-flow step for the text-need search (احتياجك → النتائج → الاختيار).
 * Kept outside React so Shell can read it without a new context provider.
 */
let step = 1
const listeners = new Set<() => void>()

export function getNeedFlowStep(): number {
  return step
}

export function setNeedFlowStep(next: number): void {
  const value = next < 1 ? 1 : next > 3 ? 3 : next
  if (value === step) return
  step = value
  listeners.forEach((fn) => fn())
}

export function subscribeNeedFlowStep(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
