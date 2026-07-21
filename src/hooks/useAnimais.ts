import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import type { AnimalComDetalhes } from "@/lib/types/rebanho"
import type {
  CriarAnimalFormValues,
  EditarAnimalFormValues,
} from "@/lib/validations/animais"

const animaisListKey = (fazendaId: string | undefined, loteId?: string | null) =>
  ["animais", "list", fazendaId, loteId ?? null] as const
const animalDetailKey = (id: string | undefined) => ["animais", "detail", id] as const

/**
 * Listagem de animais da fazenda (spec seção 5.1), via
 * `animais_com_detalhes` (nunca `animais` direto — a view já traz
 * idade/categoria/ganho/nº pesagens calculados). `loteId` filtra por lote
 * quando informado (usado na tela de detalhe do lote e no dashboard).
 */
export function useAnimais(fazendaId: string | undefined, loteId?: string | null) {
  return useQuery({
    queryKey: animaisListKey(fazendaId, loteId),
    queryFn: async (): Promise<AnimalComDetalhes[]> => {
      let query = supabase
        .from("animais_com_detalhes")
        .select("*")
        .eq("fazenda_id", fazendaId as string)
        .order("identificacao", { ascending: true })

      if (loteId) {
        query = query.eq("lote_id", loteId)
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
    enabled: !!fazendaId,
  })
}

export function useAnimal(id: string | undefined) {
  return useQuery({
    queryKey: animalDetailKey(id),
    queryFn: async (): Promise<AnimalComDetalhes> => {
      const { data, error } = await supabase
        .from("animais_com_detalhes")
        .select("*")
        .eq("id", id as string)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}

export function useCriarAnimal(fazendaId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: CriarAnimalFormValues) => {
      if (!fazendaId) throw new Error("Fazenda não identificada.")

      // peso_atual_kg/gmd_medio_kg/ultima_pesagem_data NUNCA são enviados —
      // são calculados pelo backend (inicializar_peso_atual_animal(), ver
      // migration da Fase 2), que sobrescreve incondicionalmente qualquer
      // valor enviado de qualquer forma.
      const { data, error } = await supabase
        .from("animais")
        .insert({
          fazenda_id: fazendaId,
          identificacao: values.identificacao.trim(),
          data_nascimento: values.data_nascimento,
          sexo: values.sexo,
          peso_inicial_kg: values.peso_inicial_kg,
          lote_id: values.lote_id,
        })
        .select("id")
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["animais"] })
      queryClient.invalidateQueries({ queryKey: ["lotes"] })
    },
  })
}

export function useAtualizarAnimal(animalId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: EditarAnimalFormValues) => {
      const { error } = await supabase
        .from("animais")
        .update({
          identificacao: values.identificacao.trim(),
          lote_id: values.lote_id,
          status: values.status,
          // ADR-0006: completa data_nascimento/peso_inicial_kg de um animal
          // pendente de individualização — ou permanecem null se ainda não
          // informados (a edição não força completude).
          data_nascimento: values.data_nascimento || null,
          peso_inicial_kg: values.peso_inicial_kg,
        })
        .eq("id", animalId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["animais"] })
      queryClient.invalidateQueries({ queryKey: ["lotes"] })
    },
  })
}
