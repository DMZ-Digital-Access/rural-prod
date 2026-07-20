import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import type { Especie } from "@/lib/types/rebanho"

/**
 * Catálogo global de espécies (Fase 3, sem fazenda_id — qualquer usuário
 * autenticado lê, incluindo papel financeiro). Filtra ativo=true aqui na
 * aplicação (a RLS da tabela não filtra por ativo — ver migration da
 * Fase 3, item 10).
 */
export function useEspecies() {
  return useQuery({
    queryKey: ["especies"] as const,
    queryFn: async (): Promise<Especie[]> => {
      const { data, error } = await supabase
        .from("especies")
        .select("*")
        .eq("ativo", true)
        .order("nome", { ascending: true })

      if (error) throw error
      return data
    },
  })
}
