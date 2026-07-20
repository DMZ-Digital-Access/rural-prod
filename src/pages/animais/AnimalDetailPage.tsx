import { Link, useParams } from "react-router-dom"
import { useAnimal } from "@/hooks/useAnimais"
import { usePesagens } from "@/hooks/usePesagens"
import { useLotes } from "@/hooks/useLotes"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
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
import { StatusAnimalBadge } from "@/components/rebanho/StatusAnimalBadge"
import { EditarAnimalDialog } from "@/pages/animais/EditarAnimalDialog"
import { RegistrarPesagemForm } from "@/pages/animais/RegistrarPesagemForm"

function formatData(data: string | null) {
  if (!data) return "—"
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
}

function formatPeso(kg: number | null) {
  return kg === null ? "—" : `${kg.toFixed(1)} kg`
}

export function AnimalDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: fazenda } = useFazendaAtual()
  const animalQuery = useAnimal(id)
  const pesagensQuery = usePesagens(id)
  const lotesQuery = useLotes(fazenda?.fazenda_id)

  if (animalQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando animal…</p>
  }

  if (animalQuery.isError || !animalQuery.data) {
    return (
      <p className="text-sm text-destructive">
        Erro ao carregar animal:{" "}
        {animalQuery.error instanceof Error
          ? animalQuery.error.message
          : "animal não encontrado"}
      </p>
    )
  }

  const animal = animalQuery.data
  const lote = lotesQuery.data?.find((l) => l.id === animal.lote_id)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{animal.identificacao}</h1>
          <p className="text-muted-foreground">
            {animal.categoria ?? "Pendente de individualização"} ·{" "}
            {animal.sexo === "macho" ? "Macho" : "Fêmea"}
          </p>
        </div>
        <EditarAnimalDialog animal={animal} lotes={lotesQuery.data ?? []} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados do animal</CardTitle>
          <CardDescription>
            Idade e categoria são calculadas a partir da data de nascimento;
            peso atual e GMD são calculados a partir do histórico de pesagens.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Status</dt>
              <dd className="mt-1">
                <StatusAnimalBadge status={animal.status} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Lote</dt>
              <dd className="mt-1 text-sm">
                {lote ? (
                  <Link
                    to={`/app/lotes/${lote.id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {lote.nome}
                  </Link>
                ) : (
                  "Sem lote"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Data de nascimento</dt>
              <dd className="mt-1 text-sm">{formatData(animal.data_nascimento)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Idade</dt>
              <dd className="mt-1 text-sm">
                {animal.idade_meses === null ? "—" : `${animal.idade_meses} meses`}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Peso inicial</dt>
              <dd className="mt-1 text-sm">{formatPeso(animal.peso_inicial_kg)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Peso atual</dt>
              <dd className="mt-1 text-sm">{formatPeso(animal.peso_atual_kg)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Ganho total</dt>
              <dd className="mt-1 text-sm">{formatPeso(animal.ganho_total_kg)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">GMD médio</dt>
              <dd className="mt-1 text-sm">
                {animal.gmd_medio_kg === null
                  ? "—"
                  : `${animal.gmd_medio_kg.toFixed(3)} kg/dia`}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Última pesagem</dt>
              <dd className="mt-1 text-sm">{formatData(animal.ultima_pesagem_data)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Nº de pesagens</dt>
              <dd className="mt-1 text-sm">{animal.numero_pesagens}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registrar pesagem</CardTitle>
          <CardDescription>
            Uma correção (mudança de até 2 dias em relação à última pesagem)
            atualiza o registro mais recente em vez de criar um novo — decisão
            do backend, não desta tela.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegistrarPesagemForm animalId={animal.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de pesagens</CardTitle>
        </CardHeader>
        <CardContent>
          {pesagensQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          )}
          {pesagensQuery.data && pesagensQuery.data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma pesagem registrada ainda.
            </p>
          )}
          {pesagensQuery.data && pesagensQuery.data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Peso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pesagensQuery.data.map((pesagem) => (
                  <TableRow key={pesagem.id}>
                    <TableCell>{formatData(pesagem.data_evento)}</TableCell>
                    <TableCell>{formatPeso(pesagem.peso_kg)}</TableCell>
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
