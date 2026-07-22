import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { useAuth } from "@/lib/auth"

type FazendaSelecionadaContextValue = {
  fazendaIdSelecionada: string | null
  selecionarFazenda: (fazendaId: string) => void
}

const FazendaSelecionadaContext = createContext<
  FazendaSelecionadaContextValue | undefined
>(undefined)

function chaveStorage(userId: string) {
  return `livestock-control:fazenda-selecionada:${userId}`
}

/**
 * "Fazenda atual" selecionável pelo usuário (multi-fazenda, 2026-07-22) —
 * persiste em localStorage, com a chave escopada por usuário (evita
 * vazamento de seleção entre contas no mesmo navegador). Só guarda a
 * PREFERÊNCIA — useFazendaAtual() (src/hooks/useFazendaAtual.ts) é quem
 * decide o fallback (fazenda mais antiga) se a selecionada não existir mais
 * na lista de vínculos do usuário (ex.: removido de uma fazenda).
 */
export function FazendaSelecionadaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [fazendaIdSelecionada, setFazendaIdSelecionada] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setFazendaIdSelecionada(null)
      return
    }
    setFazendaIdSelecionada(localStorage.getItem(chaveStorage(user.id)))
  }, [user])

  function selecionarFazenda(fazendaId: string) {
    setFazendaIdSelecionada(fazendaId)
    if (user) localStorage.setItem(chaveStorage(user.id), fazendaId)
  }

  return (
    <FazendaSelecionadaContext.Provider
      value={{ fazendaIdSelecionada, selecionarFazenda }}
    >
      {children}
    </FazendaSelecionadaContext.Provider>
  )
}

export function useFazendaSelecionada() {
  const ctx = useContext(FazendaSelecionadaContext)
  if (!ctx) {
    throw new Error(
      "useFazendaSelecionada() precisa ser usado dentro de <FazendaSelecionadaProvider>"
    )
  }
  return ctx
}
