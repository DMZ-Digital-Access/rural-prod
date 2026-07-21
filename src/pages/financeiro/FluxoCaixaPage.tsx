import { useState } from "react"
import { Link } from "react-router-dom"
import { DownloadIcon } from "lucide-react"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import { useFluxoCaixa, type FluxoCaixaFiltro } from "@/hooks/useFluxoCaixa"
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
import type { TipoLancamento } from "@/lib/types/financeiro"
import type { MovimentoFluxoCaixa } from "@/lib/types/fluxoCaixa"

const SEM_FILTRO = "__todos__"

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

const tipoLabels: Record<TipoLancamento, string> = {
  receita: "Receita",
  despesa: "Despesa",
}

function anosDisponiveis() {
  const anoAtual = new Date().getFullYear()
  return Array.from({ length: 6 }, (_, i) => anoAtual - i)
}

function formatMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatData(data: string) {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
}

function linkOrigem(movimento: MovimentoFluxoCaixa) {
  return movimento.origem === "transacao_animal"
    ? `/app/rebanho/transacoes/${movimento.origem_id}`
    : `/app/rebanho/financeiro/${movimento.origem_id}`
}

// Escapa vírgula/aspas/quebra de linha por RFC 4180 — mínimo necessário para
// abrir corretamente no Excel/Sheets sem quebrar colunas.
function campoCsv(valor: string) {
  if (/[",\n]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`
  return valor
}

function exportarCsv(movimentos: MovimentoFluxoCaixa[]) {
  const cabecalho = ["Data", "Tipo", "Categoria", "Descrição", "Valor", "Origem"]
  const linhas = movimentos.map((m) => [
    m.data,
    tipoLabels[m.tipo],
    m.categoria,
    m.descricao ?? "",
    m.valor.toFixed(2).replace(".", ","),
    m.origem === "transacao_animal" ? "Transação de animal" : "Lançamento financeiro",
  ])

  const conteudo = [cabecalho, ...linhas]
    .map((linha) => linha.map(campoCsv).join(";"))
    .join("\r\n")

  // BOM UTF-8 — sem ele o Excel (pt-BR) abre acentos corrompidos.
  const blob = new Blob(["﻿" + conteudo], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `fluxo-caixa-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function FluxoCaixaPage() {
  const { data: fazenda } = useFazendaAtual()
  const [filtro, setFiltro] = useState<FluxoCaixaFiltro>({
    ano: null,
    mes: null,
    tipo: null,
    categoria: "",
  })

  const fluxoQuery = useFluxoCaixa(fazenda?.fazenda_id, filtro)
  const movimentos = fluxoQuery.data ?? []

  function atualizarAno(v: string | null) {
    if (!v) return
    setFiltro((atual) => ({ ...atual, ano: v === SEM_FILTRO ? null : Number(v), mes: null }))
  }

  function atualizarMes(v: string | null) {
    if (!v) return
    setFiltro((atual) => ({ ...atual, mes: v === SEM_FILTRO ? null : Number(v) }))
  }

  function atualizarTipo(v: string | null) {
    if (!v) return
    setFiltro((atual) => ({ ...atual, tipo: v === SEM_FILTRO ? null : (v as TipoLancamento) }))
  }

  const totalReceitas = movimentos
    .filter((m) => m.tipo === "receita")
    .reduce((soma, m) => soma + m.valor, 0)
  const totalDespesas = movimentos
    .filter((m) => m.tipo === "despesa")
    .reduce((soma, m) => soma + m.valor, 0)
  const saldoLiquido = totalReceitas - totalDespesas

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fluxo de Caixa</h1>
          <p className="text-muted-foreground">
            Visão consolidada de receitas e despesas — vendas/compras de animais e demais
            lançamentos financeiros, sem contagem duplicada.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={movimentos.length === 0}
          onClick={() => exportarCsv(movimentos)}
        >
          <DownloadIcon />
          Exportar CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Receitas</p>
          <p className="text-xl font-semibold text-green-700 dark:text-green-400">
            {formatMoeda(totalReceitas)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Despesas</p>
          <p className="text-xl font-semibold text-blue-700 dark:text-blue-400">
            {formatMoeda(totalDespesas)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Saldo Líquido</p>
          <p
            className={
              saldoLiquido >= 0
                ? "text-xl font-semibold text-green-700 dark:text-green-400"
                : "text-xl font-semibold text-destructive"
            }
          >
            {formatMoeda(saldoLiquido)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="grid gap-1.5">
          <Label>Ano</Label>
          <Select value={filtro.ano ? String(filtro.ano) : SEM_FILTRO} onValueChange={atualizarAno}>
            <SelectTrigger className="w-full">
              <SelectValue>{(v: string) => (v === SEM_FILTRO ? "Todos" : v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_FILTRO}>Todos</SelectItem>
              {anosDisponiveis().map((ano) => (
                <SelectItem key={ano} value={String(ano)}>
                  {ano}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label>Mês</Label>
          <Select
            value={filtro.mes ? String(filtro.mes) : SEM_FILTRO}
            onValueChange={atualizarMes}
            disabled={!filtro.ano}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v: string) => (v === SEM_FILTRO ? "Todos" : MESES[Number(v) - 1])}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_FILTRO}>Todos</SelectItem>
              {MESES.map((mes, i) => (
                <SelectItem key={mes} value={String(i + 1)}>
                  {mes}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label>Tipo</Label>
          <Select value={filtro.tipo ?? SEM_FILTRO} onValueChange={atualizarTipo}>
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
            onChange={(e) => setFiltro((atual) => ({ ...atual, categoria: e.target.value }))}
          />
        </div>
      </div>

      {fluxoQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando movimentos…</p>
      )}

      {fluxoQuery.isError && (
        <p className="text-sm text-destructive">
          Erro ao carregar fluxo de caixa:{" "}
          {fluxoQuery.error instanceof Error ? fluxoQuery.error.message : "erro desconhecido"}
        </p>
      )}

      {fluxoQuery.data && movimentos.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum movimento encontrado para os filtros selecionados.
        </p>
      )}

      {movimentos.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="hidden sm:table-cell">Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movimentos.map((movimento) => (
                <TableRow key={`${movimento.origem}-${movimento.origem_id}`}>
                  <TableCell>
                    <Link to={linkOrigem(movimento)} className="underline-offset-4 hover:underline">
                      <TipoLancamentoBadge tipo={movimento.tipo} />
                    </Link>
                  </TableCell>
                  <TableCell>{formatData(movimento.data)}</TableCell>
                  <TableCell className="font-medium">{movimento.categoria}</TableCell>
                  <TableCell className="hidden sm:table-cell">{movimento.descricao}</TableCell>
                  <TableCell className="text-right">{formatMoeda(movimento.valor)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
