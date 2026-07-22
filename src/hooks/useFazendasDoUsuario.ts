import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"

export type FazendaDoUsuario = {
  fazenda_id: string
  papel: string
  nome: string
}

/**
 * Lista TODAS as fazendas vinculadas ao usuário logado (multi-fazenda,
 * 2026-07-22) — RLS de usuarios_fazendas restringe a linhas do PRÓPRIO
 * usuário (usuarios_fazendas_select_own), não a uma única fazenda, então
 * isso já retorna todos os vínculos sem precisar de policy nova. Ordenado
 * por created_at asc — mesmo critério de desempate já usado em
 * useFazendaAtual() pra escolher a fazenda "padrão".
 */
export function useFazendasDoUsuario() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ["fazendas-do-usuario", user?.id] as const,
    queryFn: async (): Promise<FazendaDoUsuario[]> => {
      const { data, error } = await supabase
        .from("usuarios_fazendas")
        .select("fazenda_id, papel, fazendas(nome)")
        .order("created_at", { ascending: true })

      if (error) throw error
      return (data ?? []).map((row) => ({
        fazenda_id: row.fazenda_id,
        papel: row.papel,
        nome: (row.fazendas as unknown as { nome: string } | null)?.nome ?? "",
      }))
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  })
}
