const KEY_PREFIX = "farq:construction:create-rfq:v1:"
const KEY_TTL_MS = 24 * 60 * 60 * 1000

function randomKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID()
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16)
    return (char === "x" ? value : (value & 0x3) | 0x8).toString(16)
  })
}

function fallbackFingerprint(value: string): string {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`
}

async function fingerprint(payload: unknown): Promise<string> {
  const serialized = JSON.stringify(payload)
  try {
    if (typeof globalThis.crypto?.subtle?.digest === "function") {
      const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized))
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
    }
  } catch {
    // A short fallback fingerprint still only selects a local storage slot;
    // the server independently hashes the full request before replaying it.
  }
  return fallbackFingerprint(serialized)
}

/** Reuse the same key for an identical RFQ retry in this tab for 24 hours. */
export async function getRfqCreateIdempotencyKey(payload: unknown, now = Date.now()): Promise<string> {
  const storageKey = `${KEY_PREFIX}${await fingerprint(payload)}`
  try {
    const existing = sessionStorage.getItem(storageKey)
    if (existing) {
      const parsed = JSON.parse(existing) as { key?: unknown; expiresAt?: unknown }
      if (typeof parsed.key === "string" && typeof parsed.expiresAt === "number" && parsed.expiresAt > now) return parsed.key
    }
  } catch {
    // Storage can be disabled by browser policy; create still works without it.
  }

  const key = randomKey()
  try {
    sessionStorage.setItem(storageKey, JSON.stringify({ key, expiresAt: now + KEY_TTL_MS }))
  } catch {
    // The request can still be created; server protection applies whenever the
    // browser can persist the key.
  }
  return key
}

/** Remove a confirmed create so a later intentional identical RFQ gets a fresh key. */
export async function clearRfqCreateIdempotencyKey(payload: unknown, key: string): Promise<void> {
  const storageKey = `${KEY_PREFIX}${await fingerprint(payload)}`
  try {
    const existing = sessionStorage.getItem(storageKey)
    if (!existing) return
    const parsed = JSON.parse(existing) as { key?: unknown }
    if (parsed.key === key) sessionStorage.removeItem(storageKey)
  } catch {
    // The RFQ is already confirmed; disabled storage must not affect the flow.
  }
}
