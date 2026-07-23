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

const hojeISO = () => new Date().toISOString().slice(0, 10)

const pesagensDeHojeKey = (fazendaId: string | undefined) =>
  ["pesagens", "hoje", fazendaId] as const

export type PesagemDeHoje = {
  id: string
  peso_kg: number
  created_at: string
  animais: { identificacao: string }
}

/**
 * Pesagens de HOJE da fazenda (Dia de Pesagem, 2026-07-23) — stats (nº de
 * animais/peso médio/peso total) e a lista da parte inferior da tela são
 * derivados deste mesmo array no componente, sem view/RPC nova. Ordenado
 * por `created_at desc` — o animal recém-registrado aparece no topo,
 * feedback imediato de quem acabou de ser pesado.
 */
export function usePesagensDeHoje(fazendaId: string | undefined) {
  return useQuery({
    queryKey: pesagensDeHojeKey(fazendaId),
    queryFn: async (): Promise<PesagemDeHoje[]> => {
      const { data, error } = await supabase
        .from("pesagens")
        .select("id, peso_kg, created_at, animais!inner(identificacao)")
        .eq("data_evento", hojeISO())
        .eq("animais.fazenda_id", fazendaId as string)
        .order("created_at", { ascending: false })

      if (error) throw error
      return data as unknown as PesagemDeHoje[]
    },
    enabled: !!fazendaId,
  })
}

/**
 * Registro rápido de pesagem por `animal_id` já resolvido (Dia de Pesagem)
 * — mesma RPC `registrar_pesagem` de `useRegistrarPesagem`, só que aceita
 * qualquer `animal_id` por chamada (aquele hook fixa o id na instanciação,
 * pensado pra tela de detalhe de UM animal). Sempre `p_data_evento = hoje`
 * — esta tela é sempre "hoje"; pesar o mesmo animal 2x no mesmo dia vira
 * correção do mesmo registro (comportamento já existente da RPC), não
 * duplica.
 */
export function useRegistrarPesagemRapida(fazendaId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: { animal_id: string; peso_kg: number }) => {
      const { error } = await supabase.rpc("registrar_pesagem", {
        p_animal_id: values.animal_id,
        p_data_evento: hojeISO(),
        p_peso_kg: values.peso_kg,
      })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pesagens"] })
      queryClient.invalidateQueries({ queryKey: ["animais"] })
      queryClient.invalidateQueries({ queryKey: ["lotes"] })
      queryClient.invalidateQueries({ queryKey: pesagensDeHojeKey(fazendaId) })
    },
  })
}
