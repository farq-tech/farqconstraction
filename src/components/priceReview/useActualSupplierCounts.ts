import { useEffect, useState } from 'react'
import { getConstructionMe } from '../../api/constructionClient'
import { farqSession } from '../../api/farqSession'

let cached: { userId: string; promise: ReturnType<typeof getConstructionMe> } | null = null

/** Server-granted permission; company ADMIN and browser email grant nothing. */
export function useActualSupplierCounts(): boolean {
  const [allowed, setAllowed] = useState(false)
  useEffect(() => {
    let generation = 0
    let disposed = false
    const load = () => {
      const current = ++generation
      const userId = farqSession.getUser()?.id
      setAllowed(false)
      if (!userId) return
      if (cached?.userId !== userId) cached = { userId, promise: getConstructionMe() }
      cached.promise.then(me => {
        if (!disposed && current === generation && farqSession.getUser()?.id === userId) {
          setAllowed(me.user_id === userId && me.permissions?.view_actual_supplier_counts === true)
        }
      }).catch(() => {})
    }
    load()
    const unsubscribe = farqSession.subscribe(event => {
      if (['IDENTITY_CHANGED', 'USER_UPDATED', 'SIGNED_IN', 'SIGNED_OUT'].includes(event)) { cached = null; load() }
    })
    return () => { disposed = true; generation++; unsubscribe() }
  }, [])
  return allowed
}
