import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import type { LoteComEstatisticas } from "@/lib/types/rebanho"
import type { LoteFormValues } from "@/lib/validations/lotes"

const lotesListKey = (fazendaId: string | undefined) =>
  ["lotes", "list", fazendaId] as const
const loteDetailKey = (id: string | undefined) => ["lotes", "detail", id] as const

/** Listagem de lotes da fazenda, já com estatísticas (spec seção 5.1). */
export function useLotes(fazendaId: string | undefined) {
  return useQuery({
    queryKey: lotesListKey(fazendaId),
    queryFn: async (): Promise<LoteComEstatisticas[]> => {
      const { data, error } = await supabase
        .from("lotes_com_estatisticas")
        .select("*")
        .eq("fazenda_id", fazendaId as string)
        .order("nome", { ascending: true })

      if (error) throw error
      return data
    },
    enabled: !!fazendaId,
  })
}

export function useLote(id: string | undefined) {
  return useQuery({
    queryKey: loteDetailKey(id),
    queryFn: async (): Promise<LoteComEstatisticas> => {
      const { data, error } = await supabase
        .from("lotes_com_estatisticas")
        .select("*")
        .eq("id", id as string)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}

function normalizarPayloadLote(values: LoteFormValues) {
  return {
    nome: values.nome.trim(),
    descricao: values.descricao?.trim() || null,
    data_inicio: values.data_inicio,
    data_fim: values.data_fim || null,
  }
}

export function useCriarLote(fazendaId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: LoteFormValues) => {
      if (!fazendaId) throw new Error("Fazenda não identificada.")

      const { data, error } = await supabase
        .from("lotes")
        .insert({ fazenda_id: fazendaId, ...normalizarPayloadLote(values) })
        .select("id")
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lotes"] })
    },
  })
}

export function useAtualizarLote(loteId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: LoteFormValues) => {
      const { error } = await supabase
        .from("lotes")
        .update(normalizarPayloadLote(values))
        .eq("id", loteId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lotes"] })
    },
  })
}

/**
 * Arquivar/reativar um lote (spec seção 5.1: "Arquivar" lote). Sempre
 * `UPDATE ativo=<valor>`.
 */
export function useDefinirLoteAtivo(loteId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ativo: boolean) => {
      const { error } = await supabase.from("lotes").update({ ativo }).eq("id", loteId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lotes"] })
    },
  })
}

/**
 * Exclusão física de um lote ("Encerrar Lote" → "Excluir", com dupla
 * confirmação na UI). `animais.lote_id` usa `on delete set null` — animais
 * associados nunca são apagados, só desvinculados ("Sem lote").
 */
export function useExcluirLote(loteId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("lotes").delete().eq("id", loteId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lotes"] })
      queryClient.invalidateQueries({ queryKey: ["animais"] })
    },
  })
}
