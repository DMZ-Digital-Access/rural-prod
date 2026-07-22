import { useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"

/**
 * Atualiza fazendas.nome — só papel admin/membro (trigger
 * restringir_alteracao_nome_fazenda, migration 20260722150000); financeiro
 * recebe erro do Postgres, exibido via toast pela tela.
 */
export function useAtualizarNomeFazenda(fazendaId: string | undefined) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (nome: string) => {
      if (!fazendaId) throw new Error("Fazenda não identificada.")

      const { error } = await supabase.from("fazendas").update({ nome }).eq("id", fazendaId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fazendas-do-usuario", user?.id] })
    },
  })
}
