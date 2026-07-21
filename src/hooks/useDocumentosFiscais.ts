import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { uploadDocumentoLancamento } from "@/lib/uploadDocumentoLancamento"
import type { LancamentoComDetalhes } from "@/lib/types/financeiro"

const LANCAMENTOS_SELECT = "*, transacoes(outra_parte, tipo_operacao)"

/**
 * Upload do documento fiscal (nota/boleto/recibo) de um lançamento —
 * bucket `lancamentos-documentos` (pedido de JP, 2026-07-21). Caminho
 * `{fazenda_id}/{AAAA-MM do data_lancamento}/{lancamento_id}.{extensao}` —
 * "mês da nota", não mês do upload. Imagem é comprimida antes do envio
 * (`comprimirArquivoSeImagem`); PDF sobe sem alteração.
 */
export function useUploadDocumentoLancamento(
  fazendaId: string | undefined,
  lancamentoId: string,
  dataLancamento: string
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (arquivoOriginal: File) => {
      if (!fazendaId) throw new Error("Fazenda não identificada.")
      await uploadDocumentoLancamento(fazendaId, lancamentoId, dataLancamento, arquivoOriginal)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lancamentos-financeiros"] })
    },
  })
}

export function useAbrirDocumentoLancamento() {
  return useMutation({
    mutationFn: async (caminho: string) => {
      const { data, error } = await supabase.storage
        .from("lancamentos-documentos")
        .createSignedUrl(caminho, 60)
      if (error) throw error
      return data.signedUrl
    },
  })
}

export type DocumentosFiscaisFiltro = {
  ano: number | null
  mes: number | null // 1-12
}

/**
 * Listagem para a tela "Documentos Fiscais" (financeiro/contábil + admin) —
 * mostra TODOS os lançamentos do período (com ou sem documento anexado),
 * para servir também de checklist do que ainda falta anexar.
 */
export function useDocumentosFiscaisLista(
  fazendaId: string | undefined,
  filtro: DocumentosFiscaisFiltro
) {
  return useQuery({
    queryKey: ["lancamentos-financeiros", "documentos-fiscais", fazendaId, filtro] as const,
    queryFn: async (): Promise<LancamentoComDetalhes[]> => {
      let query = supabase
        .from("lancamentos_financeiros")
        .select(LANCAMENTOS_SELECT)
        .eq("fazenda_id", fazendaId as string)
        .order("data_lancamento", { ascending: false })

      if (filtro.ano) {
        const mesInicio = filtro.mes ? String(filtro.mes).padStart(2, "0") : "01"
        const mesFim = filtro.mes ? String(filtro.mes).padStart(2, "0") : "12"
        const ultimoDia = new Date(filtro.ano, filtro.mes ?? 12, 0).getDate()
        query = query
          .gte("data_lancamento", `${filtro.ano}-${mesInicio}-01`)
          .lte("data_lancamento", `${filtro.ano}-${mesFim}-${String(ultimoDia).padStart(2, "0")}`)
      }

      const { data, error } = await query
      if (error) throw error
      return data as unknown as LancamentoComDetalhes[]
    },
    enabled: !!fazendaId,
  })
}
