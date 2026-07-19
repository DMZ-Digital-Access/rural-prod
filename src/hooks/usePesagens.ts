import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import type { Pesagem } from "@/lib/types/rebanho"
import type { PesagemFormValues } from "@/lib/validations/pesagens"

const pesagensListKey = (animalId: string | undefined) =>
  ["pesagens", animalId] as const

export function usePesagens(animalId: string | undefined) {
  return useQuery({
    queryKey: pesagensListKey(animalId),
    queryFn: async (): Promise<Pesagem[]> => {
      const { data, error } = await supabase
        .from("pesagens")
        .select("*")
        .eq("animal_id", animalId as string)
        .order("data_evento", { ascending: false })
        .order("created_at", { ascending: false })

      if (error) throw error
      return data
    },
    enabled: !!animalId,
  })
}

/**
 * Registro de pesagem — SEMPRE via RPC `registrar_pesagem` (migration da
 * Fase 2, seção 5.2). Não existe policy de INSERT/UPDATE declarativa em
 * `pesagens`; um `.from('pesagens').insert(...)` direto falharia por RLS. O
 * backend decide sozinho se isto é uma correção do registro mais recente
 * (<= 2 dias de diferença) ou um novo registro histórico — o frontend só
 * informa data+peso e mostra o resultado.
 */
export function useRegistrarPesagem(animalId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: PesagemFormValues) => {
      const { data, error } = await supabase.rpc("registrar_pesagem", {
        p_animal_id: animalId,
        p_data_evento: values.data_evento,
        p_peso_kg: values.peso_kg,
      })

      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pesagensListKey(animalId) })
      // peso_atual_kg/gmd_medio_kg/ultima_pesagem_data do animal são
      // recalculados pelo trigger no backend — invalida o detalhe do animal
      // e as listagens (a listagem de animais e as estatísticas do lote
      // mudam junto, ver lotes_com_estatisticas na migration da Fase 2).
      queryClient.invalidateQueries({ queryKey: ["animais"] })
      queryClient.invalidateQueries({ queryKey: ["lotes"] })
    },
  })
}
