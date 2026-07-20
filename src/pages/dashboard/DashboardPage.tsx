import { useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { CategoriaAnimal, StatusAnimal } from "@/lib/types/rebanho"

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
}: {
  label: string
  value: string
  description?: string
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </CardContent>
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
    const gmdsValidos = ativos
      .map((a) => a.gmd_medio_kg)
      .filter((v): v is number => v !== null)
    const pesosValidos = ativos
      .map((a) => a.peso_atual_kg)
      .filter((v): v is number => v !== null)

    const gmdMedioGeral =
      gmdsValidos.length > 0
        ? gmdsValidos.reduce((acc, v) => acc + v, 0) / gmdsValidos.length
        : null
    const pesoMedioGeral =
      pesosValidos.length > 0
        ? pesosValidos.reduce((acc, v) => acc + v, 0) / pesosValidos.length
        : null

    const porStatus = animais.reduce(
      (acc, a) => {
        acc[a.status] = (acc[a.status] ?? 0) + 1
        return acc
      },
      {} as Record<StatusAnimal, number>
    )

    const porCategoriaMap = ativos.reduce(
      (acc, a) => {
        acc[a.categoria] = (acc[a.categoria] ?? 0) + 1
        return acc
      },
      {} as Record<CategoriaAnimal, number>
    )
    const porCategoria = Object.entries(porCategoriaMap).map(
      ([categoria, quantidade]) => ({ categoria, quantidade })
    )

    return {
      totalAnimais: animais.length,
      totalAtivos: ativos.length,
      gmdMedioGeral,
      pesoMedioGeral,
      porStatus,
      porCategoria,
    }
  }, [animaisQuery.data])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
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
          <SelectTrigger className="w-56">
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

      {animaisQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando dados…</p>
      )}

      {animaisQuery.data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Animais ativos" value={String(stats.totalAtivos)} />
            <StatTile
              label="Animais (todos os status)"
              value={String(stats.totalAnimais)}
            />
            <StatTile
              label="Peso médio (ativos)"
              value={
                stats.pesoMedioGeral === null
                  ? "—"
                  : `${stats.pesoMedioGeral.toFixed(1)} kg`
              }
            />
            <StatTile
              label="GMD médio (ativos)"
              value={
                stats.gmdMedioGeral === null
                  ? "—"
                  : `${stats.gmdMedioGeral.toFixed(3)} kg/dia`
              }
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
                <CardTitle>Distribuição por categoria</CardTitle>
                <CardDescription>Só animais ativos.</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.porCategoria.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sem animais ativos.
                  </p>
                ) : (
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.porCategoria}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="var(--border)"
                        />
                        <XAxis
                          dataKey="categoria"
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
