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
import { useLotes } from "@/hooks/useLotes"
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

function formatPeso(kg: number | null) {
  return kg === null ? "—" : `${kg.toFixed(1)} kg`
}

function formatGmd(kg: number | null) {
  return kg === null ? "—" : `${kg.toFixed(1)} kg/dia`
}

/**
 * Comparativo de desempenho entre lotes (spec seção 5.1). Só considera
 * lotes com pelo menos 1 animal ativo — comparar peso/GMD de um lote vazio
 * não tem significado (métricas vêm como NULL de lotes_com_estatisticas).
 */
export function ComparativoPage() {
  const { data: fazenda } = useFazendaAtual()
  const lotesQuery = useLotes(fazenda?.fazenda_id)

  const lotesComparaveis = (lotesQuery.data ?? []).filter(
    (l) => l.numero_animais_ativos > 0
  )

  const dadosGrafico = lotesComparaveis.map((l) => ({
    nome: l.nome,
    peso_medio_kg: l.peso_medio_kg ?? 0,
    gmd_medio_kg: l.gmd_medio_kg ?? 0,
  }))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Comparativo entre lotes</h1>
        <p className="text-muted-foreground">
          Peso médio e GMD médio dos lotes com pelo menos um animal ativo.
        </p>
      </div>

      {lotesQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando lotes…</p>
      )}

      {lotesQuery.data && lotesComparaveis.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum lote com animais ativos para comparar ainda.
        </p>
      )}

      {lotesComparaveis.length > 0 && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Peso médio por lote</CardTitle>
                <CardDescription>kg, animais ativos</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dadosGrafico}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="var(--border)"
                      />
                      <XAxis
                        dataKey="nome"
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        stroke="var(--muted-foreground)"
                      />
                      <YAxis
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
                        formatter={(value) => [`${Number(value).toFixed(1)} kg`, "Peso médio"]}
                      />
                      <Bar
                        dataKey="peso_medio_kg"
                        fill="var(--chart-2)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>GMD médio por lote</CardTitle>
                <CardDescription>kg/dia, animais ativos</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dadosGrafico}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="var(--border)"
                      />
                      <XAxis
                        dataKey="nome"
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        stroke="var(--muted-foreground)"
                      />
                      <YAxis
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
                        formatter={(value) => [
                          `${Number(value).toFixed(3)} kg/dia`,
                          "GMD médio",
                        ]}
                      />
                      <Bar
                        dataKey="gmd_medio_kg"
                        fill="var(--chart-3)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Tabela comparativa</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lote</TableHead>
                      <TableHead>Animais ativos</TableHead>
                      <TableHead>Peso médio</TableHead>
                      <TableHead>GMD médio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lotesComparaveis.map((lote) => (
                      <TableRow key={lote.id}>
                        <TableCell className="font-medium">{lote.nome}</TableCell>
                        <TableCell>{lote.numero_animais_ativos}</TableCell>
                        <TableCell>{formatPeso(lote.peso_medio_kg)}</TableCell>
                        <TableCell>{formatGmd(lote.gmd_medio_kg)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
