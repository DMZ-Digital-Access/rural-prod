import { useEffect, useState } from "react"
import { PrinterIcon } from "lucide-react"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import { useEspecies } from "@/hooks/useEspecies"
import { useSaldoRebanho } from "@/hooks/useSaldoRebanho"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

function hojeISO() {
  return new Date().toISOString().slice(0, 10)
}

function formatData(data: string) {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
}

export function SaldoRebanhoPage() {
  const { data: fazenda } = useFazendaAtual()
  const especiesQuery = useEspecies()

  const [especieId, setEspecieId] = useState<string | null>(null)
  const [dataReferencia, setDataReferencia] = useState(hojeISO())

  const saldoQuery = useSaldoRebanho(fazenda?.fazenda_id, dataReferencia)

  // Seleciona a primeira espécie com movimentação real assim que os dados
  // carregam (senão a primeira do catálogo ativo, ordem alfabética) — evita
  // abrir sempre numa espécie sem nenhum dado quando o produtor só usa
  // outra. Espera as DUAS queries resolverem antes de decidir —
  // `especiesQuery` costuma responder mais rápido que a RPC de saldo, e
  // decidir cedo demais trava sempre na primeira espécie do catálogo em
  // ordem alfabética mesmo quando há saldo real em outra.
  useEffect(() => {
    if (especieId || !especiesQuery.data?.length || !saldoQuery.data) return
    const comMovimento = saldoQuery.data.find(
      (linha) => linha.qtd_registrada !== 0 || linha.qtd_pendente !== 0
    )
    setEspecieId(comMovimento?.especie_id ?? especiesQuery.data[0].id)
  }, [especieId, especiesQuery.data, saldoQuery.data])

  const especieNome =
    especiesQuery.data?.find((e) => e.id === especieId)?.nome ?? ""

  const linhas = (saldoQuery.data ?? [])
    .filter((linha) => linha.especie_id === especieId)
    .sort((a, b) => {
      // "Não classificado" sempre por último, resto na ordem que a RPC já
      // devolve (agrupamento_label, sexo).
      if (a.agrupamento_label === "Não classificado") return 1
      if (b.agrupamento_label === "Não classificado") return -1
      return a.agrupamento_label.localeCompare(b.agrupamento_label, "pt-BR")
    })

  const totalRegistrada = linhas.reduce((soma, l) => soma + l.qtd_registrada, 0)
  const totalPendente = linhas.reduce((soma, l) => soma + l.qtd_pendente, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">Saldo de Rebanho</h1>
          <p className="text-muted-foreground">
            Saldo calculado a partir das transações registradas, por espécie e data de corte.
          </p>
        </div>
        <Button variant="outline" onClick={() => window.print()}>
          <PrinterIcon />
          Imprimir Saldo
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:hidden">
        <div className="grid gap-1.5">
          <Label>Espécie</Label>
          <Select value={especieId ?? ""} onValueChange={setEspecieId}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v: string) => especiesQuery.data?.find((e) => e.id === v)?.nome ?? ""}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {especiesQuery.data?.map((especie) => (
                <SelectItem key={especie.id} value={especie.id}>
                  {especie.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label>Saldo referente à data</Label>
          <Input
            type="date"
            max={hojeISO()}
            value={dataReferencia}
            onChange={(e) => setDataReferencia(e.target.value)}
          />
        </div>
      </div>

      <div className="hidden print:block">
        <h1 className="text-xl font-semibold">Saldo de Rebanho — {especieNome}</h1>
        <p className="text-sm text-muted-foreground">
          Referente a {formatData(dataReferencia)}
        </p>
      </div>

      {saldoQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando saldo…</p>
      )}

      {saldoQuery.isError && (
        <p className="text-sm text-destructive">
          Erro ao carregar saldo:{" "}
          {saldoQuery.error instanceof Error ? saldoQuery.error.message : "erro desconhecido"}
        </p>
      )}

      {saldoQuery.data && especieId && linhas.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma faixa etária cadastrada para {especieNome || "esta espécie"}.
        </p>
      )}

      {linhas.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Faixa Etária</TableHead>
                <TableHead>Sexo</TableHead>
                <TableHead className="text-right">Qtd. Registrada</TableHead>
                <TableHead className="text-right">Qtd. Pendente</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((linha) => (
                <TableRow key={`${linha.agrupamento_etario_id ?? "nc"}-${linha.sexo}`}>
                  <TableCell>{linha.agrupamento_label}</TableCell>
                  <TableCell>{linha.sexo === "macho" ? "Macho" : "Fêmea"}</TableCell>
                  <TableCell className="text-right">{linha.qtd_registrada}</TableCell>
                  <TableCell className="text-right">{linha.qtd_pendente}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell colSpan={2}>Total</TableCell>
                <TableCell className="text-right">{totalRegistrada}</TableCell>
                <TableCell className="text-right">{totalPendente}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
