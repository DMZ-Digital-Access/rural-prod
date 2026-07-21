import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import type { LancamentoComDetalhes, TipoLancamento } from "@/lib/types/financeiro"
import type { LancamentoFinanceiroFormValues } from "@/lib/validations/financeiro"

const LANCAMENTOS_SELECT = "*, transacoes(outra_parte, tipo_operacao)"
const PAGE_SIZE = 20

export type LancamentosFiltro = {
  tipo: TipoLancamento | null
  categoria: string
  pago: boolean | null
  dataInicio: string
  dataFim: string
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
        })
        .eq("id", id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lancamentos-financeiros"] })
    },
  })
}
