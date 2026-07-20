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
import { StatusAnimalBadge } from "@/components/rebanho/StatusAnimalBadge"
import { CriarAnimalDialog } from "@/pages/animais/CriarAnimalDialog"
import { EditarAnimalDialog } from "@/pages/animais/EditarAnimalDialog"
import { EntradaSaidaLoteDialog } from "@/pages/animais/EntradaSaidaLoteDialog"

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
          <CriarAnimalDialog fazendaId={fazenda?.fazenda_id} lotes={lotes} />
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
          Lote" para lançar a entrada no rebanho, e "Individualizar Animal"
          para cadastrar cada exemplar.
        </p>
      )}

      {animaisQuery.data && animaisQuery.data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Identificação</TableHead>
              <TableHead className="hidden md:table-cell">Categoria</TableHead>
              <TableHead>Status</TableHead>
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
                  {animal.categoria}
                </TableCell>
                <TableCell>
                  <StatusAnimalBadge status={animal.status} />
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
      )}
    </div>
  )
}
