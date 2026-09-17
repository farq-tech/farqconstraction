/**
 * THE WORK SURVIVES THE TAB.
 *
 * The owner's rule: «إذا رفعت كراسة لا تُحذف إلا إذا ضغطت زر ريست». A booklet
 * takes minutes to read and an hour to review, and until now all of it lived in
 * a JavaScript variable: a refresh, a phone locking, a stray back gesture, and
 * the tender was gone with no way back but re-uploading.
 *
 * So the working session is written to the browser as it changes and read back
 * at boot. Two rules keep that safe:
 *
 *  1. It is stored UNDER THE SIGNED-IN ACCOUNT and restored only for that same
 *     account, so a shared machine never hands the next person a loaded tender.
 *  2. Only an explicit act clears it — pressing «ابدأ من جديد», uploading
 *     another booklet, or signing in as somebody else.
 *
 * IndexedDB holds it, because a 1,500-line booklet with its suggested sellers
 * is megabytes and `localStorage` would throw at the quota and lose the lot.
 */

const DB_NAME = 'farq-construction'
const STORE = 'session'
const KEY = 'working-session'

type Snapshot = { ownerUserId: string | null; savedAt: number; state: unknown }

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      // A private window can leave the request hanging; never block the app on it.
      setTimeout(() => resolve(request.readyState === 'done' ? request.result ?? null : null), 2000)
    } catch {
      resolve(null)
    }
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await open()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode)
      const request = run(tx.objectStore(STORE))
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => resolve(null)
      tx.onabort = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

let pending: ReturnType<typeof setTimeout> | null = null

/** Writes the snapshot, coalescing the bursts a parse produces. */
export function persistSession(ownerUserId: string | null, state: unknown): void {
  if (pending) clearTimeout(pending)
  pending = setTimeout(() => {
    pending = null
    const snapshot: Snapshot = { ownerUserId, savedAt: Date.now(), state }
    void withStore('readwrite', (store) => store.put(snapshot, KEY))
  }, 400)
}

/** The stored session for this account, or null when there is none to restore. */
export async function loadPersistedSession(ownerUserId: string | null): Promise<unknown | null> {
  const snapshot = (await withStore<Snapshot>('readonly', (store) => store.get(KEY))) as Snapshot | null
  if (!snapshot || typeof snapshot !== 'object') return null
  // Another account's work is never shown, and an anonymous snapshot is never
  // handed to a signed-in buyer.
  if ((snapshot.ownerUserId ?? null) !== (ownerUserId ?? null)) return null
  return snapshot.state ?? null
}

/** The reset button, and nothing else, calls this. */
export function clearPersistedSession(): void {
  if (pending) clearTimeout(pending)
  pending = null
  void withStore('readwrite', (store) => store.delete(KEY))
}
