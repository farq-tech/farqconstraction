import { useEffect, useState } from 'react'
import { getConstructionMe } from '../../api/constructionClient'

/**
 * Whether the signed-in buyer is the account's ADMIN (GET /me role). False
 * until known and on any failure: a non-admin never sees an admin control,
 * and the server refuses the action anyway (403).
 */
export function useConstructionAdmin(): boolean {
  const [admin, setAdmin] = useState(false)
  useEffect(() => {
    let cancelled = false
    getConstructionMe()
      .then((me) => {
        if (!cancelled) setAdmin(String(me?.role || '').toUpperCase() === 'ADMIN')
      })
      .catch(() => {
        if (!cancelled) setAdmin(false)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return admin
}

export default useConstructionAdmin
