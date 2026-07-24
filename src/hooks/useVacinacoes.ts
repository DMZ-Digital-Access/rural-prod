import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"

export type VacinacaoAnimal = {
  id: string
  tipo_vacina: string
  enfermidade_tratada: string | null
  observacoes: string | null
  data_aplicacao: string
  usuario_nome: string
  created_at: string
}

/**
 * Histórico de vacinas/medicamentos do animal (Controle Sanitário, página
 * de detalhe do animal) — via RPC `listar_vacinacoes_animal` (SECURITY
 * DEFINER, migration 20260724100000: expõe o nome de quem registrou entre
 * colegas da fazenda, mesmo motivo de `useSessaoPesagemAtiva`).
 */
export function useVacinasDoAnimal(animalId: string | undefined) {
  return useQuery({
    queryKey: ["vacinacoes", "animal", animalId] as const,
    queryFn: async (): Promise<VacinacaoAnimal[]> => {
      const { data, error } = await supabase.rpc("listar_vacinacoes_animal", {
        p_animal_id: animalId as string,
      })

      if (error) throw error
      return data as unknown as VacinacaoAnimal[]
    },
    enabled: !!animalId,
  })
}

/**
 * Registra N vacinas/medicamentos de uma vez pro mesmo animal (Dia de
 * Vacinação) — via RPC `registrar_vacinacao`, mesmo padrão de
 * `useRegistrarPesagemRapida`: SECURITY DEFINER (vacinacoes não tem policy
 * de INSERT pra authenticated), autorização checada no corpo da função.
 */
export function useRegistrarVacinacao() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      animal_id: string
      tipos_vacina: string[]
      enfermidades: (string | null)[]
      observacoes: string | null
    }) => {
      const { data, error } = await supabase.rpc("registrar_vacinacao", {
        p_animal_id: params.animal_id,
        p_tipos_vacina: params.tipos_vacina,
        p_enfermidades: params.enfermidades,
        p_observacoes: params.observacoes,
      })

      if (error) throw error
      return data as string[]
    },
    onSuccess: (_data, params) => {
      queryClient.invalidateQueries({
        queryKey: ["vacinacoes", "animal", params.animal_id],
      })
    },
  })
}
