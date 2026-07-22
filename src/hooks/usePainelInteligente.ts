import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import type { SaldoRebanhoLinha } from "@/lib/types/rebanho"

const MESES_LABEL = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]

export type EvolucaoSaldoAno = {
  /** Uma linha por mês já fechado do ano — `{ mes: "Jan", Bovinos: 120, Ovinos: 40 }`
   * (chaves dinâmicas por espécie, pra alimentar um <Line dataKey={especie}> por
   * espécie sem hardcodar nomes). */
  dados: Array<Record<string, string | number>>
  especies: string[]
}

/**
 * Gráfico de evolução do saldo de rebanho ao longo do ano, por espécie
 * (Painel Inteligente, item 21, spec seção 5.2). Reaproveita
 * `obter_saldo_rebanho()` (item 12, mesma RPC de `useResumoSaldoAno`) num
 * checkpoint por mês fechado (fim de cada mês já decorrido no ano — não
 * inventa uma view/RPC nova de série histórica, já que a spec (seção 7)
 * decidiu explicitamente por "view calculada on-the-fly" pro saldo, sem
 * necessidade de saldo materializado enquanto não houver problema real de
 * performance). Até 12 chamadas em paralelo — aceitável, dashboard carrega
 * uma vez por visita, não em loop.
 */
export function useEvolucaoSaldoAno(fazendaId: string | undefined, ano: number) {
  return useQuery({
    queryKey: ["saldo-rebanho", "evolucao-ano", fazendaId, ano] as const,
    queryFn: async (): Promise<EvolucaoSaldoAno> => {
      const anoAtual = new Date().getFullYear()
      const mesAtual = new Date().getMonth() + 1
      const ultimoMes = ano >= anoAtual ? mesAtual : 12

      const checkpoints = Array.from({ length: ultimoMes }, (_, i) => {
        const mes = i + 1
        const ultimoDiaDoMes = new Date(ano, mes, 0).getDate()
        return {
          mes,
          data: `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDiaDoMes).padStart(2, "0")}`,
        }
      })

      const respostas = await Promise.all(
        checkpoints.map((c) => supabase.rpc("obter_saldo_rebanho", { p_data_referencia: c.data }))
      )
      respostas.forEach((r) => {
        if (r.error) throw r.error
      })

      const especiesSet = new Set<string>()
      const acumuladoPorMes = new Map<number, Record<string, number>>()

      checkpoints.forEach((checkpoint, i) => {
        const linhas = (respostas[i].data ?? []) as SaldoRebanhoLinha[]
        const acumulado: Record<string, number> = {}
        for (const linha of linhas) {
          if (linha.fazenda_id !== fazendaId) continue
          especiesSet.add(linha.especie_nome)
          acumulado[linha.especie_nome] = (acumulado[linha.especie_nome] ?? 0) + linha.qtd_registrada
        }
        acumuladoPorMes.set(checkpoint.mes, acumulado)
      })

      const especies = Array.from(especiesSet).sort((a, b) => a.localeCompare(b, "pt-BR"))
      const dados = checkpoints.map((checkpoint) => {
        const linha: Record<string, string | number> = { mes: MESES_LABEL[checkpoint.mes - 1] }
        const acumulado = acumuladoPorMes.get(checkpoint.mes) ?? {}
        for (const especie of especies) {
          linha[especie] = acumulado[especie] ?? 0
        }
        return linha
      })

      return { dados, especies }
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
