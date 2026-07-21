import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import type { SaldoRebanhoLinha } from "@/lib/types/rebanho"

/**
 * Saldo de rebanho na data de corte informada (spec seção 5.2, "Módulo:
 * Saldo de Rebanho" — item 16), via `obter_saldo_rebanho()` (item 12/
 * ADR-0005). A RPC devolve linhas de TODAS as fazendas vinculadas ao
 * usuário (não recebe fazenda_id) — filtra por `fazendaId` aqui, mesmo
 * padrão de `useResumoSaldoAno`.
 */
export function useSaldoRebanho(fazendaId: string | undefined, dataReferencia: string) {
  return useQuery({
    queryKey: ["saldo-rebanho", "data-corte", fazendaId, dataReferencia] as const,
    queryFn: async (): Promise<SaldoRebanhoLinha[]> => {
      const { data, error } = await supabase.rpc("obter_saldo_rebanho", {
        p_data_referencia: dataReferencia,
      })
      if (error) throw error
      return (data ?? []).filter(
        (linha: SaldoRebanhoLinha) => linha.fazenda_id === fazendaId
      )
    },
    enabled: !!fazendaId,
  })
}
