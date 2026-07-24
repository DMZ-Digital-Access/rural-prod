import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Tabs } from "@base-ui/react/tabs"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import { useLotes } from "@/hooks/useLotes"
import { formatNumero } from "@/lib/format"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { LoteFormDialog } from "@/pages/lotes/LoteFormDialog"
import { ArquivarLoteButton } from "@/pages/lotes/ArquivarLoteButton"
import { EncerrarLoteDialog } from "@/pages/lotes/EncerrarLoteDialog"

const ABAS = [
  { value: "ativos", label: "Ativos" },
  { value: "arquivados", label: "Arquivados" },
] as const

type AbaLotes = (typeof ABAS)[number]["value"]

function formatPeso(kg: number | null) {
  return kg === null ? "—" : `${formatNumero(kg, 1)} kg`
}

function formatGmd(kg: number | null) {
  return kg === null ? "—" : `${formatNumero(kg, 1)} kg/dia`
}

export function LotesListPage() {
  const navigate = useNavigate()
  const { data: fazenda } = useFazendaAtual()
  const lotesQuery = useLotes(fazenda?.fazenda_id)
  const [aba, setAba] = useState<AbaLotes>("ativos")

  const lotesFiltrados = (lotesQuery.data ?? []).filter((lote) =>
    aba === "ativos" ? lote.ativo : !lote.ativo
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Lotes</h1>
          <p className="text-muted-foreground">
            Lotes de manejo e estatísticas de desempenho dos animais ativos.
          </p>
        </div>
        <LoteFormDialog mode="criar" fazendaId={fazenda?.fazenda_id} />
      </div>

      {lotesQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando lotes…</p>
      )}

      {lotesQuery.isError && (
        <p className="text-sm text-destructive">
          Erro ao carregar lotes:{" "}
          {lotesQuery.error instanceof Error
            ? lotesQuery.error.message
            : "erro desconhecido"}
        </p>
      )}

      {lotesQuery.data && lotesQuery.data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum lote cadastrado ainda. Use "Novo lote" para começar.
        </p>
      )}

      {lotesQuery.data && lotesQuery.data.length > 0 && (
        <div className="flex flex-col gap-4">
          <Tabs.Root value={aba} onValueChange={(v) => setAba(v as AbaLotes)}>
            <Tabs.List className="flex gap-1 overflow-x-auto border-b border-border">
              {ABAS.map((item) => (
                <Tabs.Tab
                  key={item.value}
                  value={item.value}
                  className="shrink-0 border-b-2 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground aria-selected:border-foreground aria-selected:text-foreground"
                >
                  {item.label}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.Root>

          {lotesFiltrados.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum lote {aba === "ativos" ? "ativo" : "arquivado"}.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Animais ativos</TableHead>
                  <TableHead className="hidden sm:table-cell">Peso médio</TableHead>
                  <TableHead className="hidden md:table-cell">GMD médio</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lotesFiltrados.map((lote) => (
                  <TableRow
                    key={lote.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/app/lotes/${lote.id}`)}
                  >
                    <TableCell className="font-medium">{lote.nome}</TableCell>
                    <TableCell>{formatNumero(lote.numero_animais_ativos)}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {formatPeso(lote.peso_medio_kg)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatGmd(lote.gmd_medio_kg)}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-end gap-2">
                        <LoteFormDialog mode="editar" lote={lote} />
                        {lote.ativo ? (
                          <EncerrarLoteDialog lote={lote} />
                        ) : (
                          <ArquivarLoteButton lote={lote} />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  )
}
