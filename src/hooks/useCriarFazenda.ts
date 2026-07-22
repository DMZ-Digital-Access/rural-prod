import { useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"
import { useFazendaSelecionada } from "@/lib/fazendaSelecionada"

/**
 * Cria uma fazenda ADICIONAL (RPC criar_fazenda, migration 20260722160000) —
 * só quem já é admin em pelo menos uma fazenda existente consegue (RPC
 * valida; qualquer outro erro do Postgres é exibido via toast pela tela).
 * Invalida a lista de fazendas do usuário e auto-seleciona a nova.
 */
export function useCriarFazenda() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { selecionarFazenda } = useFazendaSelecionada()

  return useMutation({
    mutationFn: async (nome: string): Promise<string> => {
      const { data, error } = await supabase.rpc("criar_fazenda", { p_nome: nome })
      if (error) throw error
      return data as string
    },
    onSuccess: async (novaFazendaId) => {
      await queryClient.invalidateQueries({ queryKey: ["fazendas-do-usuario", user?.id] })
      selecionarFazenda(novaFazendaId)
    },
  })
}
