import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import type { PrazoDeclaracao } from "@/lib/types/declaracoes"

/**
 * `fazendas.estado` (UF) — usada só pra calcular o prazo regulatório de
 * Declaração Anual (obter_prazo_declaracao_estado, spec seção 4.2). Sem
 * fluxo de "complete seu cadastro" no produto ainda — a maioria das
 * fazendas existentes está com essa coluna NULL (migration
 * 20260720150000, sem backfill). Editável pela mesma policy de `nome`
 * (fazendas_update_vinculada) — qualquer papel vinculado tecnicamente
 * grava, mas a tela só mostra o editor pra quem não é `financeiro`.
 */
export function useEstadoFazenda(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ["fazenda", "estado", fazendaId] as const,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("fazendas")
        .select("estado")
        .eq("id", fazendaId as string)
        .single()

      if (error) throw error
      return data.estado
    },
    enabled: !!fazendaId,
  })
}

export function useAtualizarEstadoFazenda(fazendaId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (estado: string) => {
      if (!fazendaId) throw new Error("Fazenda não identificada.")
      const { error } = await supabase.from("fazendas").update({ estado }).eq("id", fazendaId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fazenda", "estado"] })
    },
  })
}

/**
 * `obter_prazo_declaracao_estado()` (spec seção 4.2) — leitura com fallback
 * (padrão RS 01/04-30/06 quando não há registro cadastrado). Só habilitada
 * quando o estado da fazenda está preenchido — sem estado, não há UF pra
 * consultar.
 */
export function usePrazoDeclaracao(estado: string | null | undefined, ano: number) {
  return useQuery({
    queryKey: ["prazo-declaracao", estado, ano] as const,
    queryFn: async (): Promise<PrazoDeclaracao> => {
      const { data, error } = await supabase
        .rpc("obter_prazo_declaracao_estado", { p_estado: estado as string, p_ano_referencia: ano })
        .single()

      if (error) throw error
      return data as PrazoDeclaracao
    },
    enabled: !!estado,
  })
}
