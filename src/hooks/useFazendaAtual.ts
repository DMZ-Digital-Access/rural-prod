import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"

export type FazendaVinculo = {
  fazenda_id: string
  papel: string
}

/**
 * Fazenda "atual" do usuário logado (Fase 2 — Eixo 1).
 *
 * Débito técnico conhecido: ADR-0002 já permite um usuário estar vinculado
 * a mais de uma fazenda (convites), mas não existe ainda um seletor de
 * fazenda na UI (fora do escopo desta tarefa — spec não pede). Por ora,
 * pega-se sempre o vínculo mais antigo (`order by created_at asc, limit 1`)
 * como "a" fazenda do usuário — determinístico, mas não é uma escolha de
 * produto validada para o caso multi-fazenda. Revisitar quando/se a Fase 6
 * (papel financeiro/convites) trouxer um usuário real vinculado a mais de
 * uma fazenda.
 */
export function useFazendaAtual() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ["fazenda-atual", user?.id],
    queryFn: async (): Promise<FazendaVinculo> => {
      const { data, error } = await supabase
        .from("usuarios_fazendas")
        .select("fazenda_id, papel")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      if (!data) {
        throw new Error("Usuário sem fazenda vinculada.")
      }
      return data
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  })
}
