import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import type { SaldoRebanhoLinha } from "@/lib/types/rebanho"

export const MESES_LABEL = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]

export type EvolucaoSaldoAno = {
  /** Um ponto por DATA REAL em que uma transação mudou o saldo (pedido de
   * JP, 2026-07-22: "mostrar a variação na data que ocorreu") —
   * `{ data: "2026-07-22", timestamp: 1753142400000, Bovinos: 120 }`.
   * `timestamp` alimenta o eixo X numérico do gráfico (posição real no
   * tempo); chaves de espécie dinâmicas pra <Line dataKey={especie}> sem
   * hardcodar nomes. */
  dados: Array<Record<string, string | number>>
  especies: string[]
  /** Timestamps do dia 1 de cada mês já decorrido — únicos ticks
   * mostrados no eixo X (o eixo continua só com "início de cada mês",
   * mesmo visual de antes, mesmo com pontos de dado em datas quaisquer). */
  ticksMeses: number[]
}

function paraTimestamp(dataIso: string): number {
  return new Date(`${dataIso}T00:00:00`).getTime()
}

/**
 * Gráfico de evolução do saldo de rebanho ao longo do ano, por espécie
 * (Painel Inteligente, item 21, spec seção 5.2). Reaproveita
 * `obter_saldo_rebanho()` (item 12, mesma RPC de `useResumoSaldoAno`) — não
 * inventa uma view/RPC nova de série histórica (spec seção 7: "view
 * calculada on-the-fly", sem saldo materializado).
 *
 * Reescrito em 2026-07-22 (pedido de JP): antes eram sempre 12 checkpoints
 * fixos (fim de cada mês) — agora um checkpoint por DATA REAL em que houve
 * ao menos uma transação no ano (`transacoes.data_operacao`, distinct),
 * mais um checkpoint final na data de hoje (ano corrente) ou 31/12 (ano
 * passado) pra a linha sempre refletir o estado mais atual mesmo sem
 * transação recente. Número de chamadas passa a ser "1 por data distinta
 * de transação no ano", não mais um teto fixo de 12 — em uma fazenda com
 * poucas dezenas de transações por ano (caso real observado) isso
 * continua rápido; se o volume crescer muito, é candidato a otimização
 * futura (mesma filosofia já registrada aqui: só otimizar quando virar
 * problema real).
 */
export function useEvolucaoSaldoAno(fazendaId: string | undefined, ano: number) {
  return useQuery({
    queryKey: ["saldo-rebanho", "evolucao-ano", fazendaId, ano] as const,
    queryFn: async (): Promise<EvolucaoSaldoAno> => {
      const anoAtual = new Date().getFullYear()
      const mesAtual = new Date().getMonth() + 1
      const ultimoMes = ano >= anoAtual ? mesAtual : 12
      const dataFimPeriodo =
        ano >= anoAtual ? new Date().toISOString().slice(0, 10) : `${ano}-12-31`

      const { data: transacoesDoAno, error: erroTransacoes } = await supabase
        .from("transacoes")
        .select("data_operacao")
        .eq("fazenda_id", fazendaId as string)
        .gte("data_operacao", `${ano}-01-01`)
        .lte("data_operacao", dataFimPeriodo)
        .order("data_operacao", { ascending: true })

      if (erroTransacoes) throw erroTransacoes

      const datasUnicas = Array.from(
        new Set((transacoesDoAno ?? []).map((t) => t.data_operacao as string))
      )
      if (datasUnicas[datasUnicas.length - 1] !== dataFimPeriodo) {
        datasUnicas.push(dataFimPeriodo)
      }

      const respostas = await Promise.all(
        datasUnicas.map((data) => supabase.rpc("obter_saldo_rebanho", { p_data_referencia: data }))
      )
      respostas.forEach((r) => {
        if (r.error) throw r.error
      })

      // especiesSet só ganha uma espécie quando ela teve qtd_registrada != 0
      // em ALGUM checkpoint (2026-07-23, pedido de JP: "omitir na legenda
      // itens que nunca tiveram histórico de existência na fazenda, no
      // tempo gráfico apresentado") — sem essa checagem, TODA espécie ativa
      // do catálogo apareceria sempre na legenda, mesmo uma que a fazenda
      // nunca criou: obter_saldo_rebanho() devolve uma "espinha" com todo o
      // catálogo (inclusive linhas de qtd_registrada=0), e o loop original
      // adicionava especie_nome incondicionalmente pra cada linha.
      const especiesSet = new Set<string>()
      const acumuladoPorData = new Map<string, Record<string, number>>()

      datasUnicas.forEach((data, i) => {
        const linhas = (respostas[i].data ?? []) as SaldoRebanhoLinha[]
        const acumulado: Record<string, number> = {}
        for (const linha of linhas) {
          if (linha.fazenda_id !== fazendaId) continue
          if (linha.qtd_registrada !== 0) especiesSet.add(linha.especie_nome)
          acumulado[linha.especie_nome] = (acumulado[linha.especie_nome] ?? 0) + linha.qtd_registrada
        }
        acumuladoPorData.set(data, acumulado)
      })

      const especies = Array.from(especiesSet).sort((a, b) => a.localeCompare(b, "pt-BR"))
      const dados = datasUnicas.map((data) => {
        const linha: Record<string, string | number> = {
          data,
          timestamp: paraTimestamp(data),
        }
        const acumulado = acumuladoPorData.get(data) ?? {}
        for (const especie of especies) {
          linha[especie] = acumulado[especie] ?? 0
        }
        return linha
      })

      const ticksMeses = Array.from({ length: ultimoMes }, (_, i) =>
        new Date(ano, i, 1).getTime()
      )

      return { dados, especies, ticksMeses }
    },
    enabled: !!fazendaId,
  })
}

export type ResumoTransacoesAno = {
  totalCompradas: number
  totalVendidas: number
}

/**
 * Cabeças compradas × vendidas no ano (Painel Inteligente, spec seção 5.2,
 * "Resumo financeiro do período"). Soma `transacoes.quantidade_animais`
 * direto (coluna já existe na tabela, sem precisar de
 * `transacoes_detalhe`) — consulta leve e dedicada, sem paginação (a
 * listagem paginada de Transações não serve pra um total agregado).
 */
export function useResumoTransacoesAno(fazendaId: string | undefined, ano: number) {
  return useQuery({
    queryKey: ["transacoes", "resumo-cabecas-ano", fazendaId, ano] as const,
    queryFn: async (): Promise<ResumoTransacoesAno> => {
      const { data, error } = await supabase
        .from("transacoes")
        .select("tipo_operacao, quantidade_animais")
        .eq("fazenda_id", fazendaId as string)
        .gte("data_operacao", `${ano}-01-01`)
        .lte("data_operacao", `${ano}-12-31`)
        .in("tipo_operacao", ["compra", "venda"])

      if (error) throw error

      let totalCompradas = 0
      let totalVendidas = 0
      for (const row of data ?? []) {
        if (row.tipo_operacao === "compra") totalCompradas += row.quantidade_animais
        else if (row.tipo_operacao === "venda") totalVendidas += row.quantidade_animais
      }

      return { totalCompradas, totalVendidas }
    },
    enabled: !!fazendaId,
  })
}
