import { Link, useParams } from "react-router-dom"
import { ArrowLeftIcon } from "lucide-react"
import { useLote } from "@/hooks/useLotes"
import { useAnimais } from "@/hooks/useAnimais"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { StatusAnimalBadge } from "@/components/rebanho/StatusAnimalBadge"
import { LoteFormDialog } from "@/pages/lotes/LoteFormDialog"
import { ArquivarLoteButton } from "@/pages/lotes/ArquivarLoteButton"

function formatPeso(kg: number | null) {
  return kg === null ? "—" : `${kg.toFixed(1)} kg`
}

function formatGmd(kg: number | null) {
  return kg === null ? "—" : `${kg.toFixed(3)} kg/dia`
}

function formatData(data: string | null) {
  if (!data) return "—"
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
}

export function LoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const loteQuery = useLote(id)
  const animaisQuery = useAnimais(loteQuery.data?.fazenda_id, id)

  if (loteQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando lote…</p>
  }

  if (loteQuery.isError || !loteQuery.data) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          to="/app/lotes"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Voltar para Lotes
        </Link>
        <p className="text-sm text-destructive">
          Erro ao carregar lote:{" "}
          {loteQuery.error instanceof Error
            ? loteQuery.error.message
            : "lote não encontrado"}
        </p>
      </div>
    )
  }

  const lote = loteQuery.data

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/app/lotes"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Voltar para Lotes
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{lote.nome}</h1>
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
          </div>
          {lote.descricao && (
            <p className="text-muted-foreground">{lote.descricao}</p>
          )}
        </div>
        <div className="flex gap-2">
          <LoteFormDialog mode="editar" lote={lote} />
          <ArquivarLoteButton lote={lote} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Estatísticas</CardTitle>
          <CardDescription>
            Calculadas a partir dos animais ativos (status='ativo') associados
            a este lote.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <dt className="text-xs text-muted-foreground">Início</dt>
              <dd className="mt-1 text-sm">{formatData(lote.data_inicio)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Fim</dt>
              <dd className="mt-1 text-sm">{formatData(lote.data_fim)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Animais (total histórico)</dt>
              <dd className="mt-1 text-sm">{lote.numero_animais_total}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Animais ativos</dt>
              <dd className="mt-1 text-sm">{lote.numero_animais_ativos}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Peso total</dt>
              <dd className="mt-1 text-sm">{formatPeso(lote.peso_total_kg)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Peso médio</dt>
              <dd className="mt-1 text-sm">{formatPeso(lote.peso_medio_kg)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">GMD médio</dt>
              <dd className="mt-1 text-sm">{formatGmd(lote.gmd_medio_kg)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Animais do lote</CardTitle>
        </CardHeader>
        <CardContent>
          {animaisQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          )}
          {animaisQuery.data && animaisQuery.data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum animal associado a este lote.
            </p>
          )}
          {animaisQuery.data && animaisQuery.data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Identificação</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Categoria
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Peso atual</TableHead>
                  <TableHead className="hidden sm:table-cell">GMD</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {animaisQuery.data.map((animal) => (
                  <TableRow key={animal.id}>
                    <TableCell>
                      <Link
                        to={`/app/animais/${animal.id}`}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {animal.identificacao}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {animal.categoria ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StatusAnimalBadge status={animal.status} />
                    </TableCell>
                    <TableCell>{formatPeso(animal.peso_atual_kg)}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {formatGmd(animal.gmd_medio_kg)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
