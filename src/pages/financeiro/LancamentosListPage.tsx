import { useState } from "react"
import { Link } from "react-router-dom"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import {
  useLancamentosLista,
  type LancamentosFiltro,
} from "@/hooks/useLancamentosFinanceiros"
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
  })
  const [pagina, setPagina] = useState(0)

  const lancamentosQuery = useLancamentosLista(fazenda?.fazenda_id, filtro, pagina)

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
          <h1 className="text-2xl font-semibold">Financeiro</h1>
          <p className="text-muted-foreground">
            Receitas e despesas gerais da fazenda — insumos, mão de obra, impostos e mais.
          </p>
        </div>
        {!somenteLeitura && <CriarLancamentoDialog fazendaId={fazenda?.fazenda_id} />}
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
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
                        to={`/app/rebanho/financeiro/${lancamento.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        <TipoLancamentoBadge tipo={lancamento.tipo} />
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
              {total} lançamento{total === 1 ? "" : "s"} — página {pagina + 1} de{" "}
              {totalPaginas}
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
