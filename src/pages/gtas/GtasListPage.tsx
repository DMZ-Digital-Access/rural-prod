import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import { useEspecies } from "@/hooks/useEspecies"
import { useGtasLista, type GtasFiltro } from "@/hooks/useGtas"
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
import { StatusLiberacaoGtaBadge } from "@/components/rebanho/StatusLiberacaoGtaBadge"
import { CriarGtaDialog } from "@/pages/gtas/CriarGtaDialog"
import type { StatusLiberacaoGta } from "@/lib/types/rebanho"

const PAGE_SIZE = 20
const SEM_FILTRO = "__todos__"

const statusLabels: Record<StatusLiberacaoGta, string> = {
  pendente: "Pendente",
  liberada: "Liberada",
}

export function GtasListPage() {
  const navigate = useNavigate()
  const { data: fazenda } = useFazendaAtual()
  const especiesQuery = useEspecies()
  const somenteLeitura = fazenda?.papel === "financeiro"

  const [filtro, setFiltro] = useState<GtasFiltro>({
    status: null,
    especieId: null,
    dataInicio: "",
    dataFim: "",
  })
  const [pagina, setPagina] = useState(0)

  const gtasQuery = useGtasLista(fazenda?.fazenda_id, filtro, pagina)

  function atualizarFiltro(patch: Partial<GtasFiltro>) {
    setFiltro((atual) => ({ ...atual, ...patch }))
    setPagina(0)
  }

  const total = gtasQuery.data?.total ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE))

  if (somenteLeitura) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">GTAs</h1>
        <p className="text-sm text-muted-foreground">
          O papel financeiro não tem acesso a este módulo.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">GTAs</h1>
          <p className="text-muted-foreground">
            Guias de Trânsito Animal — cadastro, acompanhamento e documentos.
          </p>
        </div>
        <CriarGtaDialog fazendaId={fazenda?.fazenda_id} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="grid gap-1.5">
          <Label>Status</Label>
          <Select
            value={filtro.status ?? SEM_FILTRO}
            onValueChange={(v) =>
              atualizarFiltro({ status: v === SEM_FILTRO ? null : (v as StatusLiberacaoGta) })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v: string) =>
                  v === SEM_FILTRO ? "Todos" : statusLabels[v as StatusLiberacaoGta]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_FILTRO}>Todos</SelectItem>
              {(Object.keys(statusLabels) as StatusLiberacaoGta[]).map((status) => (
                <SelectItem key={status} value={status}>
                  {statusLabels[status]}
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
          <Label>Liberação de</Label>
          <Input
            type="date"
            value={filtro.dataInicio}
            onChange={(e) => atualizarFiltro({ dataInicio: e.target.value })}
          />
        </div>

        <div className="grid gap-1.5">
          <Label>Liberação até</Label>
          <Input
            type="date"
            value={filtro.dataFim}
            onChange={(e) => atualizarFiltro({ dataFim: e.target.value })}
          />
        </div>
      </div>

      {gtasQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando GTAs…</p>
      )}

      {gtasQuery.isError && (
        <p className="text-sm text-destructive">
          Erro ao carregar GTAs:{" "}
          {gtasQuery.error instanceof Error ? gtasQuery.error.message : "erro desconhecido"}
        </p>
      )}

      {gtasQuery.data && gtasQuery.data.dados.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma GTA encontrada para os filtros selecionados.
        </p>
      )}

      {gtasQuery.data && gtasQuery.data.dados.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº GTA</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Espécie</TableHead>
                  <TableHead className="hidden md:table-cell">Município origem</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="hidden md:table-cell">Município destino</TableHead>
                  <TableHead className="hidden lg:table-cell">Destino</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gtasQuery.data.dados.map((gta) => (
                  <TableRow
                    key={gta.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/app/rebanho/gtas/${gta.id}`)}
                  >
                    <TableCell className="font-medium">{gta.numero_gta}</TableCell>
                    <TableCell>
                      <StatusLiberacaoGtaBadge status={gta.status_liberacao} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {gta.especies?.nome ?? "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {gta.municipio_origem}
                    </TableCell>
                    <TableCell>{gta.origem}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {gta.municipio_destino}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{gta.destino}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {formatNumero(total)} GTA{total === 1 ? "" : "s"} — página {formatNumero(pagina + 1)}{" "}
              de {formatNumero(totalPaginas)}
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
