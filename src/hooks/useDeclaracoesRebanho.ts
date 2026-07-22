import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { comprimirArquivoSeImagem } from "@/lib/comprimirImagem"
import type { DeclaracaoComItens } from "@/lib/types/declaracoes"
import type {
  DeclaracaoRebanhoFormValues,
  MarcarComoEnviadaFormValues,
} from "@/lib/validations/declaracoes"

const DECLARACOES_SELECT = "*, declaracoes_rebanho_itens(*, especies(nome))"

export type DeclaracoesFiltro = {
  ano: number | null
}

export function useDeclaracoesLista(
  fazendaId: string | undefined,
  filtro: DeclaracoesFiltro
) {
  return useQuery({
    queryKey: ["declaracoes-rebanho", "list", fazendaId, filtro] as const,
    queryFn: async (): Promise<DeclaracaoComItens[]> => {
      let query = supabase
        .from("declaracoes_rebanho")
        .select(DECLARACOES_SELECT)
        .eq("fazenda_id", fazendaId as string)
        .order("ano_referencia", { ascending: false })

      if (filtro.ano) query = query.eq("ano_referencia", filtro.ano)

      const { data, error } = await query
      if (error) throw error
      return data as unknown as DeclaracaoComItens[]
    },
    enabled: !!fazendaId,
  })
}

/**
 * Cria a declaração (pai) + seus itens de espécie/quantidade (filhos) numa
 * única chamada RPC atômica (`criar_declaracao_rebanho`) — evita o risco de
 * criar o pai e falhar nos itens em chamadas separadas, deixando uma
 * declaração vazia pra trás.
 */
export function useCriarDeclaracao(fazendaId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: DeclaracaoRebanhoFormValues) => {
      if (!fazendaId) throw new Error("Fazenda não identificada.")

      const { data, error } = await supabase.rpc("criar_declaracao_rebanho", {
        p_fazenda_id: fazendaId,
        p_ano_referencia: values.ano_referencia,
        p_data_declaracao: values.data_declaracao,
        p_itens: values.itens,
      })

      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["declaracoes-rebanho"] })
    },
  })
}

/**
 * Corrige uma declaração já cadastrada — `ano_referencia` é imutável (ver
 * validations/declaracoes.ts). Atualiza `data_declaracao` no pai e
 * reconcilia a lista de itens: `upsert` cobre espécies novas/quantidade
 * alterada (via unique(declaracao_id, especie_id)), e um `delete` separado
 * remove as espécies que saíram da lista. Não é atômico entre si (2-3
 * chamadas sequenciais), mas uma edição parcial é recuperável reabrindo o
 * formulário — diferente da criação, que precisa ser tudo ou nada.
 */
export function useAtualizarDeclaracao(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: DeclaracaoRebanhoFormValues) => {
      const { error: erroPai } = await supabase
        .from("declaracoes_rebanho")
        .update({ data_declaracao: values.data_declaracao })
        .eq("id", id)
      if (erroPai) throw erroPai

      const { error: erroUpsert } = await supabase
        .from("declaracoes_rebanho_itens")
        .upsert(
          values.itens.map((item) => ({
            declaracao_id: id,
            especie_id: item.especie_id,
            quantidade_declarada: item.quantidade_declarada,
          })),
          { onConflict: "declaracao_id,especie_id" }
        )
      if (erroUpsert) throw erroUpsert

      const especiesAtuais = values.itens.map((i) => i.especie_id)
      const { error: erroDelete } = await supabase
        .from("declaracoes_rebanho_itens")
        .delete()
        .eq("declaracao_id", id)
        .not("especie_id", "in", `(${especiesAtuais.join(",")})`)
      if (erroDelete) throw erroDelete
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
