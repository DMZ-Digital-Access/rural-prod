import {
  Legend,
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Link } from "react-router-dom"
import { FileTextIcon, TruckIcon } from "lucide-react"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import { useResumoSaldoAno, useTransacoesLista } from "@/hooks/useTransacoes"
import {
  MESES_LABEL,
  useEvolucaoSaldoAno,
  useResumoTransacoesAno,
} from "@/hooks/usePainelInteligente"
import { useGtasLista } from "@/hooks/useGtas"
import { useDeclaracoesLista } from "@/hooks/useDeclaracoesRebanho"
import { useEstadoFazenda, usePrazoDeclaracao } from "@/hooks/useEstadoFazenda"
import { useFluxoCaixa } from "@/hooks/useFluxoCaixa"
import { useLancamentosLista } from "@/hooks/useLancamentosFinanceiros"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { AlertaCard, type NivelAlerta } from "@/components/rebanho/AlertaCard"
import { TipoOperacaoBadge } from "@/components/rebanho/TipoOperacaoBadge"
import { TipoLancamentoBadge } from "@/components/rebanho/TipoLancamentoBadge"

const ANO_ATUAL = new Date().getFullYear()

// Paleta de linhas do gráfico — usa as mesmas variáveis de cor semântica
// (--chart-N) já definidas no tema do projeto.
const CORES_LINHA = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

function formatMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatData(data: string) {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10)
}

export function PainelInteligentePage() {
  const { data: fazenda } = useFazendaAtual()
  const fazendaId = fazenda?.fazenda_id

  const resumoSaldo = useResumoSaldoAno(fazendaId, ANO_ATUAL)
  const evolucaoSaldo = useEvolucaoSaldoAno(fazendaId, ANO_ATUAL)
  const gtasPendentes = useGtasLista(
    fazendaId,
    { status: "pendente", especieId: null, dataInicio: "", dataFim: "" },
    0
  )
  const declaracoesDoAno = useDeclaracoesLista(fazendaId, { ano: ANO_ATUAL })
  const estadoFazenda = useEstadoFazenda(fazendaId)
  const prazoDeclaracao = usePrazoDeclaracao(estadoFazenda.data, ANO_ATUAL)
  const fluxoCaixaAno = useFluxoCaixa(fazendaId, {
    ano: ANO_ATUAL,
    mes: null,
    tipo: null,
    categoria: "",
  })
  const resumoTransacoesAno = useResumoTransacoesAno(fazendaId, ANO_ATUAL)
  const ultimasTransacoes = useTransacoesLista(
    fazendaId,
    { ano: ANO_ATUAL, especieId: null, tipoOperacao: null, outraParte: "" },
    0
  )
  const ultimosLancamentos = useLancamentosLista(
    fazendaId,
    { tipo: null, categoria: "", pago: null, dataInicio: "", dataFim: "", validado: null },
    0
  )

  // --- Alerta: GTAs pendentes ---
  const totalGtasPendentes = gtasPendentes.data?.total ?? 0

  // --- Alerta: Declaração Anual pendente (3 estados, spec seção 4.2) ---
  const declaracaoDoAno = declaracoesDoAno.data?.[0]
  const prazo = prazoDeclaracao.data
  let situacaoDeclaracao: { nivel: NivelAlerta; mensagem: string }

  if (declaracoesDoAno.isLoading || prazoDeclaracao.isLoading || estadoFazenda.isLoading) {
    situacaoDeclaracao = { nivel: "indefinido", mensagem: "Carregando…" }
  } else if (declaracaoDoAno?.status === "enviado") {
    situacaoDeclaracao = { nivel: "ok", mensagem: `Declaração ${ANO_ATUAL} já enviada.` }
  } else if (!estadoFazenda.data) {
    situacaoDeclaracao = {
      nivel: "indefinido",
      mensagem: "Configure o estado da fazenda em Configurações para calcular o prazo.",
    }
  } else if (!prazo?.data_inicio_prazo || !prazo?.data_fim_prazo) {
    situacaoDeclaracao = {
      nivel: "indefinido",
      mensagem: `Nenhum prazo cadastrado para ${estadoFazenda.data}/${ANO_ATUAL}.`,
    }
  } else if (hojeISO() < prazo.data_inicio_prazo) {
    situacaoDeclaracao = {
      nivel: "ok",
      mensagem: `Prazo ${ANO_ATUAL} ainda não abriu (${formatData(prazo.data_inicio_prazo)}).`,
    }
  } else if (hojeISO() <= prazo.data_fim_prazo) {
    situacaoDeclaracao = {
      nivel: "atencao",
      mensagem: `Pendente — prazo vai até ${formatData(prazo.data_fim_prazo)}.`,
    }
  } else {
    situacaoDeclaracao = {
      nivel: "critico",
      mensagem: `Pendente — prazo encerrado em ${formatData(prazo.data_fim_prazo)}.`,
    }
  }

  // --- Resumo Financeiro do Rebanho: só transações de compra/venda de
  // animais (origem='transacao_animal'), não o fluxo de caixa consolidado
  // inteiro (que também soma lançamentos financeiros gerais) — pedido de
  // JP, 2026-07-23: "mostrar apenas os valores de transações com
  // animais". Antes desta mudança, este card já misturava as duas fontes
  // (igual à página Financeiro), o que também explicava a impressão de
  // "não bate com a página Financeiro": aquela página, por padrão, mostra
  // TODOS OS ANOS combinados (filtro.ano começa null), enquanto este
  // painel sempre filtrou só o ano corrente — comparação teria que ser
  // feita com o mesmo ano selecionado nos dois lugares pra bater; com o
  // escopo agora restrito a só transações de animais, os dois números são
  // deliberadamente diferentes (aqui é só rebanho, lá é a fazenda inteira).
  const movimentos = (fluxoCaixaAno.data ?? []).filter(
    (m) => m.origem === "transacao_animal"
  )
  const totalReceitas = movimentos
    .filter((m) => m.tipo === "receita")
    .reduce((soma, m) => soma + m.valor, 0)
  const totalDespesas = movimentos
    .filter((m) => m.tipo === "despesa")
    .reduce((soma, m) => soma + m.valor, 0)
  const saldoLiquido = totalReceitas - totalDespesas

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Painel Inteligente</h1>
        <p className="text-muted-foreground">
          Visão consolidada do rebanho e das finanças da fazenda em {ANO_ATUAL}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AlertaCard
          nivel={totalGtasPendentes > 0 ? "atencao" : "ok"}
          titulo="GTAs pendentes de liberação"
          mensagem={
            totalGtasPendentes > 0
              ? `${totalGtasPendentes} GTA${totalGtasPendentes === 1 ? "" : "s"} aguardando liberação.`
              : "Nenhuma GTA pendente."
          }
          to="/app/rebanho/gtas"
          icone={<TruckIcon className="size-5" />}
        />
        <AlertaCard
          nivel={situacaoDeclaracao.nivel}
          titulo={`Declaração Anual de Rebanho ${ANO_ATUAL}`}
          mensagem={situacaoDeclaracao.mensagem}
          to="/app/rebanho/declaracoes"
          icone={<FileTextIcon className="size-5" />}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Saldo de Rebanho</h2>
        {resumoSaldo.data && resumoSaldo.data.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma movimentação de animais registrada ainda.
          </p>
        )}
        {resumoSaldo.data && resumoSaldo.data.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {resumoSaldo.data.map((especie) => (
              <Card key={especie.especieNome}>
                <CardContent className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{especie.especieNome}</span>
                  <span className="text-2xl font-semibold tabular-nums">
                    {especie.saldoFim}
                  </span>
                  {especie.pendente > 0 && (
                    <span className="text-xs text-orange-600 dark:text-orange-400">
                      {especie.pendente} pendente{especie.pendente === 1 ? "" : "s"}
                    </span>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {evolucaoSaldo.data && evolucaoSaldo.data.especies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Evolução do Saldo — {ANO_ATUAL}</CardTitle>
            <CardDescription>
              Quantidade registrada por espécie, com a variação exata na data de cada operação.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolucaoSaldo.data.dados}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    ticks={evolucaoSaldo.data.ticksMeses}
                    tickFormatter={(ts: number) => MESES_LABEL[new Date(ts).getMonth()]}
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    stroke="var(--muted-foreground)"
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    stroke="var(--muted-foreground)"
                  />
                  <Tooltip
                    labelFormatter={(ts) =>
                      typeof ts === "number" ? new Date(ts).toLocaleDateString("pt-BR") : ""
                    }
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {evolucaoSaldo.data.especies.map((especie, i) => {
                    const cor = CORES_LINHA[i % CORES_LINHA.length]
                    const datasComOperacao = evolucaoSaldo.data.datasComOperacao[especie]
                    return (
                      <Line
                        key={especie}
                        type="monotone"
                        dataKey={especie}
                        stroke={cor}
                        strokeWidth={2}
                        dot={(props: { cx?: number; cy?: number; payload?: { data: string } }) => {
                          const { cx, cy, payload } = props
                          if (cx == null || cy == null || !payload?.data || !datasComOperacao?.has(payload.data)) {
                            return null
                          }
                          return <circle cx={cx} cy={cy} r={3} fill={cor} stroke={cor} />
                        }}
                      />
                    )
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Resumo Financeiro do Rebanho — {ANO_ATUAL}</h2>
        <p className="text-sm text-muted-foreground">
          Só compra/venda de animais (não inclui lançamentos financeiros gerais — veja o
          total da fazenda inteira em Financeiro). Cabeças conta a movimentação de
          entrada/saída de animais do rebanho, não valor financeiro.
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card>
            <CardContent className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Receitas</span>
              <span className="text-xl font-semibold text-green-700 dark:text-green-400">
                {formatMoeda(totalReceitas)}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Despesas</span>
              <span className="text-xl font-semibold text-blue-700 dark:text-blue-400">
                {formatMoeda(totalDespesas)}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Saldo Líquido</span>
              <span
                className={
                  saldoLiquido >= 0
                    ? "text-xl font-semibold text-green-700 dark:text-green-400"
                    : "text-xl font-semibold text-destructive"
                }
              >
                {formatMoeda(saldoLiquido)}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Cabeças entradas / saídas</span>
              <span className="text-xl font-semibold tabular-nums">
                {resumoTransacoesAno.data?.totalCompradas ?? 0} /{" "}
                {resumoTransacoesAno.data?.totalVendidas ?? 0}
              </span>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Últimas Transações</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {ultimasTransacoes.data && ultimasTransacoes.data.dados.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma transação em {ANO_ATUAL}.</p>
            )}
            {ultimasTransacoes.data?.dados.slice(0, 5).map((transacao) => (
              <Link
                key={transacao.id}
                to={`/app/financeiro/transacoes/${transacao.id}`}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
              >
                <div className="flex items-center gap-2">
                  <TipoOperacaoBadge tipo={transacao.tipo_operacao} />
                  <span>{transacao.outra_parte}</span>
                </div>
                <span className="text-muted-foreground">
                  {formatData(transacao.data_operacao)}
                </span>
              </Link>
            ))}
            <Link
              to="/app/financeiro/transacoes"
              className="mt-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Ver todas as transações
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Últimos Lançamentos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {ultimosLancamentos.data && ultimosLancamentos.data.dados.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum lançamento ainda.</p>
            )}
            {ultimosLancamentos.data?.dados.slice(0, 5).map((lancamento) => (
              <Link
                key={lancamento.id}
                to={`/app/financeiro/lancamentos/${lancamento.id}`}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
              >
                <div className="flex items-center gap-2">
                  <TipoLancamentoBadge tipo={lancamento.tipo} />
                  <span>{lancamento.categoria}</span>
                </div>
                <span className="text-muted-foreground">
                  {formatData(lancamento.data_lancamento)}
                </span>
              </Link>
            ))}
            <Link
              to="/app/financeiro/lancamentos"
              className="mt-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Ver todos os lançamentos
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
