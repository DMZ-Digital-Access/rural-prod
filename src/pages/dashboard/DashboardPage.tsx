import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { InfoIcon, SyringeIcon, TruckIcon, WeightIcon, ZapIcon } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { cn } from "@/lib/utils"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import { useAnimais } from "@/hooks/useAnimais"
import { useLotes } from "@/hooks/useLotes"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { StatusAnimal } from "@/lib/types/rebanho"

const GMD_INFO_TEXTO =
  "GMD significa Ganho Médio Diário. Na pecuária, é o indicador que mede quantos quilos o animal engorda por dia em média. É a principal métrica utilizada para avaliar a saúde nutricional do rebanho e a lucratividade das fases de recria e engorda."

const TODOS_OS_LOTES = "__todos__"

const statusLabels: Record<StatusAnimal, string> = {
  ativo: "Ativo",
  venda: "Vendido",
  morte: "Morte",
  baixa: "Baixa",
}

function StatTile({
  label,
  value,
  description,
  info,
}: {
  label: string
  value: string
  description?: string
  info?: string
}) {
  return (
    <Card className="relative">
      <CardContent className={cn("flex flex-col gap-1", info && "pr-8")}>
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </CardContent>
      {info && (
        <Dialog>
          <DialogTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-2 right-2 text-muted-foreground"
              />
            }
          >
            <InfoIcon />
            <span className="sr-only">Mais informações sobre {label}</span>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{label}</DialogTitle>
            </DialogHeader>
            <DialogDescription>{info}</DialogDescription>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  )
}

export function DashboardPage() {
  const { data: fazenda } = useFazendaAtual()
  const [loteFiltro, setLoteFiltro] = useState<string>(TODOS_OS_LOTES)

  const lotesQuery = useLotes(fazenda?.fazenda_id)
  const animaisQuery = useAnimais(
    fazenda?.fazenda_id,
    loteFiltro === TODOS_OS_LOTES ? undefined : loteFiltro
  )

  const stats = useMemo(() => {
    const animais = animaisQuery.data ?? []
    const ativos = animais.filter((a) => a.status === "ativo")

    // KPIs do topo escopados a Bovino (pedido de JP, 2026-07-23) — o filtro
    // de lote já vem aplicado antes, via `useAnimais(fazendaId, loteId)`, e
    // essas contas derivam de `animais` (já filtrado), então respeitam o
    // lote selecionado automaticamente.
    const ativosBovinos = ativos.filter((a) => a.especie_nome === "Bovino")
    const gmdsValidos = ativosBovinos
      .map((a) => a.gmd_medio_kg)
      .filter((v): v is number => v !== null)
    const pesosValidos = ativosBovinos
      .map((a) => a.peso_atual_kg)
      .filter((v): v is number => v !== null)

    const gmdMedioBovinos =
      gmdsValidos.length > 0
        ? gmdsValidos.reduce((acc, v) => acc + v, 0) / gmdsValidos.length
        : null
    const pesoMedioBovinos =
      pesosValidos.length > 0
        ? pesosValidos.reduce((acc, v) => acc + v, 0) / pesosValidos.length
        : null
    const pesoTotalBovinos =
      pesosValidos.length > 0 ? pesosValidos.reduce((acc, v) => acc + v, 0) : null

    const porStatus = animais.reduce(
      (acc, a) => {
        acc[a.status] = (acc[a.status] ?? 0) + 1
        return acc
      },
      {} as Record<StatusAnimal, number>
    )

    // Distribuição por Tipo de Animal (todas as espécies, só ativos) — ao
    // contrário da antiga distribuição por categoria (faixa etária), a
    // espécie já é conhecida mesmo pra animais pendentes de
    // individualização (atribuída na entrada em lote, independente da data
    // de nascimento), então nenhum animal ativo fica de fora daqui.
    const porTipoAnimalMap = ativos.reduce(
      (acc, a) => {
        const tipo = a.especie_nome ?? "Não classificado"
        acc[tipo] = (acc[tipo] ?? 0) + 1
        return acc
      },
      {} as Record<string, number>
    )
    const porTipoAnimal = Object.entries(porTipoAnimalMap).map(
      ([tipo, quantidade]) => ({ tipo, quantidade })
    )

    return {
      totalAnimais: animais.length,
      totalAtivosBovinos: ativosBovinos.length,
      gmdMedioBovinos,
      pesoMedioBovinos,
      pesoTotalBovinos,
      porStatus,
      porTipoAnimal,
    }
  }, [animaisQuery.data])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground">
            Visão geral do rebanho da fazenda.
          </p>
        </div>

        <Select
          value={loteFiltro}
          onValueChange={(v) => setLoteFiltro(v ?? TODOS_OS_LOTES)}
        >
          <SelectTrigger className="w-full sm:w-56">
            {/* Base UI (@base-ui/react/select) só resolve o rótulo do
                SelectItem correspondente depois que o popup já foi aberto
                pelo menos uma vez — antes disso, <SelectValue /> sem
                children mostra o `value` bruto ("__todos__"). A forma de
                render-prop evita depender desse comportamento, calculando
                o rótulo diretamente do estado da aplicação. */}
            <SelectValue>
              {(value: string) =>
                value === TODOS_OS_LOTES
                  ? "Todos os lotes"
                  : (lotesQuery.data?.find((lote) => lote.id === value)?.nome ??
                    "Todos os lotes")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS_OS_LOTES}>Todos os lotes</SelectItem>
            {(lotesQuery.data ?? []).map((lote) => (
              <SelectItem key={lote.id} value={lote.id}>
                {lote.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {fazenda?.papel !== "financeiro" && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Link
            to="/app/lancamento-rapido"
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/30 hover:bg-muted"
          >
            <ZapIcon className="size-6 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">Lançamento Rápido</p>
              <p className="text-sm text-muted-foreground">
                Registrar uma operação com animais ou uma despesa/receita geral.
              </p>
            </div>
          </Link>

          <Link
            to="/app/dia-pesagem"
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/30 hover:bg-muted"
          >
            <WeightIcon className="size-6 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">Dia de Pesagem</p>
              <p className="text-sm text-muted-foreground">
                Pesar vários animais em sequência rápida.
              </p>
            </div>
          </Link>

          <Link
            to="/app/dia-vacinacao"
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/30 hover:bg-muted"
          >
            <SyringeIcon className="size-6 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">Dia de Vacinação</p>
              <p className="text-sm text-muted-foreground">
                Registrar a vacinação de vários animais.
              </p>
            </div>
          </Link>

          <Link
            to="/app/dia-embarque"
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/30 hover:bg-muted"
          >
            <TruckIcon className="size-6 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">Dia de Embarque</p>
              <p className="text-sm text-muted-foreground">
                Registrar o embarque de vários animais.
              </p>
            </div>
          </Link>
        </div>
      )}

      {animaisQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando dados…</p>
      )}

      {animaisQuery.data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              label="Bovinos Ativos Hoje"
              value={String(stats.totalAtivosBovinos)}
            />
            <StatTile
              label="Peso médio bovinos ativos"
              value={
                stats.pesoMedioBovinos === null
                  ? "—"
                  : `${stats.pesoMedioBovinos.toFixed(1)} kg`
              }
            />
            <StatTile
              label="Peso total bovinos ativos"
              value={
                stats.pesoTotalBovinos === null
                  ? "—"
                  : `${stats.pesoTotalBovinos.toFixed(1)} kg`
              }
            />
            <StatTile
              label="GMD bovinos ativos"
              value={
                stats.gmdMedioBovinos === null
                  ? "—"
                  : `${stats.gmdMedioBovinos.toFixed(1)} kg/dia`
              }
              info={GMD_INFO_TEXTO}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Distribuição por status</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.totalAnimais === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem animais.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {(Object.keys(statusLabels) as StatusAnimal[]).map((status) => (
                      <li
                        key={status}
                        className="flex items-center justify-between text-sm"
                      >
                        <span>{statusLabels[status]}</span>
                        <span className="tabular-nums font-medium">
                          {stats.porStatus[status] ?? 0}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Distribuição por Tipo de Animal</CardTitle>
                <CardDescription>Só animais ativos.</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.porTipoAnimal.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sem animais ativos.
                  </p>
                ) : (
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.porTipoAnimal}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="var(--border)"
                        />
                        <XAxis
                          dataKey="tipo"
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
                        />
                        <Tooltip
                          cursor={{ fill: "var(--muted)" }}
                          contentStyle={{
                            background: "var(--popover)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            fontSize: 12,
                            color: "var(--popover-foreground)",
                          }}
                        />
                        <Bar
                          dataKey="quantidade"
                          fill="var(--chart-2)"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
