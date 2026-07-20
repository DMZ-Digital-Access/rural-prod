import { Link } from "react-router-dom"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import { useLotes } from "@/hooks/useLotes"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { LoteFormDialog } from "@/pages/lotes/LoteFormDialog"
import { ArquivarLoteButton } from "@/pages/lotes/ArquivarLoteButton"
import { EncerrarLoteDialog } from "@/pages/lotes/EncerrarLoteDialog"

function formatPeso(kg: number | null) {
  return kg === null ? "—" : `${kg.toFixed(1)} kg`
}

function formatGmd(kg: number | null) {
  return kg === null ? "—" : `${kg.toFixed(3)} kg/dia`
}

export function LotesListPage() {
  const { data: fazenda } = useFazendaAtual()
  const lotesQuery = useLotes(fazenda?.fazenda_id)

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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Animais ativos</TableHead>
              <TableHead className="hidden sm:table-cell">Peso médio</TableHead>
              <TableHead className="hidden md:table-cell">GMD médio</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lotesQuery.data.map((lote) => (
              <TableRow key={lote.id}>
                <TableCell>
                  <Link
                    to={`/app/lotes/${lote.id}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {lote.nome}
                  </Link>
                </TableCell>
                <TableCell>
                  {lote.ativo ? (
                    <Badge
                      variant="outline"
                      className="border-green-600/20 bg-green-600/10 text-green-700 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-400"
                    >
                      Ativo
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Arquivado</Badge>
                  )}
                </TableCell>
                <TableCell>{lote.numero_animais_ativos}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  {formatPeso(lote.peso_medio_kg)}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {formatGmd(lote.gmd_medio_kg)}
                </TableCell>
                <TableCell className="text-right">
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
  )
}
