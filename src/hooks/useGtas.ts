import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import type { Gta, GtaComDetalhes, StatusLiberacaoGta } from "@/lib/types/rebanho"
import type { GtaFormValues } from "@/lib/validations/gtas"

// `transacoes!gtas_transacao_id_fkey(...)` desambigua o embed pelo mesmo
// motivo documentado em useTransacoes.ts: referência circular deliberada
// entre gtas e transacoes (gtas.transacao_id <-> transacoes.gta_id) — sem o
// hint de constraint, o PostgREST responde 300 Multiple Choices em vez dos
// dados (achado real do Módulo de Transações, mesma causa, lado oposto).
const GTAS_SELECT =
  "*, especies(nome), transacoes!gtas_transacao_id_fkey(outra_parte, tipo_operacao)"

const PAGE_SIZE = 20

export type GtasFiltro = {
  status: StatusLiberacaoGta | null
  especieId: string | null
  dataInicio: string
  dataFim: string
}

export function useGtasLista(
  fazendaId: string | undefined,
  filtro: GtasFiltro,
  pagina: number
) {
  return useQuery({
    queryKey: ["gtas", "list", fazendaId, filtro, pagina] as const,
    queryFn: async (): Promise<{ dados: GtaComDetalhes[]; total: number }> => {
      const inicio = pagina * PAGE_SIZE
      const fim = inicio + PAGE_SIZE - 1

      let query = supabase
        .from("gtas")
        .select(GTAS_SELECT, { count: "exact" })
        .eq("fazenda_id", fazendaId as string)
        .order("created_at", { ascending: false })
        .range(inicio, fim)

      if (filtro.status) query = query.eq("status_liberacao", filtro.status)
      if (filtro.especieId) query = query.eq("especie_id", filtro.especieId)
      if (filtro.dataInicio) query = query.gte("data_liberacao", filtro.dataInicio)
      if (filtro.dataFim) query = query.lte("data_liberacao", filtro.dataFim)

      const { data, error, count } = await query
      if (error) throw error
      return { dados: data as unknown as GtaComDetalhes[], total: count ?? 0 }
    },
    enabled: !!fazendaId,
    placeholderData: (dadosAnteriores) => dadosAnteriores,
  })
}

export function useGta(id: string | undefined) {
  return useQuery({
    queryKey: ["gtas", "detail", id] as const,
    queryFn: async (): Promise<GtaComDetalhes> => {
      const { data, error } = await supabase
        .from("gtas")
        .select(GTAS_SELECT)
        .eq("id", id as string)
        .single()

      if (error) throw error
      return data as unknown as GtaComDetalhes
    },
    enabled: !!id,
  })
}

/** Transações recentes para o vínculo opcional GTA<->transação (spec: "vínculo opcional a uma transação"). */
export function useTransacoesParaVincular(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ["transacoes", "para-vincular", fazendaId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transacoes")
        .select("id, outra_parte, data_operacao, tipo_operacao")
        .eq("fazenda_id", fazendaId as string)
        .order("data_operacao", { ascending: false })
        .limit(100)

      if (error) throw error
      return data
    },
    enabled: !!fazendaId,
  })
}

export function useCriarGta(fazendaId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: GtaFormValues) => {
      if (!fazendaId) throw new Error("Fazenda não identificada.")

      const { data, error } = await supabase
        .from("gtas")
        .insert({
          fazenda_id: fazendaId,
          numero_gta: values.numero_gta.trim(),
          municipio_origem: values.municipio_origem.trim(),
          origem: values.origem.trim(),
          municipio_destino: values.municipio_destino.trim(),
          destino: values.destino.trim(),
          especie_id: values.especie_id,
          quantidade_animais: values.quantidade_animais,
          status_liberacao: values.status_liberacao,
          data_liberacao: values.data_liberacao,
          transacao_id: values.transacao_id,
        })
        .select("id")
        .single()

      if (error) throw error
      return data as Pick<Gta, "id">
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gtas"] })
      queryClient.invalidateQueries({ queryKey: ["saldo-rebanho"] })
    },
  })
}

export function useAtualizarGta(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: GtaFormValues) => {
      const { error } = await supabase
        .from("gtas")
        .update({
          numero_gta: values.numero_gta.trim(),
          municipio_origem: values.municipio_origem.trim(),
          origem: values.origem.trim(),
          municipio_destino: values.municipio_destino.trim(),
          destino: values.destino.trim(),
          especie_id: values.especie_id,
          quantidade_animais: values.quantidade_animais,
          status_liberacao: values.status_liberacao,
          data_liberacao: values.data_liberacao,
          transacao_id: values.transacao_id,
        })
        .eq("id", id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gtas"] })
      queryClient.invalidateQueries({ queryKey: ["saldo-rebanho"] })
    },
  })
}

/**
 * Upload do documento original da GTA (item 14, bucket `gtas-documentos`) —
 * caminho `{fazenda_id}/{gta_id}/documento.{extensao}`, `upsert: true`
 * (substitui o anterior, se houver).
 */
export function useUploadDocumentoGta(fazendaId: string | undefined, gtaId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (arquivo: File) => {
      if (!fazendaId) throw new Error("Fazenda não identificada.")

      const extensao = arquivo.name.split(".").pop()?.toLowerCase() || "bin"
      const caminho = `${fazendaId}/${gtaId}/documento.${extensao}`

      const { error: uploadError } = await supabase.storage
        .from("gtas-documentos")
        .upload(caminho, arquivo, { upsert: true, contentType: arquivo.type })
      if (uploadError) throw uploadError

      const { error: updateError } = await supabase
        .from("gtas")
        .update({ arquivo_path: caminho, arquivo_mime_type: arquivo.type })
        .eq("id", gtaId)
      if (updateError) throw updateError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gtas"] })
    },
  })
}

/** URL assinada temporária para o botão "Ver GTA". */
export function useAbrirDocumentoGta() {
  return useMutation({
    mutationFn: async (caminho: string) => {
      const { data, error } = await supabase.storage
        .from("gtas-documentos")
        .createSignedUrl(caminho, 60)
      if (error) throw error
      return data.signedUrl
    },
  })
}
