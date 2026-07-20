import { useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import type { Transacao } from "@/lib/types/rebanho"
import type { EntradaSaidaLoteFormValues } from "@/lib/validations/transacoes"

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
