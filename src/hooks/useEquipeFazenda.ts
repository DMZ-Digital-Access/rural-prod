import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"

export type MembroFazenda = {
  usuario_id: string
  nome: string | null
  email: string | null
  papel: string
}

export type ConviteFazenda = {
  id: string
  convidado_email: string
  papel_oferecido: string
  expires_at: string
  created_at: string
}

function invalidarEquipe(queryClient: ReturnType<typeof useQueryClient>, fazendaId: string | undefined) {
  queryClient.invalidateQueries({ queryKey: ["membros-fazenda", fazendaId] })
  queryClient.invalidateQueries({ queryKey: ["convites-fazenda", fazendaId] })
}

/** Lista membros da fazenda (RPC listar_membros_fazenda, admin-only). */
export function useMembrosFazenda(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ["membros-fazenda", fazendaId] as const,
    queryFn: async (): Promise<MembroFazenda[]> => {
      const { data, error } = await supabase.rpc("listar_membros_fazenda", {
        p_fazenda_id: fazendaId as string,
      })
      if (error) throw error
      return data as MembroFazenda[]
    },
    enabled: !!fazendaId,
  })
}

/** Convites pendentes da fazenda (RLS convites_select_admin já escopa a admin). */
export function useConvitesFazenda(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ["convites-fazenda", fazendaId] as const,
    queryFn: async (): Promise<ConviteFazenda[]> => {
      const { data, error } = await supabase
        .from("convites")
        .select("id, convidado_email, papel_oferecido, expires_at, created_at")
        .eq("fazenda_id", fazendaId as string)
        .eq("status", "pendente")
        .order("created_at", { ascending: false })

      if (error) throw error
      return data as ConviteFazenda[]
    },
    enabled: !!fazendaId,
  })
}

/**
 * Convida um novo membro — 3 chamadas, não 2 (achado real desta tarefa):
 * `criar_convite()` retorna `token` (coluna `convites.token`), mas a Edge
 * Function `enviar-convite` exige `convite_id` (coluna `convites.id`) no
 * corpo — são colunas DIFERENTES da mesma linha. Por isso, entre criar o
 * convite e disparar o e-mail, é preciso uma leitura extra pra resolver o
 * `id` a partir do `token` recebido (RLS `convites_select_admin` já libera
 * essa leitura pra quem acabou de criar o convite, por ser admin).
 */
export function useConvidarMembro(fazendaId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ email, papel }: { email: string; papel: string }) => {
      if (!fazendaId) throw new Error("Fazenda não identificada.")

      const { data: token, error: erroCriar } = await supabase.rpc("criar_convite", {
        p_fazenda_id: fazendaId,
        p_email: email,
        p_papel: papel,
      })
      if (erroCriar) throw erroCriar

      const { data: convite, error: erroBusca } = await supabase
        .from("convites")
        .select("id")
        .eq("token", token as string)
        .single()
      if (erroBusca) throw erroBusca

      const { error: erroEnvio } = await supabase.functions.invoke("enviar-convite", {
        body: { convite_id: convite.id },
      })
      if (erroEnvio) throw erroEnvio
    },
    onSuccess: () => invalidarEquipe(queryClient, fazendaId),
  })
}

/** Promove/rebaixa o papel de um membro já vinculado (RPC promover_papel, admin-only). */
export function usePromoverPapel(fazendaId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ usuarioId, novoPapel }: { usuarioId: string; novoPapel: string }) => {
      if (!fazendaId) throw new Error("Fazenda não identificada.")

      const { error } = await supabase.rpc("promover_papel", {
        p_fazenda_id: fazendaId,
        p_usuario_id: usuarioId,
        p_novo_papel: novoPapel,
      })
      if (error) throw error
    },
    onSuccess: () => invalidarEquipe(queryClient, fazendaId),
  })
}

/** Remove um membro (ou o próprio chamador, "sair da fazenda") — RPC remover_membro. */
export function useRemoverMembro(fazendaId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (usuarioId: string) => {
      if (!fazendaId) throw new Error("Fazenda não identificada.")

      const { error } = await supabase.rpc("remover_membro", {
        p_fazenda_id: fazendaId,
        p_usuario_id: usuarioId,
      })
      if (error) throw error
    },
    onSuccess: () => invalidarEquipe(queryClient, fazendaId),
  })
}

/** Cancela um convite pendente (RPC cancelar_convite, admin-only). */
export function useCancelarConvite(fazendaId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (conviteId: string) => {
      const { error } = await supabase.rpc("cancelar_convite", { p_convite_id: conviteId })
      if (error) throw error
    },
    onSuccess: () => invalidarEquipe(queryClient, fazendaId),
  })
}
