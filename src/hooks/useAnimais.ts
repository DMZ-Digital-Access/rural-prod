import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import type { AnimalComDetalhes, TipoOperacaoTransacao } from "@/lib/types/rebanho"
import type { EditarAnimalFormValues } from "@/lib/validations/animais"

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

export type AnimalBusca = { id: string; identificacao: string }

/**
 * Busca de animal por trecho da identificação (Dia de Pesagem, 2026-07-23) —
 * `ilike` com `%termo%` (substring em qualquer posição, não só prefixo — "385"
 * ou "R38" encontram "AR385", pedido explícito de JP), restrita a
 * `status = 'ativo'` (não faz sentido pesar animal já vendido/morto/baixado).
 * Só habilitada com termo não vazio — sem isso listaria a fazenda inteira a
 * cada tecla apagada. `especieIds` (2026-07-24, Dia de Vacinação) filtra
 * ainda mais por tipo de animal, quando informado — a tela de vacinação
 * escolhe os tipos de animal ANTES de buscar por identificação, pra não
 * misturar animais de espécies não selecionadas na sugestão.
 */
export function useBuscarAnimaisPorIdentificacao(
  fazendaId: string | undefined,
  termo: string,
  especieIds?: string[]
) {
  const termoLimpo = termo.trim()

  return useQuery({
    queryKey: [
      "animais",
      "busca-identificacao",
      fazendaId,
      termoLimpo,
      especieIds ?? null,
    ] as const,
    queryFn: async (): Promise<AnimalBusca[]> => {
      let query = supabase
        .from("animais")
        .select("id, identificacao")
        .eq("fazenda_id", fazendaId as string)
        .eq("status", "ativo")
        .ilike("identificacao", `%${termoLimpo}%`)
        .order("identificacao", { ascending: true })
        .limit(8)

      if (especieIds && especieIds.length > 0) {
        query = query.in("especie_id", especieIds)
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
    enabled: !!fazendaId && termoLimpo.length > 0,
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
          // 2026-07-23: correção manual pontual — normalmente vem da
          // transação de origem (registrar_entrada_saida_lote), editável
          // aqui pros 3 animais legados sem origem rastreada ou caso a
          // espécie da transação de origem esteja errada.
          especie_id: values.especie_id,
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

/**
 * Muda o lote de UM animal (tela de detalhe do lote, 2026-07-22) —
 * `loteId = null` retira o animal do lote ("Sem lote"), qualquer outro id
 * move pra outro lote existente. Mutação estreita (só lote_id) — diferente
 * de useAtualizarAnimal, que exige o payload inteiro do formulário de
 * edição. RLS (animais_update_vinculada) + o trigger
 * validar_lote_mesma_fazenda já cobrem toda a validação de segurança
 * necessária (papel <> financeiro, lote da mesma fazenda) — nenhuma
 * migration nova precisou ser escrita pra isso.
 */
export function useAtualizarLoteDoAnimal(animalId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (loteId: string | null) => {
      const { error } = await supabase
        .from("animais")
        .update({ lote_id: loteId })
        .eq("id", animalId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["animais"] })
      queryClient.invalidateQueries({ queryKey: ["lotes"] })
    },
  })
}

export type PeriodoLoteAnimal = {
  id: string
  lote_id: string | null
  /** Denormalizado no momento do período — sobrevive à exclusão do lote
   * (lote_id vira NULL via ON DELETE SET NULL, lote_nome não). */
  lote_nome: string | null
  data_inicio: string
  data_fim: string | null
}

/**
 * Histórico de lote do animal (Rastreabilidade do animal, 2026-07-23) — via
 * `animais_historico_lote` (migration 20260723210000), alimentada só por
 * trigger a partir dessa migration: animais já existentes não têm histórico
 * anterior a ela. Ordenado por data_inicio asc (ordem cronológica da
 * timeline).
 */
export function useHistoricoLoteAnimal(animalId: string | undefined) {
  return useQuery({
    queryKey: ["animais", "historico-lote", animalId] as const,
    queryFn: async (): Promise<PeriodoLoteAnimal[]> => {
      const { data, error } = await supabase
        .from("animais_historico_lote")
        .select("id, lote_id, lote_nome, data_inicio, data_fim")
        .eq("animal_id", animalId as string)
        .order("data_inicio", { ascending: true })

      if (error) throw error
      return data
    },
    enabled: !!animalId,
  })
}

export type SaidaAnimal = {
  tipo_operacao: TipoOperacaoTransacao
  data_operacao: string
  outra_parte: string
  transacao_id: string
}

/**
 * Saída do animal (venda/óbito/consumo), se houver — via `transacoes_animais`
 * (só populada por essas 3 operações + compra/entrada/saída de pastoreio,
 * ver ADR-0004/0005) embutindo `transacoes`. Um animal só sai uma vez (status
 * deixa de ser 'ativo'), então no máximo uma linha.
 */
export function useSaidaAnimal(animalId: string | undefined) {
  return useQuery({
    queryKey: ["animais", "saida", animalId] as const,
    queryFn: async (): Promise<SaidaAnimal | null> => {
      const { data, error } = await supabase
        .from("transacoes_animais")
        .select("transacao_id, transacoes(tipo_operacao, data_operacao, outra_parte)")
        .eq("animal_id", animalId as string)
        .in("tipo_operacao_transacao", ["venda", "obito", "consumo"])
        .limit(1)
        .maybeSingle()

      if (error) throw error
      if (!data) return null

      const transacao = data.transacoes as unknown as {
        tipo_operacao: TipoOperacaoTransacao
        data_operacao: string
        outra_parte: string
      }

      return {
        tipo_operacao: transacao.tipo_operacao,
        data_operacao: transacao.data_operacao,
        outra_parte: transacao.outra_parte,
        transacao_id: data.transacao_id,
      }
    },
    enabled: !!animalId,
  })
}

/**
 * Inclui vários animais de uma vez num lote (tela de detalhe do lote,
 * 2026-07-22, "Incluir animais") — um único UPDATE com `.in(...)` em vez de
 * N chamadas separadas. Mesma cobertura de RLS/trigger de
 * useAtualizarLoteDoAnimal.
 */
export function useAdicionarAnimaisAoLote(loteId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (animalIds: string[]) => {
      if (!loteId) throw new Error("Lote não identificado.")
      if (animalIds.length === 0) throw new Error("Selecione ao menos um animal.")

      const { error } = await supabase
        .from("animais")
        .update({ lote_id: loteId })
        .in("id", animalIds)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["animais"] })
      queryClient.invalidateQueries({ queryKey: ["lotes"] })
    },
  })
}
