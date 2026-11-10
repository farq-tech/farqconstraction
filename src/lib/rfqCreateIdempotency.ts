const KEY_PREFIX = "farq:construction:create-rfq:v1:"
const KEY_TTL_MS = 24 * 60 * 60 * 1000

/**
 * A match exposure ID identifies one matching response, not the RFQ intent.
 * The API uses the same canonical form so a re-match can replay a timed-out
 * create while retaining the original exposure record on the stored RFQ.
 */
export function canonicalRfqCreatePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload
  const record = payload as Record<string, unknown>
  if (!Array.isArray(record.packages)) return payload
  return {
    ...record,
    packages: record.packages.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry
      const { exposure_id: _exposureId, exposure_ids: _exposureIds, ...stable } = entry as Record<string, unknown>
      return stable
    }),
  }
}

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
  return fingerprintSerialized(JSON.stringify(canonicalRfqCreatePayload(payload)))
}

/** The pre-canonical v1 slot used the full request body. */
async function legacyFingerprint(payload: unknown): Promise<string> {
  return fingerprintSerialized(JSON.stringify(payload))
}

async function fingerprintSerialized(serialized: string): Promise<string> {
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

function readValidEntry(value: string | null, now: number): { key: string; expiresAt: number } | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as { key?: unknown; expiresAt?: unknown }
    if (typeof parsed.key === "string" && typeof parsed.expiresAt === "number" && parsed.expiresAt > now) {
      return { key: parsed.key, expiresAt: parsed.expiresAt }
    }
  } catch {
    // Ignore malformed or stale session entries.
  }
  return null
}

/** Reuse the same key for an identical RFQ retry in this tab for 24 hours. */
export async function getRfqCreateIdempotencyKey(payload: unknown, now = Date.now()): Promise<string> {
  const storageKey = `${KEY_PREFIX}${await fingerprint(payload)}`
  try {
    const existing = readValidEntry(sessionStorage.getItem(storageKey), now)
    if (existing) return existing.key

    const legacyStorageKey = `${KEY_PREFIX}${await legacyFingerprint(payload)}`
    if (legacyStorageKey !== storageKey) {
      const legacy = readValidEntry(sessionStorage.getItem(legacyStorageKey), now)
      if (legacy) {
        try {
          sessionStorage.setItem(storageKey, JSON.stringify(legacy))
          sessionStorage.removeItem(legacyStorageKey)
        } catch {
          // Reuse the pending key even if the old slot cannot be migrated.
        }
        return legacy.key
      }
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
  try {
    const storageKeys = new Set([
      `${KEY_PREFIX}${await fingerprint(payload)}`,
      `${KEY_PREFIX}${await legacyFingerprint(payload)}`,
    ])
    for (const storageKey of storageKeys) {
      const existing = readValidEntry(sessionStorage.getItem(storageKey), 0)
      if (existing?.key === key) sessionStorage.removeItem(storageKey)
    }
  } catch {
    // The RFQ is already confirmed; disabled storage must not affect the flow.
  }
}
