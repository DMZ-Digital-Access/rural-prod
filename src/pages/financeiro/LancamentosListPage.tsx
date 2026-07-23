import { useState } from "react"
import { Link } from "react-router-dom"
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon } from "lucide-react"
import { toast } from "sonner"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import {
  buscarTodosLancamentosParaExport,
  useLancamentosLista,
  type LancamentosFiltro,
} from "@/hooks/useLancamentosFinanceiros"
import { baixarCsv, gerarConteudoCsv } from "@/lib/exportarCsv"
import { formatNumero } from "@/lib/format"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TipoLancamentoBadge } from "@/components/rebanho/TipoLancamentoBadge"
import { StatusPagoBadge } from "@/components/rebanho/StatusPagoBadge"
import { ValidacaoBadge } from "@/components/rebanho/ValidacaoBadge"
import { CriarLancamentoDialog } from "@/pages/financeiro/CriarLancamentoDialog"
import type { TipoLancamento } from "@/lib/types/financeiro"

const PAGE_SIZE = 20
const SEM_FILTRO = "__todos__"

const tipoLabels: Record<TipoLancamento, string> = {
  receita: "Receita",
  despesa: "Despesa",
}

function formatMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatData(data: string) {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
}

export function LancamentosListPage() {
  const { data: fazenda } = useFazendaAtual()
  const somenteLeitura = fazenda?.papel === "financeiro"

  const [filtro, setFiltro] = useState<LancamentosFiltro>({
    tipo: null,
    categoria: "",
    pago: null,
    dataInicio: "",
    dataFim: "",
    validado: null,
  })
  const [pagina, setPagina] = useState(0)
  const [exportando, setExportando] = useState(false)

  const lancamentosQuery = useLancamentosLista(fazenda?.fazenda_id, filtro, pagina)

  async function exportarCsv() {
    if (!fazenda?.fazenda_id) return
    setExportando(true)
    try {
      const todos = await buscarTodosLancamentosParaExport(fazenda.fazenda_id, filtro)
      const cabecalho = [
        "Tipo", "Categoria", "Descrição", "Data", "Valor",
        "Pago", "Data pagamento", "Contraparte", "Validado",
      ]
      const linhas = todos.map((l) => [
        tipoLabels[l.tipo],
        l.categoria,
        l.descricao,
        l.data_lancamento,
        l.valor.toFixed(2).replace(".", ","),
        l.pago ? "Sim" : "Não",
        l.data_pagamento ?? "",
        l.contraparte ?? "",
        l.validado_pelo_usuario ? "Sim" : "Não",
      ])
      baixarCsv(
        `lancamentos-${new Date().toISOString().slice(0, 10)}.csv`,
        gerarConteudoCsv(cabecalho, linhas)
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao exportar CSV.")
    } finally {
      setExportando(false)
    }
  }

  function atualizarFiltro(patch: Partial<LancamentosFiltro>) {
    setFiltro((atual) => ({ ...atual, ...patch }))
    setPagina(0)
  }

  const total = lancamentosQuery.data?.total ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const totalReceitas = (lancamentosQuery.data?.dados ?? [])
    .filter((l) => l.tipo === "receita")
    .reduce((soma, l) => soma + l.valor, 0)
  const totalDespesas = (lancamentosQuery.data?.dados ?? [])
    .filter((l) => l.tipo === "despesa")
    .reduce((soma, l) => soma + l.valor, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Lançamentos Gerais</h1>
          <p className="text-muted-foreground">
            Receitas e despesas gerais da fazenda — insumos, mão de obra, impostos e mais.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={exportando || !fazenda?.fazenda_id}
            onClick={exportarCsv}
          >
            <DownloadIcon />
            {exportando ? "Exportando…" : "Exportar CSV"}
          </Button>
          {!somenteLeitura && <CriarLancamentoDialog fazendaId={fazenda?.fazenda_id} />}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Receitas (página atual)
          </p>
          <p className="text-xl font-semibold text-green-700 dark:text-green-400">
            {formatMoeda(totalReceitas)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Despesas (página atual)
          </p>
          <p className="text-xl font-semibold text-blue-700 dark:text-blue-400">
            {formatMoeda(totalDespesas)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="grid gap-1.5">
          <Label>Tipo</Label>
          <Select
            value={filtro.tipo ?? SEM_FILTRO}
            onValueChange={(v) =>
              atualizarFiltro({ tipo: v === SEM_FILTRO ? null : (v as TipoLancamento) })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v: string) => (v === SEM_FILTRO ? "Todos" : tipoLabels[v as TipoLancamento])}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_FILTRO}>Todos</SelectItem>
              {(Object.keys(tipoLabels) as TipoLancamento[]).map((tipo) => (
                <SelectItem key={tipo} value={tipo}>
                  {tipoLabels[tipo]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label>Categoria</Label>
          <Input
            placeholder="Buscar…"
            value={filtro.categoria}
            onChange={(e) => atualizarFiltro({ categoria: e.target.value })}
          />
        </div>

        <div className="grid gap-1.5">
          <Label>Pago</Label>
          <Select
            value={filtro.pago === null ? SEM_FILTRO : filtro.pago ? "sim" : "nao"}
            onValueChange={(v) =>
              atualizarFiltro({ pago: v === SEM_FILTRO ? null : v === "sim" })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v: string) => (v === SEM_FILTRO ? "Todos" : v === "sim" ? "Sim" : "Não")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_FILTRO}>Todos</SelectItem>
              <SelectItem value="sim">Sim</SelectItem>
              <SelectItem value="nao">Não</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label>Validação</Label>
          <Select
            value={filtro.validado === null ? SEM_FILTRO : filtro.validado ? "sim" : "nao"}
            onValueChange={(v) =>
              atualizarFiltro({ validado: v === SEM_FILTRO ? null : v === "sim" })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v: string) =>
                  v === SEM_FILTRO ? "Todos" : v === "sim" ? "Validados" : "Não validados"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_FILTRO}>Todos</SelectItem>
              <SelectItem value="sim">Validados</SelectItem>
              <SelectItem value="nao">Não validados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label>De</Label>
          <Input
            type="date"
            value={filtro.dataInicio}
            onChange={(e) => atualizarFiltro({ dataInicio: e.target.value })}
          />
        </div>

        <div className="grid gap-1.5">
          <Label>Até</Label>
          <Input
            type="date"
            value={filtro.dataFim}
            onChange={(e) => atualizarFiltro({ dataFim: e.target.value })}
          />
        </div>
      </div>

      {lancamentosQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando lançamentos…</p>
      )}

      {lancamentosQuery.isError && (
        <p className="text-sm text-destructive">
          Erro ao carregar lançamentos:{" "}
          {lancamentosQuery.error instanceof Error
            ? lancamentosQuery.error.message
            : "erro desconhecido"}
        </p>
      )}

      {lancamentosQuery.data && lancamentosQuery.data.dados.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum lançamento encontrado para os filtros selecionados.
        </p>
      )}

      {lancamentosQuery.data && lancamentosQuery.data.dados.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead className="hidden lg:table-cell">Data pagamento</TableHead>
                  <TableHead className="hidden sm:table-cell">Contraparte</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lancamentosQuery.data.dados.map((lancamento) => (
                  <TableRow key={lancamento.id}>
                    <TableCell>
                      <Link
                        to={`/app/financeiro/lancamentos/${lancamento.id}`}
                        className="flex flex-wrap items-center gap-1.5 underline-offset-4 hover:underline"
                      >
                        <TipoLancamentoBadge tipo={lancamento.tipo} />
                        <ValidacaoBadge validado={lancamento.validado_pelo_usuario} />
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">{lancamento.categoria}</TableCell>
                    <TableCell>{lancamento.descricao}</TableCell>
                    <TableCell>{formatData(lancamento.data_lancamento)}</TableCell>
                    <TableCell className="text-right">
                      {formatMoeda(lancamento.valor)}
                    </TableCell>
                    <TableCell>
                      <StatusPagoBadge pago={lancamento.pago} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {lancamento.data_pagamento ? formatData(lancamento.data_pagamento) : "—"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {lancamento.contraparte ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {formatNumero(total)} lançamento{total === 1 ? "" : "s"} — página{" "}
              {formatNumero(pagina + 1)} de {formatNumero(totalPaginas)}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagina === 0}
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
              >
                <ChevronLeftIcon />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagina + 1 >= totalPaginas}
                onClick={() => setPagina((p) => p + 1)}
              >
                Próxima
                <ChevronRightIcon />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
