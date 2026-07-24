import { Link, useParams } from "react-router-dom"
import { ArrowLeftIcon } from "lucide-react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  useAnimal,
  useHistoricoLoteAnimal,
  useSaidaAnimal,
} from "@/hooks/useAnimais"
import { usePesagens } from "@/hooks/usePesagens"
import { useLotes } from "@/hooks/useLotes"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import { formatNumero } from "@/lib/format"
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
import { RastreabilidadeStepper } from "@/components/rebanho/RastreabilidadeStepper"
import { EditarAnimalDialog } from "@/pages/animais/EditarAnimalDialog"
import { RegistrarPesagemForm } from "@/pages/animais/RegistrarPesagemForm"
import { ExcluirPesagemDialog } from "@/pages/animais/ExcluirPesagemDialog"
import { VacinaDetalheDialog } from "@/pages/animais/VacinaDetalheDialog"
import { useVacinasDoAnimal } from "@/hooks/useVacinacoes"

function formatData(data: string | null) {
  if (!data) return "—"
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
}

function formatPeso(kg: number | null) {
  return kg === null ? "—" : `${formatNumero(kg, 1)} kg`
}

/**
 * Idade em meses até completar 12 (pedido de JP, 2026-07-23); a partir daí,
 * anos + meses restantes (ex.: "1 ano e 3 meses", "2 anos"). Usado tanto na
 * idade atual quanto na idade na aquisição.
 */
function formatIdade(meses: number | null): string {
  if (meses === null) return "—"
  if (meses < 12) return `${formatNumero(meses)} ${meses === 1 ? "mês" : "meses"}`

  const anos = Math.floor(meses / 12)
  const mesesRestantes = meses % 12
  const anosLabel = `${formatNumero(anos)} ${anos === 1 ? "ano" : "anos"}`

  if (mesesRestantes === 0) return anosLabel
  return `${anosLabel} e ${formatNumero(mesesRestantes)} ${mesesRestantes === 1 ? "mês" : "meses"}`
}

const origemLabels: Record<string, string> = {
  compra: "Comprado",
  nascimento: "Nascido na fazenda",
  entrada_pastoreio: "Entrada de pastoreio",
}

function paraTimestamp(dataIso: string): number {
  return new Date(`${dataIso}T00:00:00`).getTime()
}

export function AnimalDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: fazenda } = useFazendaAtual()
  const animalQuery = useAnimal(id)
  const pesagensQuery = usePesagens(id)
  const lotesQuery = useLotes(fazenda?.fazenda_id)
  const historicoLoteQuery = useHistoricoLoteAnimal(id)
  const saidaQuery = useSaidaAnimal(id)
  const vacinasQuery = useVacinasDoAnimal(id)

  if (animalQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando animal…</p>
  }

  if (animalQuery.isError || !animalQuery.data) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          to="/app/animais"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Voltar para Animais
        </Link>
        <p className="text-sm text-destructive">
          Erro ao carregar animal:{" "}
          {animalQuery.error instanceof Error
            ? animalQuery.error.message
            : "animal não encontrado"}
        </p>
      </div>
    )
  }

  const animal = animalQuery.data
  const lote = lotesQuery.data?.find((l) => l.id === animal.lote_id)

  // Gráfico de evolução do peso — ordem cronológica (o hook devolve desc,
  // mais recente primeiro, pensado pra tabela de histórico); um ponto por
  // pesagem real (cada linha de `pesagens` já é um marco que atualizou o
  // peso do animal, sem checkpoints sintéticos como no Painel Inteligente).
  const dadosEvolucaoPeso = [...(pesagensQuery.data ?? [])]
    .reverse()
    .map((pesagem) => ({
      timestamp: paraTimestamp(pesagem.data_evento),
      data: pesagem.data_evento,
      peso_kg: pesagem.peso_kg,
    }))

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/app/animais"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Voltar para Animais
      </Link>

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
              <dt className="text-xs text-muted-foreground">Tipo de animal</dt>
              <dd className="mt-1 text-sm">{animal.especie_nome ?? "—"}</dd>
            </div>
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
              <dd className="mt-1 text-sm">{formatIdade(animal.idade_meses)}</dd>
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
                  : `${formatNumero(animal.gmd_medio_kg, 1)} kg/dia`}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Última pesagem</dt>
              <dd className="mt-1 text-sm">{formatData(animal.ultima_pesagem_data)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Nº de pesagens</dt>
              <dd className="mt-1 text-sm">{formatNumero(animal.numero_pesagens)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rastreabilidade do animal</CardTitle>
          <CardDescription>
            De onde este animal veio — comprado, nascido na fazenda ou entrada de pastoreio.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <RastreabilidadeStepper
            entradaTipo={animal.origem_tipo_operacao}
            entradaData={animal.origem_data_operacao}
            entradaOutraParte={animal.origem_outra_parte}
            periodosLote={historicoLoteQuery.data ?? []}
            saida={saidaQuery.data}
          />

          {animal.transacao_origem_id ? (
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Tipo</dt>
                <dd className="mt-1 text-sm">
                  {origemLabels[animal.origem_tipo_operacao ?? ""] ?? "—"}
                </dd>
              </div>
              {animal.origem_tipo_operacao !== "nascimento" && (
                <div>
                  <dt className="text-xs text-muted-foreground">De quem</dt>
                  <dd className="mt-1 text-sm">{animal.origem_outra_parte ?? "—"}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-muted-foreground">Data de aquisição</dt>
                <dd className="mt-1 text-sm">{formatData(animal.origem_data_operacao)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Idade na aquisição</dt>
                <dd className="mt-1 text-sm">{formatIdade(animal.idade_meses_aquisicao)}</dd>
              </div>
              <div className="col-span-2 sm:col-span-4">
                <Link
                  to={`/app/financeiro/transacoes/${animal.transacao_origem_id}`}
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  Ver transação de origem
                </Link>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              Origem não rastreada — animal cadastrado antes deste recurso.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registrar pesagem</CardTitle>
          <CardDescription>
            Uma atualização com menos de 2 dias em relação à última pesagem,
            atualiza o registro mais recente em vez de criar um novo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegistrarPesagemForm animalId={animal.id} />
        </CardContent>
      </Card>

      {dadosEvolucaoPeso.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Evolução de peso</CardTitle>
            <CardDescription>
              Um marco para cada pesagem registrada no histórico abaixo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dadosEvolucaoPeso}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(ts: number) => formatData(new Date(ts).toISOString().slice(0, 10))}
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    stroke="var(--muted-foreground)"
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    stroke="var(--muted-foreground)"
                    tickFormatter={(value: number) => formatNumero(value)}
                  />
                  <Tooltip
                    labelFormatter={(ts) =>
                      typeof ts === "number" ? formatData(new Date(ts).toISOString().slice(0, 10)) : ""
                    }
                    formatter={(value) => [`${formatNumero(Number(value), 1)} kg`, "Peso"]}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="peso_kg"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

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
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pesagensQuery.data.map((pesagem) => (
                  <TableRow key={pesagem.id}>
                    <TableCell>{formatData(pesagem.data_evento)}</TableCell>
                    <TableCell>{formatPeso(pesagem.peso_kg)}</TableCell>
                    <TableCell className="text-right">
                      <ExcluirPesagemDialog
                        animalId={animal.id}
                        pesagemId={pesagem.id}
                        descricao={`${formatData(pesagem.data_evento)} — ${formatPeso(pesagem.peso_kg)}`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Controle sanitário</CardTitle>
          <CardDescription>
            Vacinas, datas de aplicação e próxima vacinação.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {vacinasQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          )}
          {vacinasQuery.data && vacinasQuery.data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma vacina registrada ainda.
            </p>
          )}
          {vacinasQuery.data && vacinasQuery.data.length > 0 && (
            <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {vacinasQuery.data.map((vacinacao) => (
                <VacinaDetalheDialog key={vacinacao.id} vacinacao={vacinacao} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
