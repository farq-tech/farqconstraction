import { useEffect, useMemo, useState } from 'react'
import { getMyServices, type ConstructionMyServices } from './constructionClient'
import { useFarqSession } from './useFarqSession'
import { resolveServices, type ServicesState } from '../lib/services'

/*
 * One read of /me/services per signed-in user, shared by every caller.
 * A failure (old API, network) is remembered as «unknown» — the app then
 * behaves exactly as before (rfq visible).
 */
const cache = new Map<string, Promise<ConstructionMyServices | null>>()

function load(userKey: string): Promise<ConstructionMyServices | null> {
  let hit = cache.get(userKey)
  if (!hit) {
    hit = getMyServices().catch(() => null)
    cache.set(userKey, hit)
  }
  return hit
}

/** Forget the cached answer (after an admin changes services). */
export function refreshServices() {
  cache.clear()
}

export function useServices(): ServicesState {
  const session = useFarqSession()
  const userKey = session.isAuthenticated ? session.user?.id || 'me' : ''
  const [response, setResponse] = useState<ConstructionMyServices | null>(null)
  useEffect(() => {
    if (!userKey) {
      setResponse(null)
      return
    }
    let cancelled = false
    void load(userKey).then((value) => {
      if (!cancelled) setResponse(value)
    })
    return () => {
      cancelled = true
    }
  }, [userKey])
  return useMemo(() => resolveServices(response), [response])
}
