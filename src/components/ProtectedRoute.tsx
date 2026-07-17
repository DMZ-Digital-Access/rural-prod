import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAuth } from "@/lib/auth"
import { AppShell } from "@/components/layout/AppShell"

/**
 * Guarda de rota para tudo sob /app (spec seção 10 item 6). Enquanto
 * `loading` for true (primeira leitura de `getSession()` ainda em curso),
 * mostra um estado de carregamento em vez de redirecionar — redirecionar
 * antes disso mandaria qualquer usuário já logado (sessão persistida em
 * localStorage) de volta para /login por engano, no instante entre o mount
 * do app e o retorno do getSession().
 */
export function ProtectedRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Carregando sessão…
      </div>
    )
  }

  if (!session) {
    const redirect = encodeURIComponent(
      `${location.pathname}${location.search}`
    )
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
