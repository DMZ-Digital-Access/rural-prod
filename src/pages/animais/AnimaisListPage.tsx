import { Link } from "react-router-dom"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import { useAnimais } from "@/hooks/useAnimais"
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
import { StatusAnimalBadge } from "@/components/rebanho/StatusAnimalBadge"
import { EditarAnimalDialog } from "@/pages/animais/EditarAnimalDialog"
import { EntradaSaidaLoteDialog } from "@/pages/animais/EntradaSaidaLoteDialog"
import { animalPendenteIndividualizacao } from "@/lib/types/rebanho"

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

export function AnimaisListPage() {
  const { data: fazenda } = useFazendaAtual()
  const animaisQuery = useAnimais(fazenda?.fazenda_id)
  const lotesQuery = useLotes(fazenda?.fazenda_id)

  const lotes = lotesQuery.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Animais</h1>
          <p className="text-muted-foreground">
            Rebanho individual da fazenda — cadastro, status e desempenho.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <EntradaSaidaLoteDialog fazendaId={fazenda?.fazenda_id} />
        </div>
      </div>

      {animaisQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando animais…</p>
      )}

      {animaisQuery.isError && (
        <p className="text-sm text-destructive">
          Erro ao carregar animais:{" "}
          {animaisQuery.error instanceof Error
            ? animaisQuery.error.message
            : "erro desconhecido"}
        </p>
      )}

      {animaisQuery.data && animaisQuery.data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum animal cadastrado ainda. Use "Entradas e Saídas de Animais de
          Lote" para lançar a entrada no rebanho — cada animal criado fica
          pendente de individualização até você completar o cadastro (ícone
          de edição na lista).
        </p>
      )}

      {animaisQuery.data && animaisQuery.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Identificação</TableHead>
                <TableHead className="hidden md:table-cell">Categoria</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Lote</TableHead>
                <TableHead>Peso atual</TableHead>
                <TableHead className="hidden sm:table-cell">GMD</TableHead>
                <TableHead className="hidden lg:table-cell">
                  Última pesagem
                </TableHead>
                <TableHead className="text-right">Ações</TableHead>
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
                    <div className="flex flex-wrap items-center gap-1">
                      <StatusAnimalBadge status={animal.status} />
                      {animalPendenteIndividualizacao(animal) && (
                        <Badge
                          variant="outline"
                          className="border-amber-600/20 bg-amber-600/10 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-400"
                        >
                          Pendente
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {animal.lote_id ? "Sim" : "Não"}
                  </TableCell>
                  <TableCell>{formatPeso(animal.peso_atual_kg)}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {formatGmd(animal.gmd_medio_kg)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {formatData(animal.ultima_pesagem_data)}
                  </TableCell>
                  <TableCell className="text-right">
                    <EditarAnimalDialog animal={animal} lotes={lotes} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
