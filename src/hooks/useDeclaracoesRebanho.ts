import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { comprimirArquivoSeImagem } from "@/lib/comprimirImagem"
import type { DeclaracaoComEspecie } from "@/lib/types/declaracoes"
import type {
  DeclaracaoRebanhoFormValues,
  MarcarComoEnviadaFormValues,
} from "@/lib/validations/declaracoes"

const DECLARACOES_SELECT = "*, especies(nome)"

export type DeclaracoesFiltro = {
  especieId: string | null
  ano: number | null
}

export function useDeclaracoesLista(
  fazendaId: string | undefined,
  filtro: DeclaracoesFiltro
) {
  return useQuery({
    queryKey: ["declaracoes-rebanho", "list", fazendaId, filtro] as const,
    queryFn: async (): Promise<DeclaracaoComEspecie[]> => {
      let query = supabase
        .from("declaracoes_rebanho")
        .select(DECLARACOES_SELECT)
        .eq("fazenda_id", fazendaId as string)
        .order("ano_referencia", { ascending: false })

      if (filtro.especieId) query = query.eq("especie_id", filtro.especieId)
      if (filtro.ano) query = query.eq("ano_referencia", filtro.ano)

      const { data, error } = await query
      if (error) throw error
      return data as unknown as DeclaracaoComEspecie[]
    },
    enabled: !!fazendaId,
  })
}

export function useCriarDeclaracao(fazendaId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: DeclaracaoRebanhoFormValues) => {
      if (!fazendaId) throw new Error("Fazenda não identificada.")

      const { data, error } = await supabase
        .from("declaracoes_rebanho")
        .insert({
          fazenda_id: fazendaId,
          especie_id: values.especie_id,
          ano_referencia: values.ano_referencia,
          data_declaracao: values.data_declaracao,
          quantidade_declarada: values.quantidade_declarada,
        })
        .select("id")
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["declaracoes-rebanho"] })
    },
  })
}

/** Só quantidade/data de referência são editáveis — especie_id/ano_referencia
 * são imutáveis após a criação (ver validations/declaracoes.ts). */
export function useAtualizarDeclaracao(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: Pick<DeclaracaoRebanhoFormValues, "data_declaracao" | "quantidade_declarada">) => {
      const { error } = await supabase
        .from("declaracoes_rebanho")
        .update({
          data_declaracao: values.data_declaracao,
          quantidade_declarada: values.quantidade_declarada,
        })
        .eq("id", id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["declaracoes-rebanho"] })
    },
  })
}

/**
 * "Marcar como enviada" (spec seção 5.2) — grava data_envio e, se um arquivo
 * foi selecionado, comprime (se imagem) e sobe pro bucket
 * `declaracoes-rebanho` antes de marcar status='enviado'. Caminho
 * `{fazenda_id}/{declaracao_id}.{extensao}` — uma declaração tem no máximo
 * um arquivo (upsert:true permite substituir depois).
 */
export function useMarcarComoEnviada(id: string, fazendaId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      values,
      arquivo,
    }: {
      values: MarcarComoEnviadaFormValues
      arquivo: File | null
    }) => {
      if (!fazendaId) throw new Error("Fazenda não identificada.")

      let arquivo_pdf_path: string | undefined
      if (arquivo) {
        const arquivoFinal = await comprimirArquivoSeImagem(arquivo)
        const extensao = arquivoFinal.name.split(".").pop()?.toLowerCase() || "bin"
        const caminho = `${fazendaId}/${id}.${extensao}`

        const { error: uploadError } = await supabase.storage
          .from("declaracoes-rebanho")
          .upload(caminho, arquivoFinal, { upsert: true, contentType: arquivoFinal.type })
        if (uploadError) throw uploadError

        arquivo_pdf_path = caminho
      }

      const { error } = await supabase
        .from("declaracoes_rebanho")
        .update({
          status: "enviado",
          data_envio: values.data_envio,
          ...(arquivo_pdf_path ? { arquivo_pdf_path } : {}),
        })
        .eq("id", id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["declaracoes-rebanho"] })
    },
  })
}

export function useAbrirDocumentoDeclaracao() {
  return useMutation({
    mutationFn: async (caminho: string) => {
      const { data, error } = await supabase.storage
        .from("declaracoes-rebanho")
        .createSignedUrl(caminho, 60)
      if (error) throw error
      return data.signedUrl
    },
  })
}
