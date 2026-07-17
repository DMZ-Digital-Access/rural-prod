import { useEffect, useRef, useState } from "react"
import { Navigate, useNavigate, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type EstadoAceite = "aguardando" | "processando" | "erro"

/**
 * /convites/aceitar (spec seção 8; ADR-0002 D2, `aceitar_convite(p_token
 * uuid)`). Fluxo é diferente do signup com convite: aqui o usuário JÁ ESTÁ
 * AUTENTICADO (login normal se ainda não estava) e está entrando numa
 * fazenda ADICIONAL, não criando conta nova.
 */
export function AceitarConvitePage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token")

  const [estado, setEstado] = useState<EstadoAceite>("aguardando")
  const [erro, setErro] = useState<string | null>(null)
  const jaChamou = useRef(false)

  useEffect(() => {
    if (loading || !session || !token || jaChamou.current) {
      return
    }

    jaChamou.current = true
    setEstado("processando")

    supabase
      .rpc("aceitar_convite", { p_token: token })
      .then(({ error }) => {
        if (error) {
          setEstado("erro")
          setErro(error.message)
          return
        }

        toast.success("Convite aceito. Bem-vindo à nova fazenda!")
        navigate("/app/dashboard", { replace: true })
      })
  }, [loading, session, token, navigate])

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Carregando sessão…
      </div>
    )
  }

  if (!token) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Convite inválido</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Nenhum token de convite foi informado na URL.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!session) {
    const destino = encodeURIComponent(
      `/convites/aceitar?token=${encodeURIComponent(token)}`
    )
    return <Navigate to={`/login?redirect=${destino}`} replace />
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Aceitando convite</CardTitle>
        </CardHeader>
        <CardContent>
          {estado === "erro" ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              {erro}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Processando o convite, aguarde…
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
