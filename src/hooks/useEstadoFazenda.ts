import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import type { PrazoDeclaracao, PrazoDeclaracaoEstado } from "@/lib/types/declaracoes"

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

/**
 * Lista de prazos já cadastrados formalmente pro estado (item 20, spec
 * seção 5.3, "Configurações > Prazos de Declaração Anual por estado") —
 * SELECT aberto a qualquer authenticated (dado regulatório global, sem
 * fronteira de fazenda — ver decisão 2 da migration
 * 20260720150000_fase3_financeiro_declaracoes_prazos.sql).
 */
export function usePrazosDoEstado(estado: string | null | undefined) {
  return useQuery({
    queryKey: ["prazos-declaracao-estado", estado] as const,
    queryFn: async (): Promise<PrazoDeclaracaoEstado[]> => {
      const { data, error } = await supabase
        .from("prazos_declaracao_estado")
        .select("*")
        .eq("estado", estado as string)
        .order("ano_referencia", { ascending: false })

      if (error) throw error
      return data
    },
    enabled: !!estado,
  })
}

/**
 * Cadastra/corrige o prazo de um estado/ano — único caminho de escrita de
 * `prazos_declaracao_estado`, via a função SECURITY DEFINER
 * `definir_prazo_declaracao_estado()` (já existente desde a Fase 3; a
 * tabela não tem nenhuma policy de INSERT/UPDATE direta). Faz upsert por
 * (estado, ano_referencia) — mesma chamada serve pra cadastrar um ano novo
 * ou corrigir um já cadastrado.
 */
export function useDefinirPrazoDeclaracao() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      estado: string
      ano_referencia: number
      data_inicio_prazo: string
      data_fim_prazo: string
    }) => {
      const { data, error } = await supabase.rpc("definir_prazo_declaracao_estado", {
        p_estado: params.estado,
        p_ano_referencia: params.ano_referencia,
        p_data_inicio_prazo: params.data_inicio_prazo,
        p_data_fim_prazo: params.data_fim_prazo,
      })

      if (error) throw error
      return data as PrazoDeclaracaoEstado
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prazos-declaracao-estado"] })
      queryClient.invalidateQueries({ queryKey: ["prazo-declaracao"] })
    },
  })
}
