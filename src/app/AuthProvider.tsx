import { createContext, useContext, useMemo, useState, useEffect, type ReactNode } from "react"
import { setAccessTokenProvider } from "@/lib/api/construction"
import { env } from "@/lib/env"

export type AuthStatus = "loading" | "authenticated" | "anonymous"

interface AuthContextValue {
  status: AuthStatus
  accessToken: string | null
  /** Prototype-only session until Phase A wires Supabase Auth. */
  isPrototypeSession: boolean
  enterPrototypeSession: () => void
  clearSession: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const PROTO_KEY = "farq-construction-proto-session"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading")
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [isPrototypeSession, setIsPrototypeSession] = useState(false)

  useEffect(() => {
    setAccessTokenProvider(() => accessToken)
  }, [accessToken])

  useEffect(() => {
    // Phase A will replace this with Supabase session restore.
    // Never invent a real user. Prototype session is explicit and flagged.
    try {
      const proto = sessionStorage.getItem(PROTO_KEY)
      if (env.allowPrototypeChrome && proto === "1") {
        setIsPrototypeSession(true)
        setStatus("authenticated")
        setAccessToken(null)
        return
      }
    } catch {
      /* ignore */
    }
    setStatus("anonymous")
    setAccessToken(null)
    setIsPrototypeSession(false)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      accessToken,
      isPrototypeSession,
      enterPrototypeSession: () => {
        if (!env.allowPrototypeChrome) return
        try {
          sessionStorage.setItem(PROTO_KEY, "1")
        } catch {
          /* ignore */
        }
        setIsPrototypeSession(true)
        setAccessToken(null)
        setStatus("authenticated")
      },
      clearSession: () => {
        try {
          sessionStorage.removeItem(PROTO_KEY)
        } catch {
          /* ignore */
        }
        setIsPrototypeSession(false)
        setAccessToken(null)
        setStatus("anonymous")
      },
    }),
    [status, accessToken, isPrototypeSession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
