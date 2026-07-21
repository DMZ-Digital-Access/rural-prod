import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import type {
  GtaResumo,
  SaldoRebanhoLinha,
  SexoAnimal,
  Transacao,
  TransacaoComDetalhes,
  TipoOperacaoTransacao,
} from "@/lib/types/rebanho"
import type {
  AtualizarTransacaoFormValues,
  EntradaSaidaLoteFormValues,
  SaidaAnimaisIndividuaisFormValues,
} from "@/lib/validations/transacoes"

const TRANSACOES_SELECT = "*, especies(nome)"

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

export type TransacoesFiltro = {
  ano: number
  especieId: string | null
  tipoOperacao: TipoOperacaoTransacao | null
  outraParte: string
}

const PAGE_SIZE = 20

/**
 * Listagem paginada/filtrada de transacoes (Fase 4, item 15 — spec seção
 * 5.2 "Módulo: Entradas e Saídas") via `especies`/`gtas` embutidos
 * (PostgREST). Para `financeiro`, o embed de `gtas` resolve como `null`
 * silenciosamente (RLS de `gtas` nega SELECT por completo a esse papel) —
 * não é erro, é a fronteira de acesso da spec seção 5.4 em ação.
 */
export function useTransacoesLista(
  fazendaId: string | undefined,
  filtro: TransacoesFiltro,
  pagina: number
) {
  return useQuery({
    queryKey: ["transacoes", "list", fazendaId, filtro, pagina] as const,
    queryFn: async (): Promise<{ dados: TransacaoComDetalhes[]; total: number }> => {
      const inicio = pagina * PAGE_SIZE
      const fim = inicio + PAGE_SIZE - 1

      let query = supabase
        .from("transacoes")
        .select(TRANSACOES_SELECT, { count: "exact" })
        .eq("fazenda_id", fazendaId as string)
        .gte("data_operacao", `${filtro.ano}-01-01`)
        .lte("data_operacao", `${filtro.ano}-12-31`)
        .order("data_operacao", { ascending: false })
        .range(inicio, fim)

      if (filtro.especieId) query = query.eq("especie_id", filtro.especieId)
      if (filtro.tipoOperacao) query = query.eq("tipo_operacao", filtro.tipoOperacao)
      if (filtro.outraParte.trim()) {
        query = query.ilike("outra_parte", `%${filtro.outraParte.trim()}%`)
      }

      const { data, error, count } = await query
      if (error) throw error
      return { dados: data as unknown as TransacaoComDetalhes[], total: count ?? 0 }
    },
    enabled: !!fazendaId,
    placeholderData: (dadosAnteriores) => dadosAnteriores,
  })
}

export type TransacaoDetalheLinha = {
  id: string
  sexo: SexoAnimal
  quantidade: number
  agrupamento_etario_id: string | null
  agrupamentos_etarios: { label: string } | null
}

/**
 * Quebra de sexo/faixa etária de uma transação (spec: "idade de animais"
 * na tela de detalhe) — `agrupamento_etario_id` pode ser null (ADR-0005 D5,
 * lançamento agregado sem faixa etária), tratado como "Não classificado" na
 * UI, não aqui no hook.
 */
export function useTransacaoDetalhe(transacaoId: string | undefined) {
  return useQuery({
    queryKey: ["transacoes", "detalhe", transacaoId] as const,
    queryFn: async (): Promise<TransacaoDetalheLinha[]> => {
      const { data, error } = await supabase
        .from("transacoes_detalhe")
        .select("id, sexo, quantidade, agrupamento_etario_id, agrupamentos_etarios(label)")
        .eq("transacao_id", transacaoId as string)
        .order("sexo", { ascending: true })

      if (error) throw error
      return data as unknown as TransacaoDetalheLinha[]
    },
    enabled: !!transacaoId,
  })
}

/**
 * GTAs vinculadas a uma transação — MUITOS-PARA-UM (uma transação pode ter
 * várias GTAs, uma por caminhão de transporte; correção de 2026-07-21 sobre
 * o desenho 1:1 original, ver migration
 * 20260721050000_corrige_cardinalidade_transacao_gta.sql). Consulta direto
 * em `gtas` por `transacao_id`, não mais um embed em `transacoes`.
 */
export function useGtasDaTransacao(transacaoId: string | undefined) {
  return useQuery({
    queryKey: ["gtas", "da-transacao", transacaoId] as const,
    queryFn: async (): Promise<GtaResumo[]> => {
      const { data, error } = await supabase
        .from("gtas")
        .select("id, numero_gta, status_liberacao")
        .eq("transacao_id", transacaoId as string)
        .order("numero_gta", { ascending: true })

      if (error) throw error
      return data
    },
    enabled: !!transacaoId,
  })
}

export function useTransacao(id: string | undefined) {
  return useQuery({
    queryKey: ["transacoes", "detail", id] as const,
    queryFn: async (): Promise<TransacaoComDetalhes> => {
      const { data, error } = await supabase
        .from("transacoes")
        .select(TRANSACOES_SELECT)
        .eq("id", id as string)
        .single()

      if (error) throw error
      return data as unknown as TransacaoComDetalhes
    },
    enabled: !!id,
  })
}

/**
 * Completa dados/documentação de uma transação já lançada — numero_nota,
 * valor_nota, peso_total_kg, status_gta_transacao e observacoes. Nenhum
 * desses campos é obrigatório na criação (ver EntradaAgregadaForm/
 * SaidaAnimaisIndividuaisForm) — o produtor volta aqui conforme os
 * documentos forem chegando.
 */
export function useAtualizarTransacao(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: AtualizarTransacaoFormValues) => {
      const { error } = await supabase
        .from("transacoes")
        .update({
          outra_parte: values.outra_parte.trim(),
          data_operacao: values.data_operacao,
          especie_id: values.especie_id,
          quantidade_animais: values.quantidade_animais,
          numero_nota: values.numero_nota.trim() || null,
          valor_nota: values.valor_nota,
          peso_total_kg: values.peso_total_kg,
          status_gta_transacao: values.status_gta_transacao,
          observacoes: values.observacoes.trim() || null,
        })
        .eq("id", id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saldo-rebanho"] })
      queryClient.invalidateQueries({ queryKey: ["transacoes"] })
    },
  })
}

export type TipoDocumentoTransacao = "nota" | "contranota"

/**
 * Upload de Nota/Contranota para o bucket `transacoes-documentos` (item 14)
 * — caminho `{fazenda_id}/{transacao_id}/{tipo}.{extensao}`, `upsert: true`
 * (substitui o documento anterior do mesmo tipo, se houver — a policy de
 * UPDATE do bucket já cobre esse caso). Depois do upload, grava o caminho e
 * o mime type nas colunas correspondentes de `transacoes`.
 */
export function useUploadDocumentoTransacao(
  fazendaId: string | undefined,
  transacaoId: string
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      tipo,
      arquivo,
    }: {
      tipo: TipoDocumentoTransacao
      arquivo: File
    }) => {
      if (!fazendaId) throw new Error("Fazenda não identificada.")

      const extensao = arquivo.name.split(".").pop()?.toLowerCase() || "bin"
      const caminho = `${fazendaId}/${transacaoId}/${tipo}.${extensao}`

      const { error: uploadError } = await supabase.storage
        .from("transacoes-documentos")
        .upload(caminho, arquivo, { upsert: true, contentType: arquivo.type })
      if (uploadError) throw uploadError

      const colunaPath = tipo === "nota" ? "arquivo_nota_path" : "arquivo_contranota_path"
      const colunaMime =
        tipo === "nota" ? "arquivo_nota_mime_type" : "arquivo_contranota_mime_type"

      const { error: updateError } = await supabase
        .from("transacoes")
        .update({ [colunaPath]: caminho, [colunaMime]: arquivo.type })
        .eq("id", transacaoId)
      if (updateError) throw updateError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transacoes"] })
    },
  })
}

/** URL assinada temporária para visualizar um documento já enviado. */
export function useAbrirDocumentoTransacao() {
  return useMutation({
    mutationFn: async (caminho: string) => {
      const { data, error } = await supabase.storage
        .from("transacoes-documentos")
        .createSignedUrl(caminho, 60)
      if (error) throw error
      return data.signedUrl
    },
  })
}

export type ResumoSaldoEspecie = {
  especieNome: string
  saldoInicio: number
  saldoFim: number
  pendente: number
}

/**
 * Resumo de saldo início/fim de ano por espécie (spec seção 5.2, cabeçalho
 * do Módulo de Transações) — reaproveita `obter_saldo_rebanho()` (item 12)
 * em duas datas de corte: 31/12 do ano anterior (início) e 31/12 do ano
 * selecionado, ou hoje se o ano selecionado for o corrente (fim). Soma
 * `qtd_registrada` de todos os agrupamentos/sexo de cada espécie — a RPC já
 * devolve linhas de todas as fazendas vinculadas ao usuário (não recebe
 * fazenda_id), então filtra pelo `fazendaId` desta tela, mesmo padrão de
 * `useFazendaAtual` (um usuário só opera "a" fazenda atual por vez, débito
 * técnico já documentado).
 */
export function useResumoSaldoAno(fazendaId: string | undefined, ano: number) {
  return useQuery({
    queryKey: ["saldo-rebanho", "resumo-ano", fazendaId, ano] as const,
    queryFn: async (): Promise<ResumoSaldoEspecie[]> => {
      const hojeISO = new Date().toISOString().slice(0, 10)
      const anoAtual = new Date().getFullYear()
      const dataInicio = `${ano - 1}-12-31`
      const dataFim = ano >= anoAtual ? hojeISO : `${ano}-12-31`

      const [inicioResp, fimResp] = await Promise.all([
        supabase.rpc("obter_saldo_rebanho", { p_data_referencia: dataInicio }),
        supabase.rpc("obter_saldo_rebanho", { p_data_referencia: dataFim }),
      ])
      if (inicioResp.error) throw inicioResp.error
      if (fimResp.error) throw fimResp.error

      const porEspecie = new Map<string, ResumoSaldoEspecie>()

      function linha(especieNome: string) {
        const atual = porEspecie.get(especieNome) ?? {
          especieNome,
          saldoInicio: 0,
          saldoFim: 0,
          pendente: 0,
        }
        porEspecie.set(especieNome, atual)
        return atual
      }

      for (const l of (inicioResp.data ?? []) as SaldoRebanhoLinha[]) {
        if (l.fazenda_id !== fazendaId) continue
        linha(l.especie_nome).saldoInicio += l.qtd_registrada
      }

      for (const l of (fimResp.data ?? []) as SaldoRebanhoLinha[]) {
        if (l.fazenda_id !== fazendaId) continue
        const atual = linha(l.especie_nome)
        atual.saldoFim += l.qtd_registrada
        atual.pendente += l.qtd_pendente
      }

      return Array.from(porEspecie.values()).sort((a, b) =>
        a.especieNome.localeCompare(b.especieNome, "pt-BR")
      )
    },
    enabled: !!fazendaId,
  })
}
