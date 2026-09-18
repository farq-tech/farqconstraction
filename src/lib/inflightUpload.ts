/**
 * THE BOOKLET BEING READ SURVIVES A REFRESH.
 *
 * A refresh during the read used to throw the work away and send the buyer back
 * to an empty upload screen. The file itself is kept in this browser (IndexedDB,
 * keyed to the signed-in account) from the moment reading starts until it
 * finishes, fails or is cancelled; the upload screen picks it up on its next
 * load and carries on. The server joins the resubmitted file to the read that
 * is still running for it, so nothing starts over.
 */
const DB = 'farq-inflight-upload'
const STORE = 'files'
const KEY = 'current'
const MAX_AGE_MS = 60 * 60 * 1000

type Stored = { ownerId: string | null; savedAt: number; name: string; type: string; blob: Blob }

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function saveInflightUpload(file: File, ownerId: string | null): Promise<void> {
  const db = await open()
  if (!db) return
  try {
    const value: Stored = { ownerId, savedAt: Date.now(), name: file.name, type: file.type, blob: file }
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, KEY)
  } catch {
    /* storage unavailable: the read still runs, it just cannot resume */
  }
}

export async function loadInflightUpload(ownerId: string | null): Promise<File | null> {
  const db = await open()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
      req.onsuccess = () => {
        const v = req.result as Stored | undefined
        if (!v || v.ownerId !== ownerId || Date.now() - v.savedAt > MAX_AGE_MS) return resolve(null)
        resolve(new File([v.blob], v.name, { type: v.type || 'application/pdf' }))
      }
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function clearInflightUpload(): Promise<void> {
  const db = await open()
  if (!db) return
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEY)
  } catch {
    /* ignore */
  }
}
