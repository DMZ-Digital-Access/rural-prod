import { useNavigate } from "react-router-dom"
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
import { formatNumero } from "@/lib/format"
import { SaldoRebanhoCards } from "@/components/rebanho/SaldoRebanhoCards"

const ANO_ATUAL = new Date().getFullYear()

function formatPeso(kg: number | null) {
  return kg === null ? "—" : formatNumero(kg, 1)
}

function formatGmd(kg: number | null) {
  return kg === null ? "—" : formatNumero(kg, 1)
}

function formatData(data: string | null) {
  if (!data) return "—"
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
}

export function AnimaisListPage() {
  const navigate = useNavigate()
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

      <SaldoRebanhoCards fazendaId={fazenda?.fazenda_id} ano={ANO_ATUAL} />

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
                <TableHead className="hidden text-center md:table-cell">
                  Tipo de Animal
                </TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="hidden text-center sm:table-cell">
                  Lote
                </TableHead>
                <TableHead className="text-center whitespace-normal">
                  Peso atual (kg)
                </TableHead>
                <TableHead className="hidden text-center whitespace-normal sm:table-cell">
                  GMD (kg/dia)
                </TableHead>
                <TableHead className="hidden text-center lg:table-cell">
                  Última pesagem
                </TableHead>
                <TableHead className="text-center">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {animaisQuery.data.map((animal) => (
                <TableRow
                  key={animal.id}
                  onClick={() => navigate(`/app/animais/${animal.id}`)}
                  className="cursor-pointer"
                >
                  <TableCell>
                    <span className="font-medium text-primary">
                      {animal.identificacao}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-center md:table-cell">
                    {animal.especie_nome ?? "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-wrap items-center justify-center gap-1">
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
                  <TableCell className="hidden text-center sm:table-cell">
                    {animal.lote_id ? "Sim" : "Não"}
                  </TableCell>
                  <TableCell className="text-center">
                    {formatPeso(animal.peso_atual_kg)}
                  </TableCell>
                  <TableCell className="hidden text-center sm:table-cell">
                    {formatGmd(animal.gmd_medio_kg)}
                  </TableCell>
                  <TableCell className="hidden text-center lg:table-cell">
                    {formatData(animal.ultima_pesagem_data)}
                  </TableCell>
                  <TableCell
                    className="text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
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
