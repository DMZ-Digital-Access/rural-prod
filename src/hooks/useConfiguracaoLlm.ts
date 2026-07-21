import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import type { LlmProvider } from "@/lib/llmCatalog"

export type ConfiguracaoLlm = {
  llm_provider: LlmProvider
  llm_model: string
}

export function useConfiguracaoLlm(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ["fazenda", "configuracao-llm", fazendaId] as const,
    queryFn: async (): Promise<ConfiguracaoLlm> => {
      const { data, error } = await supabase
        .from("fazendas")
        .select("llm_provider, llm_model")
        .eq("id", fazendaId as string)
        .single()

      if (error) throw error
      return data as ConfiguracaoLlm
    },
    enabled: !!fazendaId,
  })
}

/**
 * Só o papel admin consegue de fato gravar (trigger
 * `restringir_alteracao_config_llm`, migration
 * 20260721080000_fazendas_config_llm.sql) — membro/financeiro recebem erro
 * do Postgres, exibido via toast pela tela.
 */
export function useAtualizarConfiguracaoLlm(fazendaId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: ConfiguracaoLlm) => {
      if (!fazendaId) throw new Error("Fazenda não identificada.")

      const { error } = await supabase
        .from("fazendas")
        .update({ llm_provider: values.llm_provider, llm_model: values.llm_model })
        .eq("id", fazendaId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fazenda", "configuracao-llm"] })
    },
  })
}
