import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"

export type UsuarioAtual = {
  nome: string | null
  email: string | null
}

/**
 * Dados do PRÓPRIO usuário logado (public.usuarios, espelho de auth.users) —
 * `nome` é editável pelo client (usuarios_update_own), `email` é só leitura
 * (espelho de auth.users.email, bloqueado por
 * prevent_usuarios_identity_change, Fase 1).
 */
export function useUsuarioAtual() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ["usuario-atual", user?.id] as const,
    queryFn: async (): Promise<UsuarioAtual> => {
      const { data, error } = await supabase
        .from("usuarios")
        .select("nome, email")
        .eq("id", user!.id)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!user,
  })
}

export function useAtualizarNomeUsuario() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (nome: string) => {
      if (!user) throw new Error("Usuário não identificado.")

      const { error } = await supabase.from("usuarios").update({ nome }).eq("id", user.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usuario-atual", user?.id] })
    },
  })
}
