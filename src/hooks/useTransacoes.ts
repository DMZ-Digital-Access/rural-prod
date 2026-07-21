import { useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import type { Transacao } from "@/lib/types/rebanho"
import type {
  EntradaSaidaLoteFormValues,
  SaidaAnimaisIndividuaisFormValues,
} from "@/lib/validations/transacoes"

/**
 * Lançamento agregado de Entradas/Saídas de Animais de Lote (ADR-0005) —
 * SEMPRE via RPC `registrar_entrada_saida_lote`, nunca INSERT direto em
 * `transacoes`/`transacoes_detalhe`: a RPC garante atomicidade entre a
 * transação e as linhas de detalhe (sexo, sem faixa etária) e valida a
 * soma machos+fêmeas contra o total antes do commit (ver ADR-0005 D5,
 * nota de implementação).
 */
export function useRegistrarEntradaSaidaLote(fazendaId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: EntradaSaidaLoteFormValues) => {
      if (!fazendaId) throw new Error("Fazenda não identificada.")

      const { data, error } = await supabase.rpc("registrar_entrada_saida_lote", {
        p_fazenda_id: fazendaId,
        p_tipo_operacao: values.tipo_operacao,
        p_especie_id: values.especie_id,
        p_outra_parte: values.outra_parte.trim(),
        p_data_operacao: values.data_operacao,
        p_quantidade_machos: values.quantidade_machos,
        p_quantidade_femeas: values.quantidade_femeas,
        p_valor_nota: values.valor_nota,
        p_peso_total_kg: values.peso_total_kg,
      })

      if (error) throw error
      return data as Transacao
    },
    onSuccess: () => {
      // Afeta o saldo de rebanho (obter_saldo_rebanho) e, para
      // venda/obito/consumo vinculados a animal individual (fora do escopo
      // desta tela — ela só lança agregado), o status em animais/lotes.
      queryClient.invalidateQueries({ queryKey: ["saldo-rebanho"] })
      queryClient.invalidateQueries({ queryKey: ["transacoes"] })
    },
  })
}

/**
 * Venda/Óbito/Consumo vinculados a animais JÁ EXISTENTES (ADR-0004/0005/
 * 0006) — SEMPRE via RPC `registrar_saida_animais_individuais`, nunca
 * INSERT direto: a RPC vincula cada animal em `transacoes_animais` (os
 * triggers já existentes atualizam `animais.status` automaticamente) e
 * calcula o agrupamento etário real de cada animal para `transacoes_
 * detalhe` — mais preciso que a entrada agregada (que não conhece
 * animais específicos).
 */
export function useRegistrarSaidaAnimaisIndividuais(fazendaId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: SaidaAnimaisIndividuaisFormValues) => {
      if (!fazendaId) throw new Error("Fazenda não identificada.")

      const { data, error } = await supabase.rpc(
        "registrar_saida_animais_individuais",
        {
          p_fazenda_id: fazendaId,
          p_tipo_operacao: values.tipo_operacao,
          p_especie_id: values.especie_id,
          p_outra_parte: values.outra_parte.trim(),
          p_data_operacao: values.data_operacao,
          p_animal_ids: values.animal_ids,
          p_valor_nota: values.valor_nota,
          p_peso_total_kg: values.peso_total_kg,
        }
      )

      if (error) throw error
      return data as Transacao
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saldo-rebanho"] })
      queryClient.invalidateQueries({ queryKey: ["transacoes"] })
      // Os animais vinculados mudaram de status (venda/morte/baixa) — a
      // listagem/detalhe de Animais e as estatísticas de Lotes precisam
      // refletir isso.
      queryClient.invalidateQueries({ queryKey: ["animais"] })
      queryClient.invalidateQueries({ queryKey: ["lotes"] })
    },
  })
}
