import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import type { LancamentoComDetalhes, TipoLancamento } from "@/lib/types/financeiro"
import type { LancamentoFinanceiroFormValues } from "@/lib/validations/financeiro"

const LANCAMENTOS_SELECT = "*, transacoes(outra_parte, tipo_operacao)"
const PAGE_SIZE = 20

const hojeISO = () => new Date().toISOString().slice(0, 10)

export type LancamentosFiltro = {
  tipo: TipoLancamento | null
  categoria: string
  pago: boolean | null
  dataInicio: string
  dataFim: string
  // Fluxo de captura de documento por IA (2026-07-21) — filtra só os
  // rascunhos ainda não confirmados quando `false`; `null` mostra todos.
  validado: boolean | null
}

export function useLancamentosLista(
  fazendaId: string | undefined,
  filtro: LancamentosFiltro,
  pagina: number
) {
  return useQuery({
    queryKey: ["lancamentos-financeiros", "list", fazendaId, filtro, pagina] as const,
    queryFn: async (): Promise<{ dados: LancamentoComDetalhes[]; total: number }> => {
      const inicio = pagina * PAGE_SIZE
      const fim = inicio + PAGE_SIZE - 1

      let query = supabase
        .from("lancamentos_financeiros")
        .select(LANCAMENTOS_SELECT, { count: "exact" })
        .eq("fazenda_id", fazendaId as string)
        .order("data_lancamento", { ascending: false })
        .range(inicio, fim)

      if (filtro.tipo) query = query.eq("tipo", filtro.tipo)
      if (filtro.categoria.trim()) {
        query = query.ilike("categoria", `%${filtro.categoria.trim()}%`)
      }
      if (filtro.pago !== null) query = query.eq("pago", filtro.pago)
      if (filtro.validado !== null) query = query.eq("validado_pelo_usuario", filtro.validado)
      if (filtro.dataInicio) query = query.gte("data_lancamento", filtro.dataInicio)
      if (filtro.dataFim) query = query.lte("data_lancamento", filtro.dataFim)

      const { data, error, count } = await query
      if (error) throw error
      return { dados: data as unknown as LancamentoComDetalhes[], total: count ?? 0 }
    },
    enabled: !!fazendaId,
    placeholderData: (dadosAnteriores) => dadosAnteriores,
  })
}

/**
 * Busca TODOS os lançamentos que casam com o filtro, ignorando paginação —
 * usado só pelo botão "Exportar CSV" (Lançamentos Gerais, 2026-07-22, mesmo
 * pedido/padrão já usado em Fluxo de Caixa: exporta tudo que bate com o
 * filtro ativo, não só a página visível). Função simples (não é hook) —
 * chamada sob demanda no clique do botão, não mantida como query viva.
 */
export async function buscarTodosLancamentosParaExport(
  fazendaId: string,
  filtro: LancamentosFiltro
): Promise<LancamentoComDetalhes[]> {
  let query = supabase
    .from("lancamentos_financeiros")
    .select(LANCAMENTOS_SELECT)
    .eq("fazenda_id", fazendaId)
    .order("data_lancamento", { ascending: false })

  if (filtro.tipo) query = query.eq("tipo", filtro.tipo)
  if (filtro.categoria.trim()) {
    query = query.ilike("categoria", `%${filtro.categoria.trim()}%`)
  }
  if (filtro.pago !== null) query = query.eq("pago", filtro.pago)
  if (filtro.validado !== null) query = query.eq("validado_pelo_usuario", filtro.validado)
  if (filtro.dataInicio) query = query.gte("data_lancamento", filtro.dataInicio)
  if (filtro.dataFim) query = query.lte("data_lancamento", filtro.dataFim)

  const { data, error } = await query
  if (error) throw error
  return data as unknown as LancamentoComDetalhes[]
}

export function useLancamento(id: string | undefined) {
  return useQuery({
    queryKey: ["lancamentos-financeiros", "detail", id] as const,
    queryFn: async (): Promise<LancamentoComDetalhes> => {
      const { data, error } = await supabase
        .from("lancamentos_financeiros")
        .select(LANCAMENTOS_SELECT)
        .eq("id", id as string)
        .single()

      if (error) throw error
      return data as unknown as LancamentoComDetalhes
    },
    enabled: !!id,
  })
}

export function useCriarLancamento(fazendaId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: LancamentoFinanceiroFormValues) => {
      if (!fazendaId) throw new Error("Fazenda não identificada.")

      const { data, error } = await supabase
        .from("lancamentos_financeiros")
        .insert({
          fazenda_id: fazendaId,
          tipo: values.tipo,
          categoria: values.categoria.trim(),
          descricao: values.descricao.trim(),
          data_lancamento: values.data_lancamento,
          valor: values.valor,
          numero_nota: values.numero_nota.trim() || null,
          contraparte: values.contraparte.trim() || null,
          transacao_animal_id: values.transacao_animal_id,
          pago: values.pago,
          data_pagamento: values.pago ? values.data_pagamento : null,
          validado_pelo_usuario: true,
        })
        .select("id")
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lancamentos-financeiros"] })
    },
  })
}

export function useAtualizarLancamento(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: LancamentoFinanceiroFormValues) => {
      const { error } = await supabase
        .from("lancamentos_financeiros")
        .update({
          tipo: values.tipo,
          categoria: values.categoria.trim(),
          descricao: values.descricao.trim(),
          data_lancamento: values.data_lancamento,
          valor: values.valor,
          numero_nota: values.numero_nota.trim() || null,
          contraparte: values.contraparte.trim() || null,
          transacao_animal_id: values.transacao_animal_id,
          pago: values.pago,
          data_pagamento: values.pago ? values.data_pagamento : null,
          // Salvar o formulário É a confirmação — validado ou não antes,
          // qualquer submit explícito marca como validado (pedido de JP,
          // 2026-07-21, ver migration 20260721120000).
          validado_pelo_usuario: true,
        })
        .eq("id", id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lancamentos-financeiros"] })
    },
  })
}

/**
 * Cria um rascunho de lançamento imediatamente após a captura de um
 * documento (2026-07-21) — antes mesmo da IA classificar — pra garantir que
 * o documento já enviado ao bucket sempre tenha uma linha real pra apontar,
 * mesmo que o usuário abandone a tela antes de confirmar. Campos-placeholder
 * (categoria/descrição sinalizando "processando", valor mínimo válido pro
 * CHECK `valor > 0`) — substituídos pelos campos extraídos pela IA logo em
 * seguida, ou preenchidos manualmente pelo usuário se a extração falhar.
 */
export function useCriarLancamentoRascunho(fazendaId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<{ id: string }> => {
      if (!fazendaId) throw new Error("Fazenda não identificada.")

      const { data, error } = await supabase
        .from("lancamentos_financeiros")
        .insert({
          fazenda_id: fazendaId,
          tipo: "despesa",
          categoria: "(processando documento)",
          descricao: "Aguardando leitura automática do documento enviado.",
          data_lancamento: hojeISO(),
          valor: 0.01,
          pago: false,
          validado_pelo_usuario: false,
        })
        .select("id")
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lancamentos-financeiros"] })
    },
  })
}

/**
 * Aplica os campos extraídos pela IA num rascunho já criado
 * (`useCriarLancamentoRascunho`) — mantém `validado_pelo_usuario = false`
 * (só o submit explícito do formulário valida, ver `useAtualizarLancamento`).
 */
export function useAplicarCamposExtraidos() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      campos,
    }: {
      id: string
      campos: Partial<{
        tipo: TipoLancamento
        categoria: string
        descricao: string
        data_lancamento: string
        valor: number
        numero_nota: string
        contraparte: string
      }>
    }) => {
      const { error } = await supabase
        .from("lancamentos_financeiros")
        .update(campos)
        .eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lancamentos-financeiros"] })
    },
  })
}

export function useExcluirLancamento(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("lancamentos_financeiros").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lancamentos-financeiros"] })
    },
  })
}
