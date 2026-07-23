import { useState } from "react"
import { Link } from "react-router-dom"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import { useEspecies } from "@/hooks/useEspecies"
import { useResumoSaldoAno, useTransacoesLista, type TransacoesFiltro } from "@/hooks/useTransacoes"
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
import { TipoOperacaoBadge } from "@/components/rebanho/TipoOperacaoBadge"
import { StatusGtaBadge } from "@/components/rebanho/StatusGtaBadge"
import { EntradaSaidaLoteDialog } from "@/pages/animais/EntradaSaidaLoteDialog"
import type { TipoOperacaoTransacao } from "@/lib/types/rebanho"

const PAGE_SIZE = 20

const tipoOperacaoLabels: Record<TipoOperacaoTransacao, string> = {
  compra: "Compra",
  venda: "Venda",
  entrada_pastoreio: "Entrada de Pastoreio",
  saida_pastoreio: "Saída de Pastoreio",
  nascimento: "Nascimento",
  obito: "Óbito",
  consumo: "Consumo",
}

const SEM_FILTRO = "__todos__"

function formatMoeda(valor: number | null) {
  if (valor === null) return "—"
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatData(data: string) {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
}

function anosDisponiveis() {
  const anoAtual = new Date().getFullYear()
  return Array.from({ length: 6 }, (_, i) => anoAtual - i)
}

export function TransacoesListPage() {
  const { data: fazenda } = useFazendaAtual()
  const especiesQuery = useEspecies()

  const [filtro, setFiltro] = useState<TransacoesFiltro>({
    ano: new Date().getFullYear(),
    especieId: null,
    tipoOperacao: null,
    outraParte: "",
  })
  const [pagina, setPagina] = useState(0)

  const resumoQuery = useResumoSaldoAno(fazenda?.fazenda_id, filtro.ano)
  const transacoesQuery = useTransacoesLista(fazenda?.fazenda_id, filtro, pagina)

  function atualizarFiltro(patch: Partial<TransacoesFiltro>) {
    setFiltro((atual) => ({ ...atual, ...patch }))
    setPagina(0)
  }

  const total = transacoesQuery.data?.total ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Entradas e Saídas</h1>
          <p className="text-muted-foreground">
            Todas as transações de compra, venda e movimentação do rebanho.
          </p>
        </div>
        <EntradaSaidaLoteDialog fazendaId={fazenda?.fazenda_id} />
      </div>

      {/* Resumo de saldo início/fim de ano por espécie (spec seção 5.2). */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {resumoQuery.isLoading && (
          <p className="text-sm text-muted-foreground">Carregando resumo do ano…</p>
        )}
        {resumoQuery.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Sem movimentação registrada em {filtro.ano}.
          </p>
        )}
        {resumoQuery.data?.map((linha) => (
          <div
            key={linha.especieNome}
            className="rounded-lg border border-border bg-card p-4"
          >
            <p className="text-sm font-medium text-muted-foreground">
              {linha.especieNome}
            </p>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">
                Início de {filtro.ano}
              </span>
              <span className="font-semibold">{formatNumero(linha.saldoInicio)}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">
                {filtro.ano === new Date().getFullYear() ? "Atual" : `Fim de ${filtro.ano}`}
              </span>
              <span className="font-semibold">{formatNumero(linha.saldoFim)}</span>
            </div>
            {linha.pendente > 0 && (
              <p className="mt-1 text-xs text-orange-700 dark:text-orange-400">
                {formatNumero(linha.pendente)} pendente(s) de GTA
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Filtros — ano, espécie, tipo de operação, contraparte. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="grid gap-1.5">
          <Label>Ano</Label>
          <Select
            value={String(filtro.ano)}
            onValueChange={(v) => atualizarFiltro({ ano: Number(v) })}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{(v: string) => v}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {anosDisponiveis().map((ano) => (
                <SelectItem key={ano} value={String(ano)}>
                  {ano}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label>Espécie</Label>
          <Select
            value={filtro.especieId ?? SEM_FILTRO}
            onValueChange={(v) =>
              atualizarFiltro({ especieId: v === SEM_FILTRO ? null : v })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v: string) =>
                  v === SEM_FILTRO
                    ? "Todas"
                    : (especiesQuery.data?.find((e) => e.id === v)?.nome ?? "Todas")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_FILTRO}>Todas</SelectItem>
              {especiesQuery.data?.map((especie) => (
                <SelectItem key={especie.id} value={especie.id}>
                  {especie.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label>Operação</Label>
          <Select
            value={filtro.tipoOperacao ?? SEM_FILTRO}
            onValueChange={(v) =>
              atualizarFiltro({
                tipoOperacao: v === SEM_FILTRO ? null : (v as TipoOperacaoTransacao),
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v: string) =>
                  v === SEM_FILTRO
                    ? "Todas"
                    : tipoOperacaoLabels[v as TipoOperacaoTransacao]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_FILTRO}>Todas</SelectItem>
              {(Object.keys(tipoOperacaoLabels) as TipoOperacaoTransacao[]).map((tipo) => (
                <SelectItem key={tipo} value={tipo}>
                  {tipoOperacaoLabels[tipo]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label>Contraparte</Label>
          <Input
            placeholder="Buscar…"
            value={filtro.outraParte}
            onChange={(e) => atualizarFiltro({ outraParte: e.target.value })}
          />
        </div>
      </div>

      {transacoesQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando transações…</p>
      )}

      {transacoesQuery.isError && (
        <p className="text-sm text-destructive">
          Erro ao carregar transações:{" "}
          {transacoesQuery.error instanceof Error
            ? transacoesQuery.error.message
            : "erro desconhecido"}
        </p>
      )}

      {transacoesQuery.data && transacoesQuery.data.dados.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma transação encontrada para os filtros selecionados.
        </p>
      )}

      {transacoesQuery.data && transacoesQuery.data.dados.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operação</TableHead>
                  <TableHead>Outra parte</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="hidden sm:table-cell">Espécie</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead className="hidden md:table-cell text-right">
                    Valor da nota
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">Status GTA</TableHead>
                  <TableHead className="hidden xl:table-cell">Nº nota</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transacoesQuery.data.dados.map((transacao) => (
                  <TableRow key={transacao.id}>
                    <TableCell>
                      <Link
                        to={`/app/financeiro/transacoes/${transacao.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        <TipoOperacaoBadge tipo={transacao.tipo_operacao} />
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">
                      {transacao.outra_parte}
                    </TableCell>
                    <TableCell>{formatData(transacao.data_operacao)}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {transacao.especies?.nome ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumero(transacao.quantidade_animais)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right">
                      {formatMoeda(transacao.valor_nota)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <StatusGtaBadge status={transacao.status_gta_transacao} />
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {transacao.numero_nota ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {formatNumero(total)} transaç{total === 1 ? "ão" : "ões"} — página{" "}
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
