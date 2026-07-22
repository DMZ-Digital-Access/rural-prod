import { useState } from "react"
import { Link } from "react-router-dom"
import { DownloadIcon, FileTextIcon } from "lucide-react"
import { toast } from "sonner"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import {
  useAbrirDocumentoLancamento,
  useDocumentosFiscaisLista,
  type DocumentosFiscaisFiltro,
} from "@/hooks/useDocumentosFiscais"
import { supabase } from "@/lib/supabase"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TipoLancamentoBadge } from "@/components/rebanho/TipoLancamentoBadge"

const SEM_FILTRO = "__todos__"

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

function anosDisponiveis() {
  const anoAtual = new Date().getFullYear()
  return Array.from({ length: 6 }, (_, i) => anoAtual - i)
}

function formatMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatData(data: string) {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
}

export function DocumentosFiscaisPage() {
  const { data: fazenda } = useFazendaAtual()
  const [filtro, setFiltro] = useState<DocumentosFiscaisFiltro>({ ano: null, mes: null })
  const [gerandoZip, setGerandoZip] = useState(false)

  const lista = useDocumentosFiscaisLista(fazenda?.fazenda_id, filtro)
  const abrirDocumento = useAbrirDocumentoLancamento()

  function atualizarAno(v: string | null) {
    if (!v) return
    setFiltro({ ano: v === SEM_FILTRO ? null : Number(v), mes: null })
  }

  function atualizarMes(v: string | null) {
    if (!v) return
    setFiltro((atual) => ({ ...atual, mes: v === SEM_FILTRO ? null : Number(v) }))
  }

  async function baixarZipDoMes() {
    if (!filtro.ano || !filtro.mes || !fazenda?.fazenda_id) return
    setGerandoZip(true)
    try {
      const { data: sessao } = await supabase.auth.getSession()
      const token = sessao.session?.access_token
      if (!token) throw new Error("Sessão expirada — faça login novamente.")

      const resposta = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gerar-zip-lancamentos`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            fazenda_id: fazenda.fazenda_id,
            ano: filtro.ano,
            mes: filtro.mes,
          }),
        }
      )

      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null)
        throw new Error(corpo?.error ?? `Erro ao gerar ZIP (${resposta.status})`)
      }

      const blob = await resposta.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `documentos-fiscais-${filtro.ano}-${String(filtro.mes).padStart(2, "0")}.zip`
      link.click()
      URL.revokeObjectURL(url)
      toast.success("ZIP gerado com sucesso.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao gerar ZIP.")
    } finally {
      setGerandoZip(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Documentos Fiscais</h1>
        <p className="text-muted-foreground">
          Repositório de notas, boletos e recibos dos lançamentos financeiros — separado dos
          documentos de transações de pecuária (GTA/Nota/Contranota).
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-3">
          <div className="grid gap-1.5">
            <Label>Ano</Label>
            <Select value={filtro.ano ? String(filtro.ano) : SEM_FILTRO} onValueChange={atualizarAno}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue>
                  {(v: string) => (v === SEM_FILTRO ? "Todos" : v)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_FILTRO}>Todos</SelectItem>
                {anosDisponiveis().map((ano) => (
                  <SelectItem key={ano} value={String(ano)}>
                    {ano}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Mês</Label>
            <Select
              value={filtro.mes ? String(filtro.mes) : SEM_FILTRO}
              onValueChange={atualizarMes}
              disabled={!filtro.ano}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue>
                  {(v: string) => (v === SEM_FILTRO ? "Todos" : MESES[Number(v) - 1])}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_FILTRO}>Todos</SelectItem>
                {MESES.map((mes, i) => (
                  <SelectItem key={mes} value={String(i + 1)}>
                    {mes}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          variant="outline"
          disabled={!filtro.ano || !filtro.mes || gerandoZip}
          onClick={baixarZipDoMes}
          title={
            !filtro.ano || !filtro.mes
              ? "Selecione ano e mês para baixar o ZIP"
              : undefined
          }
        >
          <DownloadIcon />
          {gerandoZip ? "Gerando ZIP…" : "Baixar ZIP do mês"}
        </Button>
      </div>

      {lista.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando documentos…</p>
      )}

      {lista.isError && (
        <p className="text-sm text-destructive">
          Erro ao carregar documentos:{" "}
          {lista.error instanceof Error ? lista.error.message : "erro desconhecido"}
        </p>
      )}

      {lista.data && lista.data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum lançamento encontrado para o período selecionado.
        </p>
      )}

      {lista.data && lista.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="hidden sm:table-cell">Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Documento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.data.map((lancamento) => (
                <TableRow key={lancamento.id}>
                  <TableCell>
                    <Link
                      to={`/app/financeiro/lancamentos/${lancamento.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      <TipoLancamentoBadge tipo={lancamento.tipo} />
                    </Link>
                  </TableCell>
                  <TableCell>{formatData(lancamento.data_lancamento)}</TableCell>
                  <TableCell className="font-medium">{lancamento.categoria}</TableCell>
                  <TableCell className="hidden sm:table-cell">{lancamento.descricao}</TableCell>
                  <TableCell className="text-right">{formatMoeda(lancamento.valor)}</TableCell>
                  <TableCell>
                    {lancamento.arquivo_path ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={abrirDocumento.isPending}
                        onClick={async () => {
                          try {
                            const url = await abrirDocumento.mutateAsync(
                              lancamento.arquivo_path as string
                            )
                            window.open(url, "_blank", "noopener,noreferrer")
                          } catch (error) {
                            toast.error(
                              error instanceof Error ? error.message : "Erro ao abrir documento."
                            )
                          }
                        }}
                      >
                        <FileTextIcon />
                        Ver
                      </Button>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-orange-600/20 bg-orange-600/10 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-400"
                      >
                        Pendente
                      </Badge>
                    )}
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
