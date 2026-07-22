import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"

export type ConfiguracaoExtracaoLancamentos = {
  prompt_extracao: string
  schema_json: unknown
}

const QUERY_KEY = ["configuracao-extracao-lancamentos"] as const

/**
 * Config GLOBAL (sem fazenda_id, singleton — configuracao_extracao_
 * lancamentos, migration 20260722130000) do prompt/schema usados por
 * classificar-documento. SELECT liberado a todo authenticated (RLS) — todo
 * usuário lê a mesma linha, independente de fazenda/papel.
 */
export function useConfiguracaoExtracaoLancamentos() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<ConfiguracaoExtracaoLancamentos> => {
      const { data, error } = await supabase
        .from("configuracao_extracao_lancamentos")
        .select("prompt_extracao, schema_json")
        .single()

      if (error) throw error
      return data as ConfiguracaoExtracaoLancamentos
    },
  })
}

/**
 * Só admin do software consegue de fato gravar (RLS
 * configuracao_extracao_lancamentos_update_admin_software) — qualquer outro
 * usuário recebe erro do Postgres, exibido via toast pela tela.
 */
export function useAtualizarConfiguracaoExtracaoLancamentos() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: ConfiguracaoExtracaoLancamentos) => {
      const { error } = await supabase
        .from("configuracao_extracao_lancamentos")
        .update({ prompt_extracao: values.prompt_extracao, schema_json: values.schema_json })
        .eq("id", true)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}
