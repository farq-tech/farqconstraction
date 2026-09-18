/// <reference lib="webworker" />
import { resolveLinesSync, type LineInput } from './lineResolution'

self.onmessage = (event: MessageEvent<{ lines: LineInput[] }>) => {
  try {
    const resolutions = resolveLinesSync(event.data.lines)
    ;(self as unknown as Worker).postMessage({ resolutions })
  } catch (error) {
    ;(self as unknown as Worker).postMessage({ error: error instanceof Error ? error.message : 'resolution failed' })
  }
}
