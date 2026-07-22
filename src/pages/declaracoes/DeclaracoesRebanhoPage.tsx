import { useState } from "react"
import { toast } from "sonner"
import { FileTextIcon } from "lucide-react"
import { useFazendaAtual } from "@/hooks/useFazendaAtual"
import { useEspecies } from "@/hooks/useEspecies"
import {
  useAbrirDocumentoDeclaracao,
  useDeclaracoesLista,
  type DeclaracoesFiltro,
} from "@/hooks/useDeclaracoesRebanho"
import {
  useAtualizarEstadoFazenda,
  useEstadoFazenda,
  usePrazoDeclaracao,
} from "@/hooks/useEstadoFazenda"
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
import { StatusDeclaracaoBadge } from "@/components/rebanho/StatusDeclaracaoBadge"
import { CriarDeclaracaoDialog } from "@/pages/declaracoes/CriarDeclaracaoDialog"
import { EditarDeclaracaoDialog } from "@/pages/declaracoes/EditarDeclaracaoDialog"
import { MarcarComoEnviadaDialog } from "@/pages/declaracoes/MarcarComoEnviadaDialog"

const SEM_FILTRO = "__todos__"
const SEM_UF = "__nenhuma__"
const ANO_ATUAL = new Date().getFullYear()

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]

function anosDisponiveis() {
  return Array.from({ length: 6 }, (_, i) => ANO_ATUAL - i)
}

function formatData(data: string | null) {
  if (!data) return "—"
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR")
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10)
}

function CardPrazoDeclaracao({
  fazendaId,
  somenteLeitura,
}: {
  fazendaId: string | undefined
  somenteLeitura: boolean
}) {
  const estadoQuery = useEstadoFazenda(fazendaId)
  const atualizarEstado = useAtualizarEstadoFazenda(fazendaId)
  const prazoQuery = usePrazoDeclaracao(estadoQuery.data, ANO_ATUAL)
  // Sentinela em vez de null/undefined — o Select precisa de um valor
  // definido desde o primeiro render pra nunca alternar entre
  // não-controlado/controlado (mesmo bug já visto em outras telas do
  // projeto: Base UI avisa "changing the uncontrolled value state").
  const [ufSelecionada, setUfSelecionada] = useState(SEM_UF)

  async function salvarEstado() {
    if (ufSelecionada === SEM_UF) return
    try {
      await atualizarEstado.mutateAsync(ufSelecionada)
      toast.success("Estado da fazenda atualizado.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar estado.")
    }
  }

  if (estadoQuery.isLoading) return null

  if (!estadoQuery.data) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm font-medium">Prazo regulatório de Declaração Anual</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Estado da fazenda não configurado — sem isso não é possível calcular o prazo
          vigente.
        </p>
        {!somenteLeitura && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="grid gap-1.5">
              <Label>Estado da fazenda (UF)</Label>
              <Select
                value={ufSelecionada}
                onValueChange={(v) => {
                  if (v) setUfSelecionada(v)
                }}
              >
                <SelectTrigger className="w-32">
                  <SelectValue>{(v: string) => (v === SEM_UF ? "Selecione" : v)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {UFS.map((uf) => (
                    <SelectItem key={uf} value={uf}>
                      {uf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              disabled={ufSelecionada === SEM_UF || atualizarEstado.isPending}
              onClick={salvarEstado}
            >
              Salvar estado
            </Button>
          </div>
        )}
      </div>
    )
  }

  const prazo = prazoQuery.data
  const hoje = hojeISO()
  let situacao: { label: string; className: string } | null = null

  if (prazo?.data_inicio_prazo && prazo?.data_fim_prazo) {
    if (hoje < prazo.data_inicio_prazo) {
      situacao = {
        label: "Fora do prazo (ainda não abriu)",
        className:
          "border-border bg-muted text-muted-foreground",
      }
    } else if (hoje <= prazo.data_fim_prazo) {
      situacao = {
        label: "Dentro do prazo",
        className:
          "border-orange-600/20 bg-orange-600/10 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-400",
      }
    } else {
      situacao = {
        label: "Prazo encerrado",
        className:
          "border-red-600/20 bg-red-600/10 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-400",
      }
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Prazo regulatório de Declaração Anual — {estadoQuery.data}/{ANO_ATUAL}
        </p>
        {situacao && (
          <Badge variant="outline" className={situacao.className}>
            {situacao.label}
          </Badge>
        )}
      </div>
      {prazo?.data_inicio_prazo && prazo?.data_fim_prazo ? (
        <p className="mt-1 text-sm text-muted-foreground">
          {formatData(prazo.data_inicio_prazo)} a {formatData(prazo.data_fim_prazo)}
          {prazo.origem === "padrao_rs" && " (padrão RS — nenhum prazo específico cadastrado)"}
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          Nenhum prazo cadastrado para {estadoQuery.data}/{ANO_ATUAL}.
        </p>
      )}
    </div>
  )
}

export function DeclaracoesRebanhoPage() {
  const { data: fazenda } = useFazendaAtual()
  const somenteLeitura = fazenda?.papel === "financeiro"
  const especiesQuery = useEspecies()

  const [filtro, setFiltro] = useState<DeclaracoesFiltro>({ especieId: null, ano: null })
  const declaracoesQuery = useDeclaracoesLista(fazenda?.fazenda_id, filtro)
  const abrirDocumento = useAbrirDocumentoDeclaracao()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Declaração Anual de Rebanho</h1>
          <p className="text-muted-foreground">
            Histórico de declarações enviadas à Secretaria Estadual de Agricultura, por
            espécie e ano.
          </p>
        </div>
        {!somenteLeitura && <CriarDeclaracaoDialog fazendaId={fazenda?.fazenda_id} />}
      </div>

      <CardPrazoDeclaracao fazendaId={fazenda?.fazenda_id} somenteLeitura={somenteLeitura} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>Espécie</Label>
          <Select
            value={filtro.especieId ?? SEM_FILTRO}
            onValueChange={(v) =>
              setFiltro((atual) => ({ ...atual, especieId: v === SEM_FILTRO ? null : v }))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v: string) =>
                  v === SEM_FILTRO
                    ? "Todas"
                    : (especiesQuery.data?.find((e) => e.id === v)?.nome ?? "Todas")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_FILTRO}>Todas</SelectItem>
              {especiesQuery.data?.map((especie) => (
                <SelectItem key={especie.id} value={especie.id}>
                  {especie.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label>Ano</Label>
          <Select
            value={filtro.ano ? String(filtro.ano) : SEM_FILTRO}
            onValueChange={(v) =>
              setFiltro((atual) => ({ ...atual, ano: v === SEM_FILTRO ? null : Number(v) }))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue>{(v: string) => (v === SEM_FILTRO ? "Todos" : v)}</SelectValue>
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
      </div>

      {declaracoesQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando declarações…</p>
      )}

      {declaracoesQuery.isError && (
        <p className="text-sm text-destructive">
          Erro ao carregar declarações:{" "}
          {declaracoesQuery.error instanceof Error
            ? declaracoesQuery.error.message
            : "erro desconhecido"}
        </p>
      )}

      {declaracoesQuery.data && declaracoesQuery.data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma declaração encontrada para os filtros selecionados.
        </p>
      )}

      {declaracoesQuery.data && declaracoesQuery.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Espécie</TableHead>
                <TableHead>Ano</TableHead>
                <TableHead className="hidden sm:table-cell">Data de referência</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Data de envio</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {declaracoesQuery.data.map((declaracao) => (
                <TableRow key={declaracao.id}>
                  <TableCell className="font-medium">{declaracao.especies.nome}</TableCell>
                  <TableCell>{declaracao.ano_referencia}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {formatData(declaracao.data_declaracao)}
                  </TableCell>
                  <TableCell className="text-right">
                    {declaracao.quantidade_declarada}
                  </TableCell>
                  <TableCell>
                    <StatusDeclaracaoBadge status={declaracao.status} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {formatData(declaracao.data_envio)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {declaracao.arquivo_pdf_path && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={abrirDocumento.isPending}
                          onClick={async () => {
                            try {
                              const url = await abrirDocumento.mutateAsync(
                                declaracao.arquivo_pdf_path as string
                              )
                              window.open(url, "_blank", "noopener,noreferrer")
                            } catch (error) {
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : "Erro ao abrir documento."
                              )
                            }
                          }}
                        >
                          <FileTextIcon />
                          Ver
                        </Button>
                      )}
                      {!somenteLeitura && (
                        <>
                          <EditarDeclaracaoDialog declaracao={declaracao} />
                          {declaracao.status === "pendente" && (
                            <MarcarComoEnviadaDialog
                              declaracaoId={declaracao.id}
                              fazendaId={fazenda?.fazenda_id}
                            />
                          )}
                        </>
                      )}
                    </div>
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
