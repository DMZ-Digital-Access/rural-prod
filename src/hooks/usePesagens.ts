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

// ============================================================================
// "Dia de Pesagem" — sessões (2026-07-23, migration
// 20260723150000_sessoes_pesagem.sql). Uma sessão nasce sozinha no 1º peso
// registrado (useCriarOuObterSessaoPesagem), fica em aberto até "Final da
// pesagem" (useFinalizarSessaoPesagem), e só então vira uma linha no
// histórico (useHistoricoSessoesPesagem). Só UMA sessão em aberto por
// fazenda por vez — um segundo usuário tentando iniciar uma enquanto outro
// está pesando recebe o erro de criar_sessao_pesagem (mensagem já pronta
// pra exibir direto, ver DiaPesagemPage).
// ============================================================================

export type SessaoPesagemAtiva = {
  id: string
  usuario_id: string
  usuario_nome: string
  iniciada_em: string
}

const sessaoPesagemAtivaKey = (fazendaId: string | undefined) =>
  ["sessoes-pesagem", "ativa", fazendaId] as const

/**
 * Sessão de pesagem em aberto da fazenda (se houver) + nome de quem a
 * iniciou — via RPC `obter_sessao_pesagem_ativa` (SECURITY DEFINER: RLS de
 * `usuarios` não deixa ver o nome de outro colega diretamente, mesmo motivo
 * de `listar_membros_fazenda`, ADR-0002). Usado tanto pra retomar a própria
 * sessão ao reabrir a tela quanto pra saber se OUTRO usuário está com uma
 * sessão ativa agora (bloqueia a tela nesse caso, ver DiaPesagemPage).
 */
export function useSessaoPesagemAtiva(fazendaId: string | undefined) {
  return useQuery({
    queryKey: sessaoPesagemAtivaKey(fazendaId),
    queryFn: async (): Promise<SessaoPesagemAtiva | null> => {
      const { data, error } = await supabase.rpc("obter_sessao_pesagem_ativa", {
        p_fazenda_id: fazendaId as string,
      })

      if (error) throw error
      return (data as SessaoPesagemAtiva[])[0] ?? null
    },
    enabled: !!fazendaId,
  })
}

/**
 * Get-or-create da sessão ativa — via RPC `criar_sessao_pesagem`. Se o
 * chamador já tem uma sessão em aberto, reaproveita (permite sair/voltar no
 * mesmo dia sem perder o evento); se OUTRO usuário tem uma sessão em
 * aberto, a RPC recusa com uma mensagem pronta pra exibir
 * ("Existe uma pesagem sendo registrada..."). Advisory lock no banco fecha
 * a corrida de duas aberturas simultâneas — não é só uma checagem de UI.
 */
export function useCriarOuObterSessaoPesagem(fazendaId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<{ id: string }> => {
      const { data, error } = await supabase.rpc("criar_sessao_pesagem", {
        p_fazenda_id: fazendaId as string,
      })

      if (error) throw error
      return data as unknown as { id: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessaoPesagemAtivaKey(fazendaId) })
    },
  })
}

/**
 * Fecha a sessão ativa ("Final da pesagem") — UPDATE simples, permitido a
 * qualquer membro autorizado da fazenda (não só ao dono da sessão, RLS já
 * cobre isso — pragmático: dono não consegue voltar ao celular, outro
 * admin fecha o evento). A partir daqui a sessão só aparece no histórico.
 */
export function useFinalizarSessaoPesagem(fazendaId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (sessaoId: string) => {
      const { error } = await supabase
        .from("sessoes_pesagem")
        .update({ finalizada_em: new Date().toISOString() })
        .eq("id", sessaoId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessaoPesagemAtivaKey(fazendaId) })
      queryClient.invalidateQueries({ queryKey: ["sessoes-pesagem", "historico", fazendaId] })
    },
  })
}

export type PesagemDaSessao = {
  id: string
  peso_kg: number
  created_at: string
  animais: { identificacao: string }
}

const pesagensDaSessaoKey = (sessaoId: string | undefined | null) =>
  ["pesagens", "sessao", sessaoId] as const

/**
 * Pesagens de UMA sessão — serve tanto pra lista ao vivo da sessão ativa
 * quanto pro detalhe do histórico ao clicar numa linha já finalizada
 * (mesma forma de dado nos dois casos). Ordenado por `created_at desc` — o
 * animal recém-registrado aparece no topo.
 */
export function usePesagensDaSessao(sessaoId: string | undefined | null) {
  return useQuery({
    queryKey: pesagensDaSessaoKey(sessaoId),
    queryFn: async (): Promise<PesagemDaSessao[]> => {
      const { data, error } = await supabase
        .from("pesagens")
        .select("id, peso_kg, created_at, animais!inner(identificacao)")
        .eq("sessao_pesagem_id", sessaoId as string)
        .order("created_at", { ascending: false })

      if (error) throw error
      return data as unknown as PesagemDaSessao[]
    },
    enabled: !!sessaoId,
  })
}

export type SessaoPesagemHistorico = {
  id: string
  iniciada_em: string
  finalizada_em: string
  usuario_nome: string
  quantidade_animais: number
  peso_medio_kg: number | null
  peso_total_kg: number | null
  lote_nome: string | null
}

/**
 * Histórico de "Dia de Pesagem" (aba Histórico) — via RPC
 * `listar_sessoes_pesagem_finalizadas` (SECURITY DEFINER, mesmo motivo de
 * `useSessaoPesagemAtiva`: expõe usuario_nome entre colegas da fazenda).
 * lote_nome já vem calculado do backend (mesmo lote em todas as pesagens →
 * nome; nenhum lote → null; lotes diferentes → "Vários").
 */
export function useHistoricoSessoesPesagem(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ["sessoes-pesagem", "historico", fazendaId] as const,
    queryFn: async (): Promise<SessaoPesagemHistorico[]> => {
      const { data, error } = await supabase.rpc("listar_sessoes_pesagem_finalizadas", {
        p_fazenda_id: fazendaId as string,
      })

      if (error) throw error
      return data as unknown as SessaoPesagemHistorico[]
    },
    enabled: !!fazendaId,
  })
}

/**
 * Registro rápido de pesagem por `animal_id` já resolvido (Dia de Pesagem)
 * — mesma RPC `registrar_pesagem` de `useRegistrarPesagem`, só que aceita
 * qualquer `animal_id` por chamada (aquele hook fixa o id na instanciação,
 * pensado pra tela de detalhe de UM animal) e passa `sessao_pesagem_id`
 * (2026-07-23) pra vincular a pesagem à sessão ativa. Sempre
 * `p_data_evento = hoje` — esta tela é sempre "hoje"; pesar o mesmo animal
 * 2x vira correção do mesmo registro (comportamento já existente da RPC),
 * e se a correção acontecer numa sessão diferente da original, a pesagem
 * migra pra sessão ATUAL (decisão de JP, já implementada em
 * registrar_pesagem).
 */
export function useRegistrarPesagemRapida(fazendaId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: { animal_id: string; peso_kg: number; sessao_pesagem_id: string }) => {
      const { error } = await supabase.rpc("registrar_pesagem", {
        p_animal_id: values.animal_id,
        p_data_evento: hojeISO(),
        p_peso_kg: values.peso_kg,
        p_sessao_pesagem_id: values.sessao_pesagem_id,
      })

      if (error) throw error
    },
    onSuccess: (_data, values) => {
      queryClient.invalidateQueries({ queryKey: ["pesagens"] })
      queryClient.invalidateQueries({ queryKey: ["animais"] })
      queryClient.invalidateQueries({ queryKey: ["lotes"] })
      queryClient.invalidateQueries({
        queryKey: pesagensDaSessaoKey(values.sessao_pesagem_id),
      })
      queryClient.invalidateQueries({ queryKey: sessaoPesagemAtivaKey(fazendaId) })
    },
  })
}
