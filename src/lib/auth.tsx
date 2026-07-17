import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import type { Session, User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"

type AuthContextValue = {
  session: Session | null
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

/**
 * Provider de autenticação (Fase 1, spec seção 10 item 5).
 *
 * Lê a sessão atual no mount via `supabase.auth.getSession()` e mantém-se
 * sincronizado depois via `supabase.auth.onAuthStateChange()` (cobre login,
 * logout, refresh de token e signup em qualquer aba). `loading` só fica
 * `false` depois do primeiro `getSession()` resolver — `ProtectedRoute`
 * depende disso para não redirecionar precocemente para /login antes de a
 * sessão persistida (localStorage) ter sido lida.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return
      setSession(newSession)
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, loading }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth() precisa ser usado dentro de <AuthProvider>")
  }
  return ctx
}
