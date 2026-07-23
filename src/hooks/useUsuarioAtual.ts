import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"

export type UsuarioAtual = {
  nome: string | null
  email: string | null
  telefone_celular: string | null
}

/**
 * Dados do PRÓPRIO usuário logado (public.usuarios, espelho de auth.users) —
 * `nome`/`telefone_celular` são editáveis pelo client (usuarios_update_own).
 * `email` é só leitura NESTA tabela (espelho de auth.users.email) — a
 * mudança de verdade passa por `useAtualizarMeuEmail` (Supabase Auth,
 * 2026-07-23), nunca por um UPDATE direto aqui (bloqueado por
 * prevent_usuarios_identity_change, Fase 1, com a única exceção sendo a
 * sincronização automática pós-confirmação, ver migration
 * 20260723160000).
 */
export function useUsuarioAtual() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ["usuario-atual", user?.id] as const,
    queryFn: async (): Promise<UsuarioAtual> => {
      const { data, error } = await supabase
        .from("usuarios")
        .select("nome, email, telefone_celular")
        .eq("id", user!.id)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!user,
  })
}

/** Nome + telefone celular (2026-07-23) — email fica de fora, ver useAtualizarMeuEmail. */
export function useAtualizarMeusDados() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (values: { nome: string; telefone_celular: string | null }) => {
      if (!user) throw new Error("Usuário não identificado.")

      const { error } = await supabase
        .from("usuarios")
        .update({ nome: values.nome, telefone_celular: values.telefone_celular })
        .eq("id", user.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usuario-atual", user?.id] })
    },
  })
}

/**
 * Troca de e-mail de verdade (2026-07-23) — via `supabase.auth.updateUser`,
 * o fluxo de confirmação NATIVO do Supabase Auth (envia um e-mail de
 * confirmação pro endereço NOVO; o e-mail atual continua ativo até
 * confirmar). `public.usuarios.email` só é atualizado DEPOIS que a
 * confirmação completa de verdade, via trigger em `auth.users` (migration
 * 20260723160000) — esta mutation não escreve em `usuarios` diretamente.
 */
export function useAtualizarMeuEmail() {
  return useMutation({
    mutationFn: async (novoEmail: string) => {
      const { error } = await supabase.auth.updateUser({ email: novoEmail })
      if (error) throw error
    },
  })
}
